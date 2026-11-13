/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  trace,
  type Context,
  type MeterProvider,
  type Span,
  type TracerProvider,
} from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import {
  ATTR_GEN_AI_OUTPUT_TYPE,
  GEN_AI_FINISH_REASON_VALUE_STOP,
  GEN_AI_FINISH_REASON_VALUE_TOOL_CALL,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
  GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
  TelemetryHandler,
  type EmbeddingInvocation,
  type FinishReason,
  type InferenceInvocation,
  type LocalAgentInvocation,
  type ToolInvocation,
} from '@opentelemetry/genai-util';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import type { BaseAgent } from 'beeai-framework/agents/base';
import type { ChatModel } from 'beeai-framework/backend/chat';
import type { EmbeddingModel } from 'beeai-framework/backend/embedding';
import type { Tool } from 'beeai-framework/tools/base';
import type { BeeAIInstrumentationConfig } from './types';
import {
  extractAgentInput,
  extractAgentOutputMessages,
  extractAgentRequestOptions,
  extractInferenceRequestOptions,
  extractMessagesAndSystemInstructions,
  extractOutputMessages,
  extractTokenUsage,
  extractToolResult,
  isRecord,
  mapFinishReason,
  mapProviderName,
  ownDataValue,
} from './utils';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

const MODULE_NAME = 'beeai-framework';
const SUPPORTED_VERSIONS = ['>=0.1.9 <0.1.14'];

type AnyInvocation =
  | LocalAgentInvocation
  | ToolInvocation
  | InferenceInvocation
  | EmbeddingInvocation;

interface MethodPatch {
  owners: Set<BeeAIInstrumentation>;
  restore: () => void;
}

interface BaseActiveRun {
  kind: 'agent' | 'tool' | 'inference' | 'embedding';
  runId: string;
  parentId?: string;
  invocation: AnyInvocation;
  callerSpan?: Span;
}

interface ActiveAgentRun extends BaseActiveRun {
  kind: 'agent';
  invocation: LocalAgentInvocation;
  agentName?: string;
  inputTokens: number;
  outputTokens: number;
  hasRecordedTokens: boolean;
}

type ActiveRun = BaseActiveRun | ActiveAgentRun;

interface BeeAIRunLike<R = unknown> extends Promise<R> {
  handler: () => Promise<R>;
  runContext?: {
    runId?: string;
    parentId?: string;
    groupId?: string;
    context?: Record<string, unknown>;
    runParams?: unknown;
    instance?: unknown;
    emitter?: {
      on?: (
        event: string,
        callback: (data: unknown, meta: unknown) => void
      ) => void;
      match?: (
        matcher: string | ((event: { name?: string }) => boolean),
        callback: (data: unknown, meta: unknown) => void
      ) => void;
    };
  };
}

interface RunStartParams {
  owner: BeeAIInstrumentation;
  handler: TelemetryHandler;
  instance: unknown;
  effectiveInput: unknown;
  parentContext: Context;
  callerContext: Context;
  runId: string | undefined;
  parentId: string | undefined;
  runContext: BeeAIRunLike['runContext'];
  enclosingAgent: ActiveAgentRun | undefined;
}

interface StartedRunOperation<TInvocation extends AnyInvocation> {
  invocation: TInvocation;
  activeRun?: ActiveRun;
  onSuccess?: (result: unknown) => void;
  onFailure?: () => void;
}

interface RunOperationSpec<TInvocation extends AnyInvocation> {
  label: string;
  startSyncInvocation: (
    owner: BeeAIInstrumentation,
    handler: TelemetryHandler,
    instance: unknown,
    inputArg: unknown,
    callerContext: Context
  ) => TInvocation;
  startRun: (params: RunStartParams) => StartedRunOperation<TInvocation>;
}

const methodPatches = new WeakMap<object, Map<PropertyKey, MethodPatch>>();
const wrappedRuns = new WeakSet<object>();
const activeRuns = new Map<string, ActiveRun>();

/**
 * OpenTelemetry instrumentation for `beeai-framework`.
 */
