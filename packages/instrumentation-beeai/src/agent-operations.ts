/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { trace, type Context } from '@opentelemetry/api';
import {
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
  type LocalAgentInvocation,
  type TelemetryHandler,
  type ToolInvocation,
} from '@opentelemetry/genai-util';
import type { ActiveAgentRun, RunOperationSpec } from './internal-types';
import {
  hasLangChainNamespace,
  isLangChainDelegatedModel,
} from './model-operations';
import {
  extractAgentInput,
  extractAgentOutputMessages,
  extractAgentRequestOptions,
  extractTokenUsage,
  extractToolResult,
  isRecord,
  ownDataValue,
} from './utils';

/**
 * Builds the `Run` lifecycle specification for `BaseAgent` executions,
 * tracking `success` events and aggregated token usage.
 */
export function createAgentOperationSpec(): RunOperationSpec<LocalAgentInvocation> {
  return {
    label: 'agent',
    isolatesAgentScope: true,
    startSyncInvocation: (handler, instance, inputArg, callerCtx) => {
      if (isRemoteAgent(instance)) {
        return undefined;
      }
      return startAgentInvocation(handler, instance, inputArg, callerCtx);
    },
    startRun: ({
      handler,
      instance,
      effectiveInput,
      parentContext,
      callerContext,
      runId,
      parentId,
      runContext,
    }) => {
      if (isRemoteAgent(instance)) {
        return undefined;
      }
      const metadata = extractAgentMetadata(instance);
      const agentInput = isRecord(instance)
        ? ownDataValue(instance, 'input')
        : undefined;
      const configuredLlm = isRecord(agentInput) ? agentInput.llm : undefined;
      const invocation = startAgentInvocation(
        handler,
        instance,
        effectiveInput,
        parentContext,
        metadata
      );
      const activeRecord: ActiveAgentRun | undefined = runId
        ? {
            kind: 'agent',
            runId,
            parentId,
            invocation,
            agentName: metadata.agentName,
            llm: configuredLlm,
            callerSpan: trace.getSpan(callerContext),
          }
        : undefined;

      let eventMessage: { role: string; text: string } | undefined;
      let unsubscribe: (() => void) | void = undefined;
      try {
        unsubscribe = runContext?.emitter?.match?.(
          event => event?.name === 'success',
          (data: unknown) => {
            try {
              eventMessage = extractSuccessEventMessage(data) ?? eventMessage;
            } catch {
              // Ignore event extraction errors
            }
          }
        );
      } catch {
        // Ignore listener registration errors
      }

      const cleanupFn =
        typeof unsubscribe === 'function' ? unsubscribe : undefined;

      return {
        invocation,
        activeRun: activeRecord,
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
          finalizeAgentInvocation(
            invocation,
            result,
            activeRecord,
            eventMessage
          );
        },
        onFailure: () => {
          if (
            activeRecord &&
            (activeRecord.inputTokens !== undefined ||
              activeRecord.outputTokens !== undefined)
          ) {
            invocation.setUsage({
              inputTokenCount: activeRecord.inputTokens,
              outputTokenCount: activeRecord.outputTokens,
            });
          }
        },
      };
    },
  };
}

/**
 * Starts a `LocalAgentInvocation` span with agent metadata, configured model
 * options, and optional input messages and system instructions.
 */
function startAgentInvocation(
  handler: TelemetryHandler,
  agentInstance: unknown,
  inputArg: unknown,
  parentContext: Context,
  metadata = extractAgentMetadata(agentInstance)
): LocalAgentInvocation {
  const { agentName, agentDescription } = metadata;

  const agentInput = isRecord(agentInstance)
    ? ownDataValue(agentInstance, 'input')
    : undefined;
  const llm = isRecord(agentInput) ? agentInput.llm : undefined;
  let requestModel: string | undefined;
  if (isRecord(llm)) {
    if (isLangChainDelegatedModel(llm)) {
      const lcLLM = ownDataValue(llm, 'lcLLM');
      const candidate = isRecord(lcLLM)
        ? (ownDataValue(lcLLM, 'model') ?? ownDataValue(lcLLM, 'modelName'))
        : undefined;
      if (typeof candidate === 'string' && candidate.trim()) {
        requestModel = candidate.trim();
      }
    } else {
      try {
        if (typeof llm.modelId === 'string' && llm.modelId.trim()) {
          requestModel = llm.modelId.trim();
        }
      } catch {
        // Ignore getter errors on custom ChatModel implementations
      }
    }
  }
  const requestOptions = isRecord(llm)
    ? extractAgentRequestOptions(llm.parameters)
    : undefined;

  const shouldCapture = handler.shouldCaptureContent();
  const { inputMessages, systemInstructions } = shouldCapture
    ? extractAgentInput(agentInstance, inputArg)
    : { inputMessages: undefined, systemInstructions: undefined };

  return handler.startLocalAgent({
    operationName: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
    agentName,
    agentDescription,
    requestModel,
    requestOptions,
    inputMessages:
      inputMessages && inputMessages.length > 0 ? inputMessages : undefined,
    systemInstructions:
      systemInstructions && systemInstructions.length > 0
        ? systemInstructions
        : undefined,
    trackInferenceCalls: true,
    trackToolCalls: true,
    parentContext,
  });
}

