/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { trace, type Context } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_OUTPUT_TYPE,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
  type EmbeddingInvocation,
  type FinishReason,
  type InferenceInvocation,
  type TelemetryHandler,
} from '@opentelemetry/genai-util';
import type { ActiveAgentRun, RunOperationSpec } from './internal-types';
import {
  extractInferenceRequestOptions,
  extractMessagesAndSystemInstructions,
  extractOutputMessages,
  extractTokenUsage,
  isRecord,
  mapFinishReason,
  mapProviderName,
  ownDataValue,
} from './utils';

/**
 * Checks whether a BeeAI instance's emitter namespace includes `'langchain'`.
 */
export function hasLangChainNamespace(
  instance: Record<string, unknown>
): boolean {
  const emitter = ownDataValue(instance, 'emitter');
  const namespace = isRecord(emitter)
    ? ownDataValue(emitter, 'namespace')
    : undefined;
  return Array.isArray(namespace) && namespace.includes('langchain');
}

/**
 * Identifies BeeAI's `LangChainChatModel` and `LangChainEmbeddingModel` adapters
 * (`beeai-framework/adapters/langchain/backend/*`), which delegate model calls
 * to `@langchain/core` and report `providerId === 'langchain'`.
 */
export function isLangChainDelegatedModel(modelInstance: unknown): boolean {
  if (!isRecord(modelInstance)) {
    return false;
  }
  if (
    ownDataValue(modelInstance, 'lcLLM') !== undefined ||
    ownDataValue(modelInstance, 'lcEmbedding') !== undefined ||
    hasLangChainNamespace(modelInstance)
  ) {
    return true;
  }
  try {
    return (
      typeof modelInstance.providerId === 'string' &&
      modelInstance.providerId.trim().toLowerCase() === 'langchain'
    );
  } catch {
    return false;
  }
}

/**
 * Builds the `Run` lifecycle specification for standard or structured
 * `ChatModel` calls, attaching `newToken` listeners when streaming.
 */
export function createChatOperationSpec(
  isStructured: boolean
): RunOperationSpec<InferenceInvocation> {
  return {
    label: 'chat model',
    startSyncInvocation: (handler, instance, inputArg, callerCtx) =>
      isLangChainDelegatedModel(instance)
        ? undefined
        : startChatInvocation(
            handler,
            instance,
            inputArg,
            isStructured,
            callerCtx
          ).invocation,
    startRun: ({
      handler,
      instance,
      effectiveInput,
      parentContext,
      callerContext,
      runId,
      parentId,
      runContext,
      enclosingAgent,
    }) => {
      const targetAgent =
        enclosingAgent &&
        (!enclosingAgent.llm || enclosingAgent.llm === instance)
          ? enclosingAgent
          : undefined;
      // Skip BeeAI client inference spans/metrics for LangChainChatModel
      // wrappers: downstream LangChain/provider instrumentations own the
      // model call, and `"langchain"` is not a GenAI provider name.
      if (isLangChainDelegatedModel(instance)) {
        targetAgent?.invocation.recordInferenceCall();
        return undefined;
      }
      const { invocation, isStreaming, coalesceOutputMessages } =
        startChatInvocation(
          handler,
          instance,
          effectiveInput,
          isStructured,
          parentContext
        );

      targetAgent?.invocation.recordInferenceCall();

      let unsubscribe: (() => void) | void = undefined;
      let lastChunkFinishReason: FinishReason | undefined = undefined;
      if (isStreaming) {
        try {
          unsubscribe = runContext?.emitter?.on?.(
            'newToken',
            (event: unknown) => {
              try {
                invocation.recordStreamChunk();
                if (isRecord(event) && isRecord(event.value)) {
                  const chunkReason = mapFinishReason(event.value.finishReason);
                  if (chunkReason) {
                    lastChunkFinishReason = chunkReason;
                  }
                }
              } catch {
                // Ignore chunk recording errors
              }
            }
          );
        } catch {
          // Ignore listener registration errors
        }
      }

      const cleanupFn =
        typeof unsubscribe === 'function' ? unsubscribe : undefined;

      return {
        invocation,
        activeRun: runId
          ? {
              kind: 'inference',
              runId,
              parentId,
              invocation,
              callerSpan: trace.getSpan(callerContext),
            }
          : undefined,
        cleanup: cleanupFn
          ? () => {
              try {
                cleanupFn();
              } catch {
                // Ignore listener cleanup errors
              }
            }
          : undefined,
        onSuccess: result => {
          finalizeChatInvocation(
            invocation,
            result,
            isStructured,
            targetAgent,
            lastChunkFinishReason,
            coalesceOutputMessages
          );
        },
      };
    },
  };
}