export class BeeAIInstrumentation extends InstrumentationBase<BeeAIInstrumentationConfig> {
  declare private _telemetryHandler: TelemetryHandler | undefined;
  declare private _explicitTracerProvider: TracerProvider | undefined;
  declare private _explicitMeterProvider: MeterProvider | undefined;
  declare private _lastCaptureEnv: string | undefined;

  constructor(config: BeeAIInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  override setConfig(config: BeeAIInstrumentationConfig = {}): void {
    super.setConfig(config);
    this._telemetryHandler = undefined;
  }

  override setTracerProvider(tracerProvider: TracerProvider): void {
    super.setTracerProvider(tracerProvider);
    this._explicitTracerProvider = tracerProvider;
    this._telemetryHandler = undefined;
  }

  override setMeterProvider(meterProvider: MeterProvider): void {
    super.setMeterProvider(meterProvider);
    this._explicitMeterProvider = meterProvider;
    this._telemetryHandler = undefined;
  }

  private _getTelemetryHandler(): TelemetryHandler {
    const currentEnv =
      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
    if (!this._telemetryHandler || this._lastCaptureEnv !== currentEnv) {
      this._lastCaptureEnv = currentEnv;
      this._telemetryHandler = new TelemetryHandler({
        instrumentationName: PACKAGE_NAME,
        instrumentationVersion: PACKAGE_VERSION,
        tracerProvider: this._explicitTracerProvider,
        meterProvider: this._explicitMeterProvider,
        diag: this._diag,
        config: this.getConfig(),
      });
    }
    return this._telemetryHandler;
  }

  protected init() {
    const files = ['cjs', 'js'].flatMap(ext => [
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/agents/base.${ext}`,
        (mod: { BaseAgent?: typeof BaseAgent }) =>
          this._patchBaseAgent(mod.BaseAgent),
        (mod: { BaseAgent?: typeof BaseAgent }) =>
          this._unpatchBaseAgent(mod.BaseAgent)
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/tools/base.${ext}`,
        (mod: { Tool?: typeof Tool }) => this._patchTool(mod.Tool),
        (mod: { Tool?: typeof Tool }) => this._unpatchTool(mod.Tool)
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/backend/chat.${ext}`,
        (mod: { ChatModel?: typeof ChatModel }) =>
          this._patchChatModel(mod.ChatModel),
        (mod: { ChatModel?: typeof ChatModel }) =>
          this._unpatchChatModel(mod.ChatModel)
      ),
      createTrackedModuleFile(
        `${MODULE_NAME}/dist/backend/embedding.${ext}`,
        (mod: { EmbeddingModel?: typeof EmbeddingModel }) =>
          this._patchEmbeddingModel(mod.EmbeddingModel),
        (mod: { EmbeddingModel?: typeof EmbeddingModel }) =>
          this._unpatchEmbeddingModel(mod.EmbeddingModel)
      ),
    ]);

    return [
      new InstrumentationNodeModuleDefinition(
        MODULE_NAME,
        SUPPORTED_VERSIONS,
        (moduleExports: unknown) => {
          this._patchModule(moduleExports);
          return moduleExports;
        },
        (moduleExports: unknown) => {
          this._unpatchModule(moduleExports);
        },
        files
      ),
    ];
  }

  /**
   * Manually instruments the `beeai-framework` module when not loaded via
   * automatic module hooks.
   */
  public manuallyInstrument(moduleExports: unknown): void {
    const target = this._normalizeModule(moduleExports);
    if (!target) {
      this._diag.warn(
        '[BeeAIInstrumentation] Invalid module passed to manuallyInstrument'
      );
      return;
    }
    if (
      'Version' in target &&
      typeof target.Version === 'string' &&
      !isSupportedVersion(target.Version)
    ) {
      const supportedVersionsString = `${MODULE_NAME} ["${SUPPORTED_VERSIONS.join('", "')}"]`;
      this._diag.warn(
        `DependencyConflict: requested: '${supportedVersionsString}' but found: '${MODULE_NAME} "${target.Version}"'`
      );
      return;
    }

    this._diag.debug(
      `[BeeAIInstrumentation] Manually instrumenting ${MODULE_NAME}`
    );
    this._patchModule(target);
  }

  private _normalizeModule(moduleExports: unknown):
    | {
        BaseAgent?: typeof BaseAgent;
        Tool?: typeof Tool;
        ChatModel?: typeof ChatModel;
        EmbeddingModel?: typeof EmbeddingModel;
        Version?: string;
      }
    | undefined {
    if (!isRecord(moduleExports)) {
      return undefined;
    }
    if (
      'BaseAgent' in moduleExports ||
      'Tool' in moduleExports ||
      'ChatModel' in moduleExports ||
      'EmbeddingModel' in moduleExports
    ) {
      return moduleExports;
    }
    if ('default' in moduleExports && isRecord(moduleExports.default)) {
      return moduleExports.default;
    }
    return moduleExports;
  }

  private _patchModule(moduleExports: unknown): void {
    const target = this._normalizeModule(moduleExports);
    if (!target) {
      return;
    }
    if (!target.BaseAgent) {
      this._diag.warn(
        '[BeeAIInstrumentation] BaseAgent not found, skipping instrumentation.'
      );
      return;
    }
    this._patchBaseAgent(target.BaseAgent);
    this._patchTool(target.Tool);
    this._patchChatModel(target.ChatModel);
    this._patchEmbeddingModel(target.EmbeddingModel);
  }

  private _unpatchModule(moduleExports: unknown): void {
    const target = this._normalizeModule(moduleExports);
    if (!target) {
      return;
    }
    this._unpatchBaseAgent(target.BaseAgent);
    this._unpatchTool(target.Tool);
    this._unpatchChatModel(target.ChatModel);
    this._unpatchEmbeddingModel(target.EmbeddingModel);
  }

  private _patchBaseAgent(baseAgent: typeof BaseAgent | undefined): void {
    if (!baseAgent?.prototype) return;
    this._patchRunMethod(
      baseAgent.prototype,
      'run',
      this._getAgentOperationSpec()
    );
  }

  private _unpatchBaseAgent(baseAgent: typeof BaseAgent | undefined): void {
    if (!baseAgent?.prototype) return;
    this._unpatchMethod(baseAgent.prototype, 'run');
  }

  private _patchTool(tool: typeof Tool | undefined): void {
    if (!tool?.prototype) return;
    this._patchRunMethod(tool.prototype, 'run', this._getToolOperationSpec());
  }

  private _unpatchTool(tool: typeof Tool | undefined): void {
    if (!tool?.prototype) return;
    this._unpatchMethod(tool.prototype, 'run');
  }

  private _patchChatModel(chatModel: typeof ChatModel | undefined): void {
    if (!chatModel?.prototype) return;
    this._patchRunMethod(
      chatModel.prototype,
      'create',
      this._getChatOperationSpec(false)
    );
    this._patchRunMethod(
      chatModel.prototype,
      'createStructure',
      this._getChatOperationSpec(true)
    );
  }

  private _unpatchChatModel(chatModel: typeof ChatModel | undefined): void {
    if (!chatModel?.prototype) return;
    this._unpatchMethod(chatModel.prototype, 'create');
    this._unpatchMethod(chatModel.prototype, 'createStructure');
  }

  private _patchEmbeddingModel(
    embeddingModel: typeof EmbeddingModel | undefined
  ): void {
    if (!embeddingModel?.prototype) return;
    this._patchRunMethod(
      embeddingModel.prototype,
      'create',
      this._getEmbeddingOperationSpec()
    );
  }

  private _unpatchEmbeddingModel(
    embeddingModel: typeof EmbeddingModel | undefined
  ): void {
    if (!embeddingModel?.prototype) return;
    this._unpatchMethod(embeddingModel.prototype, 'create');
  }

  private _getAgentOperationSpec(): RunOperationSpec<LocalAgentInvocation> {
    return {
      label: 'agent',
      startSyncInvocation: (owner, handler, instance, inputArg, callerCtx) =>
        owner._startAgentInvocation(handler, instance, inputArg, callerCtx),
      startRun: ({
        owner,
        handler,
        instance,
        effectiveInput,
        parentContext,
        callerContext,
        runId,
        parentId,
        runContext,
      }) => {
        const invocation = owner._startAgentInvocation(
          handler,
          instance,
          effectiveInput,
          parentContext
        );
        const { agentName } = extractAgentMetadata(instance);
        const activeRecord: ActiveAgentRun | undefined = runId
          ? {
              kind: 'agent',
              runId,
              parentId,
              invocation,
              agentName,
              callerSpan: trace.getSpan(callerContext),
              inputTokens: 0,
              outputTokens: 0,
              hasRecordedTokens: false,
            }
          : undefined;

        let eventMessage: { role: string; text: string } | undefined;
        runContext?.emitter?.match?.(
          event => event?.name === 'success',
          (data: unknown) => {
            eventMessage = extractSuccessEventMessage(data) ?? eventMessage;
          }
        );

        return {
          invocation,
          activeRun: activeRecord,
          onSuccess: result => {
            owner._finalizeAgentInvocation(
              invocation,
              result,
              activeRecord,
              eventMessage
            );
          },
          onFailure: () => {
            if (activeRecord?.hasRecordedTokens) {
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

  private _startAgentInvocation(
    handler: TelemetryHandler,
    agentInstance: unknown,
    inputArg: unknown,
    parentContext: Context
  ): LocalAgentInvocation {
    const { agentName, agentDescription } = extractAgentMetadata(agentInstance);

    const agentInput = isRecord(agentInstance)
      ? ownDataValue(agentInstance, 'input')
      : undefined;
    const llm = isRecord(agentInput) ? agentInput.llm : undefined;
    const requestModel =
      isRecord(llm) && typeof llm.modelId === 'string' && llm.modelId.trim()
        ? llm.modelId.trim()
        : undefined;
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

  private _finalizeAgentInvocation(
    invocation: LocalAgentInvocation,
    result: unknown,
    activeRecord: ActiveAgentRun | undefined,
    eventMessage: { role: string; text: string } | undefined
  ): void {
    if (activeRecord?.hasRecordedTokens) {
      invocation.setUsage({
        inputTokenCount: activeRecord.inputTokens,
        outputTokenCount: activeRecord.outputTokens,
      });
    } else if (isRecord(result) && Array.isArray(result.iterations)) {
      let inputTokens = 0;
      let outputTokens = 0;
      let foundUsage = false;
      for (const iter of result.iterations) {
        if (isRecord(iter) && isRecord(iter.raw)) {
          const usage = extractTokenUsage(iter.raw.usage);
          if (usage) {
            inputTokens += usage.inputTokenCount ?? 0;
            outputTokens += usage.outputTokenCount ?? 0;
            foundUsage = true;
          }
        }
      }
      if (foundUsage) {
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

  private _getToolOperationSpec(): RunOperationSpec<ToolInvocation> {
    return {
      label: 'tool',
      startSyncInvocation: (owner, handler, instance, inputArg, callerCtx) =>
        owner._startToolInvocation(
          handler,
          instance,
          inputArg,
          undefined,
          undefined,
          callerCtx
        ),
      startRun: ({
        owner,
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
        const toolCallMsg = isRecord(runContext?.context)
          ? runContext.context.toolCallMsg
          : undefined;
        const toolCallId =
          isRecord(toolCallMsg) &&
          typeof toolCallMsg.toolCallId === 'string' &&
          toolCallMsg.toolCallId.trim()
            ? toolCallMsg.toolCallId.trim()
            : undefined;

        const invocation = owner._startToolInvocation(
          handler,
          instance,
          effectiveInput,
          toolCallId,
          enclosingAgent?.agentName,
          parentContext
        );

        enclosingAgent?.invocation.recordToolCall();

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

  private _startToolInvocation(
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

  private _getChatOperationSpec(
    isStructured: boolean
  ): RunOperationSpec<InferenceInvocation> {
    return {
      label: 'chat model',
      startSyncInvocation: (owner, handler, instance, inputArg, callerCtx) =>
        owner._startChatInvocation(
          handler,
          instance,
          inputArg,
          isStructured,
          callerCtx
        ).invocation,
      startRun: ({
        owner,
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
        const { invocation, isStreaming } = owner._startChatInvocation(
          handler,
          instance,
          effectiveInput,
          isStructured,
          parentContext
        );

        enclosingAgent?.invocation.recordInferenceCall();

        if (isStreaming) {
          runContext?.emitter?.on?.('newToken', () => {
            invocation.recordStreamChunk();
          });
        }

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
          onSuccess: result => {
            owner._finalizeChatInvocation(
              invocation,
              result,
              isStructured,
              isStreaming,
              enclosingAgent
            );
          },
        };
      },
    };
  }

  private _startChatInvocation(
    handler: TelemetryHandler,
    chatModelInstance: unknown,
    inputArg: unknown,
    isStructured: boolean,
    parentContext: Context
  ): { invocation: InferenceInvocation; isStreaming: boolean } {
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

    return { invocation, isStreaming };
  }

  private _finalizeChatInvocation(
    invocation: InferenceInvocation,
    result: unknown,
    isStructured: boolean,
    isStreaming: boolean,
    enclosingAgent: ActiveAgentRun | undefined
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
        if (
          isRecord(firstMsg) &&
          typeof firstMsg.id === 'string' &&
          firstMsg.id.trim()
        ) {
          invocation.setResponseId(firstMsg.id.trim());
        }
      }

      const usage = extractTokenUsage(chatOutput.usage);
      if (usage) {
        invocation.setUsage(usage);
        if (enclosingAgent) {
          enclosingAgent.inputTokens += usage.inputTokenCount ?? 0;
          enclosingAgent.outputTokens += usage.outputTokenCount ?? 0;
          enclosingAgent.hasRecordedTokens = true;
        }
      }

      let finishReason: FinishReason | undefined = mapFinishReason(
        chatOutput.finishReason
      );
      if (!finishReason && isStreaming) {
        const hasToolCalls =
          typeof chatOutput.getToolCalls === 'function' &&
          Array.isArray(chatOutput.getToolCalls()) &&
          chatOutput.getToolCalls().length > 0;
        finishReason = hasToolCalls
          ? GEN_AI_FINISH_REASON_VALUE_TOOL_CALL
          : GEN_AI_FINISH_REASON_VALUE_STOP;
      }
      if (finishReason) {
        invocation.setFinishReasons([finishReason]);
      }

      if (invocation.shouldCaptureContent()) {
        const outputMessages = extractOutputMessages(
          messages,
          structuredObject
        );
        if (outputMessages.length > 0) {
          invocation.addOutputMessages(outputMessages);
        }
      }
    } else if (
      invocation.shouldCaptureContent() &&
      structuredObject !== undefined
    ) {
      const outputMessages = extractOutputMessages(undefined, structuredObject);
      if (outputMessages.length > 0) {
        invocation.addOutputMessages(outputMessages);
      }
    }
  }

  private _getEmbeddingOperationSpec(): RunOperationSpec<EmbeddingInvocation> {
    return {
      label: 'embedding',
      startSyncInvocation: (owner, handler, instance, _inputArg, callerCtx) =>
        owner._startEmbeddingInvocation(handler, instance, callerCtx),
      startRun: ({
        owner,
        handler,
        instance,
        parentContext,
        callerContext,
        runId,
        parentId,
      }) => {
        const invocation = owner._startEmbeddingInvocation(
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

  private _startEmbeddingInvocation(
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

  private _patchRunMethod<
    T extends object,
    K extends keyof T,
    TInvocation extends AnyInvocation,
  >(target: T, method: K, spec: RunOperationSpec<TInvocation>): void {
    this._patchMethod(target, method, (owners, restore) =>
      this._createRunMethodWrapper(owners, restore, spec)
    );
  }

  private _createRunMethodWrapper<TInvocation extends AnyInvocation>(
    owners: Set<BeeAIInstrumentation>,
    restore: () => void,
    spec: RunOperationSpec<TInvocation>
  ) {
    return <F extends (...args: unknown[]) => unknown>(original: F): F => {
      const instrumentation = this;
      return function patchedBeeAIMethod(this: unknown, ...args: unknown[]) {
        const owner = instrumentation._resolveActiveOwner(owners, restore);
        const callerContext = context.active();
        if (!owner || isTracingSuppressed(callerContext)) {
          return original.apply(this, args);
        }

        let returned: unknown;
        try {
          returned = original.apply(this, args);
        } catch (error) {
          owner._recordSyncFailure(this, args[0], callerContext, error, spec);
          throw error;
        }

        if (isBeeAIRun(returned) && !wrappedRuns.has(returned)) {
          wrappedRuns.add(returned);
          owner._wrapRunInstance(
            returned,
            this,
            args[0],
            callerContext,
            owners,
            restore,
            spec
          );
        }
        return returned;
      } as F;
    };
  }

  private _recordSyncFailure<TInvocation extends AnyInvocation>(
    instance: unknown,
    inputArg: unknown,
    callerContext: Context,
    error: unknown,
    spec: RunOperationSpec<TInvocation>
  ): void {
    try {
      const handler = this._getTelemetryHandler();
      const invocation = spec.startSyncInvocation(
        this,
        handler,
        instance,
        inputArg,
        callerContext
      );
      invocation.fail({
        exception: error instanceof Error ? error : undefined,
      });
    } catch (err) {
      this._diag.warn(
        `BeeAI: could not record synchronous ${spec.label} error`,
        err
      );
    }
  }

  private _wrapRunInstance<TInvocation extends AnyInvocation>(
    run: BeeAIRunLike,
    instance: unknown,
    inputArg: unknown,
    callerContext: Context,
    owners: Set<BeeAIInstrumentation>,
    restore: () => void,
    spec: RunOperationSpec<TInvocation>
  ): void {
    const originalHandler = run.handler;
    run.handler = async () => {
      const owner = this._resolveActiveOwner(owners, restore);
      const executionContext = context.active();
      if (
        !owner ||
        isTracingSuppressed(callerContext) ||
        isTracingSuppressed(executionContext)
      ) {
        return originalHandler.call(run);
      }

      const runContext = run.runContext;
      const runId = runContext?.runId;
      const parentId = runContext?.parentId;
      const parentRun = parentId ? activeRuns.get(parentId) : undefined;
      const enclosingAgent = findEnclosingAgentRun(parentId);
      const parentContext = resolveParentContext(
        callerContext,
        executionContext,
        parentRun
      );
      const effectiveInput =
        Array.isArray(runContext?.runParams) && runContext.runParams.length > 0
          ? runContext.runParams[0]
          : inputArg;

      let started: StartedRunOperation<TInvocation> | undefined;
      try {
        const handler = owner._getTelemetryHandler();
        started = spec.startRun({
          owner,
          handler,
          instance,
          effectiveInput,
          parentContext,
          callerContext,
          runId,
          parentId,
          runContext,
          enclosingAgent,
        });
        if (runId && started.activeRun) {
          activeRuns.set(runId, started.activeRun);
        }
      } catch (err) {
        owner._diag.warn(`BeeAI: could not start ${spec.label} telemetry`, err);
      }

      if (!started) {
        return originalHandler.call(run);
      }

      const { invocation, onSuccess, onFailure } = started;
      try {
        const result = await invocation.withContext(() =>
          originalHandler.call(run)
        );
        try {
          onSuccess?.(result);
        } catch (err) {
          owner._diag.warn(
            `BeeAI: could not finalize ${spec.label} telemetry`,
            err
          );
        }
        invocation.stop();
        return result;
      } catch (error) {
        onFailure?.();
        invocation.fail({
          exception: error instanceof Error ? error : undefined,
        });
        throw error;
      } finally {
        if (runId) {
          activeRuns.delete(runId);
        }
      }
    };
  }

  private _patchMethod<T extends object, K extends keyof T>(
    target: T,
    method: K,
    factory: (
      owners: Set<BeeAIInstrumentation>,
      restore: () => void
    ) => (original: T[K]) => T[K]
  ): void {
    if (typeof target[method] !== 'function') return;
    const patches =
      methodPatches.get(target) ?? new Map<PropertyKey, MethodPatch>();
    methodPatches.set(target, patches);
    const existing = patches.get(method);
    if (existing) {
      existing.owners.add(this);
      return;
    }
    const owners = new Set([this]);
    const original = target[method];
    const patch: MethodPatch = {
      owners,
      restore: () => {
        if (owners.size !== 0 || target[method] !== wrapped) return;
        target[method] = original;
        if (patches.get(method) === patch) patches.delete(method);
      },
    };
    const wrapped = factory(owners, patch.restore)(original);
    target[method] = wrapped;
    patches.set(method, patch);
  }

  private _unpatchMethod(
    target: object,
    method: 'run' | 'create' | 'createStructure'
  ): void {
    const patches = methodPatches.get(target);
    if (!patches) return;
    const patch = patches.get(method);
    if (!patch?.owners.delete(this)) return;
    patch.restore();
  }

  private _resolveActiveOwner(
    owners: Set<BeeAIInstrumentation>,
    restore: () => void
  ): BeeAIInstrumentation | undefined {
    const owner = Array.from(owners)
      .reverse()
      .find(instance => instance.isEnabled());
    if (!owner && owners.size === 0) {
      restore();
    }
    return owner;
  }
}

function isBeeAIRun(value: unknown): value is BeeAIRunLike {
  return isRecord(value) && typeof value.handler === 'function';
}

function isSupportedVersion(version: unknown): boolean {
  if (typeof version !== 'string') return true;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?/.exec(version.trim());
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major === 0 && minor === 1 && patch >= 9 && patch < 14;
}

function createTrackedModuleFile<T extends object>(
  name: string,
  patch: (module: T) => void,
  unpatch: (module: T) => void
): InstrumentationNodeModuleFile {
  const instances = new Set<T>();
  const file = new InstrumentationNodeModuleFile(
    name,
    SUPPORTED_VERSIONS,
    (module: T) => {
      instances.add(module);
      for (const instance of instances) {
        patch(instance);
      }
      return module;
    },
    () => {
      for (const instance of instances) {
        unpatch(instance);
      }
    }
  );
  let exports: T | undefined;
  Object.defineProperty(file, 'moduleExports', {
    get: () => exports,
    set: (module: T) => {
      exports = module;
      if (module && typeof module === 'object') {
        instances.add(module);
      }
    },
  });
  return file;
}

function extractAgentMetadata(agentInstance: unknown): {
  agentName?: string;
  agentDescription?: string;
} {
  const meta =
    isRecord(agentInstance) && isRecord(agentInstance.meta)
      ? agentInstance.meta
      : undefined;
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

function findEnclosingAgentRun(
  parentId: string | undefined
): ActiveAgentRun | undefined {
  let currentId = parentId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const record = activeRuns.get(currentId);
    if (!record) break;
    if (record.kind === 'agent') {
      return record as ActiveAgentRun;
    }
    currentId = record.parentId;
  }
  return undefined;
}

function resolveParentContext(
  callerContext: Context,
  executionContext: Context,
  parentRun: ActiveRun | undefined
): Context {
  const callerSpan = trace.getSpan(callerContext);
  const executionSpan = trace.getSpan(executionContext);

  if (parentRun) {
    const parentSpan = trace.getSpan(parentRun.invocation.getContext());
    if (
      executionSpan &&
      executionSpan !== parentSpan &&
      executionSpan !== parentRun.callerSpan
    ) {
      return executionContext;
    }
    if (
      callerSpan &&
      callerSpan !== parentSpan &&
      callerSpan !== parentRun.callerSpan
    ) {
      return callerContext;
    }
    return parentRun.invocation.getContext();
  }

  if (executionSpan) {
    return executionContext;
  }
  if (callerSpan) {
    return callerContext;
  }
  return executionContext;
}