/**
 * Records aggregated token usage and optional output messages on a completed
 * `LocalAgentInvocation`.
 */
function finalizeAgentInvocation(
  invocation: LocalAgentInvocation,
  result: unknown,
  activeRecord: ActiveAgentRun | undefined,
  eventMessage: { role: string; text: string } | undefined
): void {
  if (
    activeRecord &&
    (activeRecord.inputTokens !== undefined ||
      activeRecord.outputTokens !== undefined)
  ) {
    invocation.setUsage({
      inputTokenCount: activeRecord.inputTokens,
      outputTokenCount: activeRecord.outputTokens,
    });
  } else if (isRecord(result) && Array.isArray(result.iterations)) {
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    for (const iter of result.iterations) {
      if (isRecord(iter) && isRecord(iter.raw)) {
        const usage = extractTokenUsage(iter.raw.usage);
        if (usage) {
          if (usage.inputTokenCount !== undefined) {
            inputTokens = (inputTokens ?? 0) + usage.inputTokenCount;
          }
          if (usage.outputTokenCount !== undefined) {
            outputTokens = (outputTokens ?? 0) + usage.outputTokenCount;
          }
        }
      }
    }
    if (inputTokens !== undefined || outputTokens !== undefined) {
      invocation.setUsage({
        inputTokenCount: inputTokens,
        outputTokenCount: outputTokens,
      });
    }
  }

  if (invocation.shouldCaptureContent()) {
    const outputMessages = extractAgentOutputMessages(result, eventMessage);
    if (outputMessages.length > 0) {
      invocation.addOutputMessages(outputMessages);
    }
  }
}

/**
 * Builds the `Run` lifecycle specification for `Tool` executions, skipping
 * internal `final_answer` calls and LangChain delegation wrappers while
 * attributing calls to any enclosing agent.
 */
export function createToolOperationSpec(): RunOperationSpec<ToolInvocation> {
  return {
    label: 'tool',
    isolatesAgentScope: true,
    startSyncInvocation: (handler, instance, inputArg, callerCtx) =>
      isLangChainDelegatedTool(instance)
        ? undefined
        : startToolInvocation(
            handler,
            instance,
            inputArg,
            undefined,
            undefined,
            callerCtx
          ),
    startRun: ({
      handler,
      instance,
      effectiveInput,
      parentContext,
      callerContext,
      runId,
      parentId,
      parentRun,
      runContext,
      enclosingAgent,
    }) => {
      if (isInternalFinalAnswerTool(instance, enclosingAgent)) {
        return undefined;
      }
      // Delegate tool span/metric emission to @opentelemetry/instrumentation-langchain
      // for LangChainTool wrappers while still counting the tool call on any
      // enclosing BeeAI agent.
      if (isLangChainDelegatedTool(instance)) {
        if (parentRun?.kind !== 'tool') {
          enclosingAgent?.invocation.recordToolCall();
        }
        return undefined;
      }
      const rawContext = runContext?.context;
      const toolCallMsg = isRecord(rawContext)
        ? rawContext.toolCallMsg
        : undefined;
      const toolCallId =
        isRecord(toolCallMsg) &&
        typeof toolCallMsg.toolCallId === 'string' &&
        toolCallMsg.toolCallId.trim()
          ? toolCallMsg.toolCallId.trim()
          : undefined;

      const invocation = startToolInvocation(
        handler,
        instance,
        effectiveInput,
        toolCallId,
        enclosingAgent?.agentName,
        parentContext
      );

      if (parentRun?.kind !== 'tool') {
        enclosingAgent?.invocation.recordToolCall();
      }

      return {
        invocation,
        activeRun: runId
          ? {
              kind: 'tool',
              runId,
              parentId,
              invocation,
              callerSpan: trace.getSpan(callerContext),
            }
          : undefined,
        onSuccess: result => {
          if (invocation.shouldCaptureContent() && result !== undefined) {
            const extracted = extractToolResult(result);
            if (extracted !== undefined) {
              invocation.setResult(extracted);
            }
          }
        },
      };
    },
  };
}

/**
 * Starts a `ToolInvocation` span with tool metadata, call ID, enclosing agent
 * name, and optional arguments.
 */