/**
 * Starts an `InferenceInvocation` span for a `ChatModel` request and computes
 * streaming and output-message coalescing flags for finalization.
 *
 * `coalesceOutputMessages` is `true` for streaming calls (where
 * `ChatModelOutput.fromChunks` emits one `AssistantMessage` per token) and
 * single-choice (`n <= 1` or unset) calls (where adapters such as
 * `WatsonxChatModel` split a single choice's text and tool calls into
 * separate `AssistantMessage` instances), and `false` on non-streaming
 * multi-choice (`n > 1`) calls so each candidate remains a distinct
 * `OutputMessage` per GenAI semantic conventions.
 */
function startChatInvocation(
  handler: TelemetryHandler,
  chatModelInstance: unknown,
  inputArg: unknown,
  isStructured: boolean,
  parentContext: Context
): {
  invocation: InferenceInvocation;
  isStreaming: boolean;
  coalesceOutputMessages: boolean;
} {
  const providerName = mapProviderName(
    isRecord(chatModelInstance) ? chatModelInstance.providerId : undefined
  );
  const requestModel =
    isRecord(chatModelInstance) &&
    typeof chatModelInstance.modelId === 'string' &&
    chatModelInstance.modelId.trim()
      ? chatModelInstance.modelId.trim()
      : undefined;
  const modelParams = isRecord(chatModelInstance)
    ? chatModelInstance.parameters
    : undefined;
  const isStreaming =
    !isStructured &&
    Boolean(
      (isRecord(inputArg) ? inputArg.stream : undefined) ??
        (isRecord(modelParams) ? modelParams.stream : undefined)
    );

  const requestOptions = extractInferenceRequestOptions(
    modelParams,
    inputArg,
    isStreaming
  );
  const coalesceOutputMessages =
    isStreaming ||
    requestOptions.choiceCount === undefined ||
    requestOptions.choiceCount <= 1;

  const shouldCapture = handler.shouldCaptureContent();
  const rawMessages = isRecord(inputArg) ? inputArg.messages : undefined;
  const { inputMessages, systemInstructions } = shouldCapture
    ? extractMessagesAndSystemInstructions(rawMessages)
    : { inputMessages: undefined, systemInstructions: undefined };

  const hasJsonOutput =
    isStructured ||
    (isRecord(inputArg) && inputArg.responseFormat !== undefined);

  const invocation = handler.startInference({
    operationName: GEN_AI_OPERATION_NAME_VALUE_CHAT,
    providerName,
    requestModel,
    requestOptions,
    inputMessages:
      inputMessages && inputMessages.length > 0 ? inputMessages : undefined,
    systemInstructions:
      systemInstructions && systemInstructions.length > 0
        ? systemInstructions
        : undefined,
    attributes: hasJsonOutput
      ? { [ATTR_GEN_AI_OUTPUT_TYPE]: GEN_AI_OUTPUT_TYPE_VALUE_JSON }
      : undefined,
    parentContext,
  });

  return { invocation, isStreaming, coalesceOutputMessages };
}

/**
 * Populates response ID, token usage (rolling up into any enclosing agent),
 * finish reason, and output messages on a completed `InferenceInvocation`.
 *
 * @param invocation - Active inference telemetry invocation to populate.
 * @param result - Raw `ChatModelOutput` (or `{ object, output }` for
 *   `createStructure`) returned by the model.
 * @param isStructured - Whether the call originated from `createStructure`.
 * @param enclosingAgent - Enclosing agent run record for token roll-up, if any.
 * @param lastChunkFinishReason - Fallback finish reason captured from stream
 *   chunks when a trailing usage-only chunk omits `finishReason`.
 * @param coalesceOutputMessages - Whether consecutive same-role messages in
 *   `chatOutput.messages` should be merged into a single `OutputMessage`
 *   (`true` for streaming chunks and `n <= 1` split single-choice segments;
 *   `false` for non-streaming `n > 1` multi-choice candidates).
 */