function startToolInvocation(
  handler: TelemetryHandler,
  toolInstance: unknown,
  inputArg: unknown,
  toolCallId: string | undefined,
  agentName: string | undefined,
  parentContext: Context
): ToolInvocation {
  const toolName =
    isRecord(toolInstance) &&
    typeof toolInstance.name === 'string' &&
    toolInstance.name.trim()
      ? toolInstance.name.trim()
      : ((toolInstance as { constructor?: { name?: string } })?.constructor
          ?.name ?? 'unknown_tool');
  const toolDescription =
    isRecord(toolInstance) &&
    typeof toolInstance.description === 'string' &&
    toolInstance.description.trim()
      ? toolInstance.description.trim()
      : undefined;

  return handler.startTool({
    operationName: GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
    toolName,
    toolDescription,
    toolType: GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
    toolCallId,
    agentName,
    toolArguments:
      handler.shouldCaptureContent() &&
      inputArg !== null &&
      inputArg !== undefined
        ? inputArg
        : undefined,
    parentContext,
  });
}

/**
 * Extracts `agentName` and `agentDescription` from a BeeAI agent instance,
 * tolerating custom `meta` getters that may throw.
 */
function extractAgentMetadata(agentInstance: unknown): {
  agentName?: string;
  agentDescription?: string;
} {
  let meta: Record<string, unknown> | undefined;
  if (isRecord(agentInstance)) {
    try {
      const rawMeta = agentInstance.meta;
      if (isRecord(rawMeta)) {
        meta = rawMeta;
      }
    } catch {
      // Ignore getter errors on custom agent implementations
    }
  }
  const agentName =
    typeof meta?.name === 'string' && meta.name.trim()
      ? meta.name.trim()
      : isRecord(agentInstance) &&
          typeof agentInstance.name === 'string' &&
          agentInstance.name.trim()
        ? agentInstance.name.trim()
        : (agentInstance as { constructor?: { name?: string } })?.constructor
            ?.name;
  const agentDescription =
    typeof meta?.description === 'string' && meta.description.trim()
      ? meta.description.trim()
      : undefined;
  return { agentName, agentDescription };
}

/**
 * Extracts the final assistant message role and text from a BeeAI agent
 * `success` event payload.
 */
function extractSuccessEventMessage(
  data: unknown
): { role: string; text: string } | undefined {
  if (!isRecord(data)) return undefined;
  if (isRecord(data.data) && typeof data.data.text === 'string') {
    return {
      role: typeof data.data.role === 'string' ? data.data.role : 'assistant',
      text: data.data.text,
    };
  }
  if (
    isRecord(data.state) &&
    isRecord(data.state.result) &&
    typeof data.state.result.text === 'string'
  ) {
    return {
      role:
        typeof data.state.result.role === 'string'
          ? data.state.result.role
          : 'assistant',
      text: data.state.result.text,
    };
  }
  return undefined;
}

/**
 * Identifies BeeAI's internal `final_answer` control-flow tool within an agent
 * run so it is excluded from user tool telemetry.
 */
function isInternalFinalAnswerTool(
  toolInstance: unknown,
  enclosingAgent: ActiveAgentRun | undefined
): boolean {
  if (!enclosingAgent || !isRecord(toolInstance)) {
    return false;
  }
  return (
    toolInstance.name === 'final_answer' &&
    toolInstance.description === 'Sends the final answer to the user'
  );
}

/**
 * Identifies BeeAI's experimental `RemoteAgent` (`beeai-framework/agents/experimental/remote/agent`),
 * which invokes an out-of-process ACP agent over HTTP rather than executing in-process.
 */
function isRemoteAgent(agentInstance: unknown): boolean {
  if (!isRecord(agentInstance)) {
    return false;
  }
  const emitter = ownDataValue(agentInstance, 'emitter');
  const namespace = isRecord(emitter)
    ? ownDataValue(emitter, 'namespace')
    : undefined;
  if (
    Array.isArray(namespace) &&
    namespace[0] === 'agent' &&
    namespace[1] === 'remote'
  ) {
    return true;
  }
  const input = ownDataValue(agentInstance, 'input');
  const client = ownDataValue(agentInstance, 'client');
  return (
    (agentInstance as { constructor?: { name?: string } }).constructor?.name ===
      'RemoteAgent' &&
    isRecord(input) &&
    typeof input.url === 'string' &&
    isRecord(client)
  );
}

/**
 * Identifies BeeAI's `LangChainTool` adapter (`beeai-framework/adapters/langchain/tools`),
 * which delegates execution directly to `@langchain/core/tools`.
 */
function isLangChainDelegatedTool(toolInstance: unknown): boolean {
  if (!isRecord(toolInstance)) {
    return false;
  }
  const wrappedTool = ownDataValue(toolInstance, 'tool');
  return (
    isRecord(wrappedTool) &&
    typeof wrappedTool.invoke === 'function' &&
    (hasLangChainNamespace(toolInstance) ||
      (toolInstance as { constructor?: { name?: string } }).constructor
        ?.name === 'LangChainTool')
  );
}