function finalizeChatInvocation(
  invocation: InferenceInvocation,
  result: unknown,
  isStructured: boolean,
  enclosingAgent: ActiveAgentRun | undefined,
  lastChunkFinishReason?: FinishReason,
  coalesceOutputMessages = true
): void {
  const chatOutput =
    isStructured && isRecord(result) && isRecord(result.output)
      ? result.output
      : result;
  const structuredObject =
    isStructured && isRecord(result) ? result.object : undefined;

  if (isRecord(chatOutput)) {
    const messages = chatOutput.messages;
    if (Array.isArray(messages) && messages.length > 0) {
      const firstMsg = messages[0];
      if (isRecord(firstMsg)) {
        const responseId =
          typeof firstMsg.id === 'string' && firstMsg.id.trim()
            ? firstMsg.id.trim()
            : isRecord(firstMsg.meta) &&
                typeof firstMsg.meta.id === 'string' &&
                firstMsg.meta.id.trim()
              ? firstMsg.meta.id.trim()
              : undefined;
        if (responseId) {
          invocation.setResponseId(responseId);
        }
      }
    }

    const usage = extractTokenUsage(chatOutput.usage);
    if (usage) {
      invocation.setUsage(usage);
      if (enclosingAgent) {
        if (usage.inputTokenCount !== undefined) {
          enclosingAgent.inputTokens =
            (enclosingAgent.inputTokens ?? 0) + usage.inputTokenCount;
        }
        if (usage.outputTokenCount !== undefined) {
          enclosingAgent.outputTokens =
            (enclosingAgent.outputTokens ?? 0) + usage.outputTokenCount;
        }
      }
    }

    const finishReason: FinishReason | undefined =
      mapFinishReason(chatOutput.finishReason) ?? lastChunkFinishReason;
    const shouldCaptureContent = invocation.shouldCaptureContent();
    // Normally we only parse `chatOutput.messages` when content capture is enabled.
    // We also parse them when multiple choices were requested (`n > 1`, so
    // `coalesceOutputMessages` is false) so we know how many responses the model
    // returned when building `finish_reasons` below.
    const outputMessages =
      shouldCaptureContent ||
      (!coalesceOutputMessages && finishReason !== undefined)
        ? extractOutputMessages(
            messages,
            structuredObject,
            coalesceOutputMessages
          )
        : undefined;

    if (finishReason) {
      // BeeAI provides one overall `finishReason` for the call, whereas OpenTelemetry
      // expects one entry per returned choice (e.g. `['stop', 'stop']` when `n: 2`).
      // If `setFinishReasons` has fewer entries than `outputMessages`, `genai-util`
      // fills the missing entries with `'error'`.
      const choiceCount =
        !coalesceOutputMessages && outputMessages && outputMessages.length > 1
          ? outputMessages.length
          : 1;
      invocation.setFinishReasons(
        Array.from({ length: choiceCount }, () => finishReason)
      );
    }

    // Only record the message text/parts on the span when content capture is enabled.
    if (shouldCaptureContent && outputMessages && outputMessages.length > 0) {
      invocation.addOutputMessages(outputMessages);
    }
  }
}

/**
 * Builds the `Run` lifecycle specification for `EmbeddingModel` calls,
 * recording vector dimensions and token usage upon completion.
 */
export function createEmbeddingOperationSpec(): RunOperationSpec<EmbeddingInvocation> {
  return {
    label: 'embedding',
    startSyncInvocation: (handler, instance, _inputArg, callerCtx) =>
      isLangChainDelegatedModel(instance)
        ? undefined
        : startEmbeddingInvocation(handler, instance, callerCtx),
    startRun: ({
      handler,
      instance,
      parentContext,
      callerContext,
      runId,
      parentId,
    }) => {
      if (isLangChainDelegatedModel(instance)) {
        return undefined;
      }
      const invocation = startEmbeddingInvocation(
        handler,
        instance,
        parentContext
      );

      return {
        invocation,
        activeRun: runId
          ? {
              kind: 'embedding',
              runId,
              parentId,
              invocation,
              callerSpan: trace.getSpan(callerContext),
            }
          : undefined,
        onSuccess: result => {
          if (!isRecord(result)) return;
          if (
            Array.isArray(result.embeddings) &&
            result.embeddings.length > 0 &&
            Array.isArray(result.embeddings[0]) &&
            result.embeddings[0].length > 0
          ) {
            invocation.setDimensionCount(result.embeddings[0].length);
          }
          if (
            isRecord(result.usage) &&
            typeof result.usage.tokens === 'number' &&
            Number.isFinite(result.usage.tokens)
          ) {
            invocation.setUsage(result.usage.tokens);
          }
        },
      };
    },
  };
}

/**
 * Starts an `EmbeddingInvocation` span with provider and model metadata.
 */
function startEmbeddingInvocation(
  handler: TelemetryHandler,
  embeddingModelInstance: unknown,
  parentContext: Context
): EmbeddingInvocation {
  const providerName = mapProviderName(
    isRecord(embeddingModelInstance)
      ? embeddingModelInstance.providerId
      : undefined
  );
  const requestModel =
    isRecord(embeddingModelInstance) &&
    typeof embeddingModelInstance.modelId === 'string' &&
    embeddingModelInstance.modelId.trim()
      ? embeddingModelInstance.modelId.trim()
      : undefined;

  return handler.startEmbedding({
    operationName: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
    providerName,
    requestModel,
    parentContext,
  });
}
