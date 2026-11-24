/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  createContextKey,
  trace,
  type Context,
  type MeterProvider,
  type Span,
  type TracerProvider,
} from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import {
  ATTR_GEN_AI_OUTPUT_TYPE,
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
import type {
  ActiveAgentRun,
  ActiveRun,
  AnyInvocation,
  BeeAIRunLike,
  MethodPatch,
  RunOperationSpec,
  StartedRunOperation,
} from './internal-types';
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

const ACTIVE_AGENT_CONTEXT_KEY = createContextKey(
  'OpenTelemetry BeeAI Active Agent Run'
);
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
  declare private _manualTargets: Set<object> | undefined;

  /**
   * Initializes the BeeAI instrumentation with optional configuration.
   */
  constructor(config: BeeAIInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  /**
   * Enables instrumentation and re-applies patches to any manually instrumented
   * module targets.
   */
  override enable(): void {
    super.enable();
    if (this._manualTargets) {
      for (const target of this._manualTargets) {
        this._patchModule(target);
      }
    }
  }

  /**
   * Disables instrumentation and removes patches from any manually instrumented
   * module targets.
   */
  override disable(): void {
    super.disable();
    if (this._manualTargets) {
      for (const target of this._manualTargets) {
        this._unpatchModule(target);
      }
    }
  }

  /**
   * Updates instrumentation configuration and invalidates the cached
   * `TelemetryHandler`.
   */
  override setConfig(config: BeeAIInstrumentationConfig = {}): void {
    super.setConfig(config);
    this._telemetryHandler = undefined;
  }

  /**
   * Sets an explicit `TracerProvider` and resets the cached `TelemetryHandler`.
   */
  override setTracerProvider(tracerProvider: TracerProvider): void {
    super.setTracerProvider(tracerProvider);
    this._explicitTracerProvider = tracerProvider;
    this._telemetryHandler = undefined;
  }

  /**
   * Sets an explicit `MeterProvider` and resets the cached `TelemetryHandler`.
   */
  override setMeterProvider(meterProvider: MeterProvider): void {
    super.setMeterProvider(meterProvider);
    this._explicitMeterProvider = meterProvider;
    this._telemetryHandler = undefined;
  }

  /**
   * Lazily creates and caches the `TelemetryHandler`, recreating it if
   * `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` changes when unset in
   * config.
   */
  private _getTelemetryHandler(): TelemetryHandler {
    const config = this.getConfig();
    const currentEnv =
      config.captureMessageContent === undefined
        ? process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT
        : undefined;
    if (!this._telemetryHandler || this._lastCaptureEnv !== currentEnv) {
      this._lastCaptureEnv = currentEnv;
      this._telemetryHandler = new TelemetryHandler({
        instrumentationName: PACKAGE_NAME,
        instrumentationVersion: PACKAGE_VERSION,
        tracerProvider: this._explicitTracerProvider,
        meterProvider: this._explicitMeterProvider,
        diag: this._diag,
        config,
      });
    }
    return this._telemetryHandler;
  }

  /**
   * Registers automatic CJS/ESM module hooks for `beeai-framework` and its
   * agent, tool, chat, and embedding subpath modules.
   */
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
    this._manualTargets ??= new Set();
    this._manualTargets.add(target);
    if (this.isEnabled()) {
      this._patchModule(target);
    }
  }

  /**
   * Unwraps CJS/ESM module exports (including `default` exports) into an object
   * containing instrumentable BeeAI classes.
   */
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

  /**
   * Patches all available BeeAI classes (`BaseAgent`, `Tool`, `ChatModel`,
   * `EmbeddingModel`) exported by a module object.
   */
  private _patchModule(moduleExports: unknown): void {
    const target = this._normalizeModule(moduleExports);
    if (!target) {
      return;
    }
    if (
      !target.BaseAgent &&
      !target.Tool &&
      !target.ChatModel &&
      !target.EmbeddingModel
    ) {
      this._diag.warn(
        '[BeeAIInstrumentation] No instrumentable BeeAI classes found, skipping instrumentation.'
      );
      return;
    }
    this._patchBaseAgent(target.BaseAgent);
    this._patchTool(target.Tool);
    this._patchChatModel(target.ChatModel);
    this._patchEmbeddingModel(target.EmbeddingModel);
  }

  /**
   * Removes instrumentation patches from all BeeAI classes exported by a module
   * object.
   */
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

  /**
   * Patches `BaseAgent.prototype.run` to record `invoke_agent` telemetry.
   */
  private _patchBaseAgent(baseAgent: typeof BaseAgent | undefined): void {
    if (!baseAgent?.prototype) return;
    this._patchRunMethod(
      baseAgent.prototype,
      'run',
      this._getAgentOperationSpec()
    );
  }

  /**
   * Restores `BaseAgent.prototype.run` to its unpatched implementation.
   */
  private _unpatchBaseAgent(baseAgent: typeof BaseAgent | undefined): void {
    if (!baseAgent?.prototype) return;
    this._unpatchMethod(baseAgent.prototype, 'run');
  }

  /**
   * Patches `Tool.prototype.run` to record `execute_tool` telemetry.
   */
  private _patchTool(tool: typeof Tool | undefined): void {
    if (!tool?.prototype) return;
    this._patchRunMethod(tool.prototype, 'run', this._getToolOperationSpec());
  }

  /**
   * Restores `Tool.prototype.run` to its unpatched implementation.
   */
  private _unpatchTool(tool: typeof Tool | undefined): void {
    if (!tool?.prototype) return;
    this._unpatchMethod(tool.prototype, 'run');
  }

  /**
   * Patches `ChatModel.prototype.create` and `createStructure` to record `chat`
   * inference telemetry.
   */
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

  /**
   * Restores `ChatModel.prototype.create` and `createStructure` to their
   * unpatched implementations.
   */
  private _unpatchChatModel(chatModel: typeof ChatModel | undefined): void {
    if (!chatModel?.prototype) return;
    this._unpatchMethod(chatModel.prototype, 'create');
    this._unpatchMethod(chatModel.prototype, 'createStructure');
  }

  /**
   * Patches `EmbeddingModel.prototype.create` to record `embeddings` telemetry.
   */
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

  /**
   * Restores `EmbeddingModel.prototype.create` to its unpatched implementation.
   */
  private _unpatchEmbeddingModel(
    embeddingModel: typeof EmbeddingModel | undefined
  ): void {
    if (!embeddingModel?.prototype) return;
    this._unpatchMethod(embeddingModel.prototype, 'create');
  }

  /**
   * Builds the `Run` lifecycle specification for `BaseAgent` executions,
   * tracking `success` events and aggregated token usage.
   */
  private _getAgentOperationSpec(): RunOperationSpec<LocalAgentInvocation> {
    return {
      label: 'agent',
      isolatesAgentScope: true,
      startSyncInvocation: (owner, handler, instance, inputArg, callerCtx) => {
        if (isRemoteAgent(instance)) {
          return undefined;
        }
        return owner._startAgentInvocation(
          handler,
          instance,
          inputArg,
          callerCtx
        );
      },
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
        if (isRemoteAgent(instance)) {
          return undefined;
        }
        const metadata = extractAgentMetadata(instance);
        const agentInput = isRecord(instance)
          ? ownDataValue(instance, 'input')
          : undefined;
        const configuredLlm = isRecord(agentInput) ? agentInput.llm : undefined;
        const invocation = owner._startAgentInvocation(
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
            owner._finalizeAgentInvocation(
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
  private _startAgentInvocation(
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
  private _finalizeAgentInvocation(
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
  private _getToolOperationSpec(): RunOperationSpec<ToolInvocation> {
    return {
      label: 'tool',
      isolatesAgentScope: true,
      startSyncInvocation: (owner, handler, instance, inputArg, callerCtx) =>
        isLangChainDelegatedTool(instance)
          ? undefined
          : owner._startToolInvocation(
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

        const invocation = owner._startToolInvocation(
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

  /**
   * Builds the `Run` lifecycle specification for standard or structured
   * `ChatModel` calls, attaching `newToken` listeners when streaming.
   */
  private _getChatOperationSpec(
    isStructured: boolean
  ): RunOperationSpec<InferenceInvocation> {
    return {
      label: 'chat model',
      startSyncInvocation: (owner, handler, instance, inputArg, callerCtx) =>
        isLangChainDelegatedModel(instance)
          ? undefined
          : owner._startChatInvocation(
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
          owner._startChatInvocation(
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
                    const chunkReason = mapFinishReason(
                      event.value.finishReason
                    );
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
            owner._finalizeChatInvocation(
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
  private _startChatInvocation(
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
  private _finalizeChatInvocation(
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
      if (finishReason) {
        invocation.setFinishReasons([finishReason]);
      }

      if (invocation.shouldCaptureContent()) {
        const outputMessages = extractOutputMessages(
          messages,
          structuredObject,
          coalesceOutputMessages
        );
        if (outputMessages.length > 0) {
          invocation.addOutputMessages(outputMessages);
        }
      }
    }
  }

  /**
   * Builds the `Run` lifecycle specification for `EmbeddingModel` calls,
   * recording vector dimensions and token usage upon completion.
   */
  private _getEmbeddingOperationSpec(): RunOperationSpec<EmbeddingInvocation> {
    return {
      label: 'embedding',
      startSyncInvocation: (owner, handler, instance, _inputArg, callerCtx) =>
        isLangChainDelegatedModel(instance)
          ? undefined
          : owner._startEmbeddingInvocation(handler, instance, callerCtx),
      startRun: ({
        owner,
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

  /**
   * Starts an `EmbeddingInvocation` span with provider and model metadata.
   */
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

  /**
   * Patches a BeeAI prototype method returning a `Run` with telemetry lifecycle
   * handling defined by `spec`.
   */
  private _patchRunMethod<
    T extends object,
    K extends keyof T,
    TInvocation extends AnyInvocation,
  >(target: T, method: K, spec: RunOperationSpec<TInvocation>): void {
    this._patchMethod(
      target,
      method,
      this._createRunMethodWrapper<T[K], TInvocation>(target, method, spec)
    );
  }

  /**
   * Creates a method wrapper that captures synchronous invocation failures and
   * wraps returned BeeAI `Run` instances for deferred async execution.
   *
   * Resolves the active `BeeAIInstrumentation` owner dynamically via `(target,
   * method)` rather than closing over `this` or a specific `owners` set, so
   * lazy `Run` instances survive `disable()` / `enable()` cycles without
   * pinning instrumentation instances in memory.
   *
   * @template TMethod - Exact property signature (`T[K]`) of the prototype
   *   method being patched, preserving its parameter and return types across
   *   `_patchMethod` without `strictFunctionTypes` contravariance mismatches.
   * @template TInvocation - GenAI telemetry invocation type
   *   (`LocalAgentInvocation`, `ToolInvocation`, `InferenceInvocation`, or
   *   `EmbeddingInvocation`) managed by `spec` for this operation.
   */
  private _createRunMethodWrapper<TMethod, TInvocation extends AnyInvocation>(
    target: object,
    method: PropertyKey,
    spec: RunOperationSpec<TInvocation>
  ): (original: TMethod) => TMethod {
    return (original: TMethod): TMethod => {
      const originalFn = original as unknown as (...args: unknown[]) => unknown;
      return function patchedBeeAIMethod(this: unknown, ...args: unknown[]) {
        const owner = BeeAIInstrumentation._resolveActiveOwner(target, method);
        const callerContext = context.active();
        if (!owner || isTracingSuppressed(callerContext)) {
          return originalFn.apply(this, args);
        }

        let returned: unknown;
        try {
          returned = originalFn.apply(this, args);
        } catch (error) {
          owner._recordSyncFailure(this, args[0], callerContext, error, spec);
          throw error;
        }

        if (isBeeAIRun(returned) && !wrappedRuns.has(returned)) {
          wrappedRuns.add(returned);
          BeeAIInstrumentation._wrapRunInstance(
            returned,
            this,
            args[0],
            callerContext,
            target,
            method,
            spec
          );
        }
        return returned;
      } as unknown as TMethod;
    };
  }

  /**
   * Records a failed invocation span and error metric when a patched method
   * throws synchronously before returning a `Run`.
   */
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
      if (!invocation) {
        return;
      }
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

  /**
   * Applies an owner-tracked patch to `target[method]` so multiple
   * `BeeAIInstrumentation` instances can share a single wrapper safely.
   *
   * @param target - Prototype or object whose method is being patched.
   * @param method - Property key of the method on `target` to wrap.
   * @param factory - Wrapper builder invoked with the original method to
   *   produce its patched replacement when no patch is active yet.
   */
  private _patchMethod<T extends object, K extends keyof T>(
    target: T,
    method: K,
    factory: (original: T[K]) => T[K]
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
        if (patches.size === 0) methodPatches.delete(target);
      },
    };
    const wrapped = factory(original);
    target[method] = wrapped;
    patches.set(method, patch);
  }

  /**
   * Unregisters this instrumentation instance from `target[method]` and
   * restores the original method when no owners remain.
   */
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

  /**
   * Finds the most recently registered enabled `BeeAIInstrumentation` owner for
   * `(target, method)` via a live `methodPatches` lookup so lazy `Run` closures
   * do not pin stale `owners` sets or instrumentation instances across
   * `disable()` / `enable()` cycles.
   */
  private static _resolveActiveOwner(
    target: object,
    method: PropertyKey
  ): BeeAIInstrumentation | undefined {
    const patch = methodPatches.get(target)?.get(method);
    if (!patch) return undefined;
    const owner = Array.from(patch.owners)
      .reverse()
      .find(instance => instance.isEnabled());
    if (!owner && patch.owners.size === 0) {
      patch.restore();
    }
    return owner;
  }

  /**
   * Wraps `run.handler` so each execution of a lazy BeeAI `Run` creates its own
   * telemetry span, propagates context, and cleans up on settlement, resolving
   * the active owner dynamically via `(target, method)` at execution time.
   */
  private static _wrapRunInstance<TInvocation extends AnyInvocation>(
    run: BeeAIRunLike,
    instance: unknown,
    inputArg: unknown,
    callerContext: Context,
    target: object,
    method: PropertyKey,
    spec: RunOperationSpec<TInvocation>
  ): void {
    const originalHandler = run.handler;
    const executeWrappedRun = async () => {
      const owner = BeeAIInstrumentation._resolveActiveOwner(target, method);
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
      const enclosingAgent = findEnclosingAgentRun(
        parentId,
        callerContext,
        executionContext
      );
      const parentContext = resolveParentContext(
        callerContext,
        executionContext,
        parentRun
      );
      const runParams = runContext?.runParams;
      const effectiveInput =
        Array.isArray(runParams) && runParams.length > 0
          ? runParams[0]
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
          parentRun,
          runContext,
          enclosingAgent,
        });
        if (runId && started?.activeRun) {
          activeRuns.set(runId, started.activeRun);
        }
      } catch (err) {
        owner._diag.warn(`BeeAI: could not start ${spec.label} telemetry`, err);
      }

      if (!started) {
        // Propagate the resolved parent context so delegated downstream
        // instrumentations (e.g. @opentelemetry/instrumentation-langchain)
        // still parent their spans under any enclosing BeeAI agent/caller span,
        // while isolating tool / remote-agent passthrough scopes so internal
        // calls inside them do not roll up onto an outer BeeAI agent.
        const passthroughContext = spec.isolatesAgentScope
          ? parentContext.setValue(ACTIVE_AGENT_CONTEXT_KEY, null)
          : enclosingAgent
            ? parentContext.setValue(ACTIVE_AGENT_CONTEXT_KEY, enclosingAgent)
            : parentContext;
        return context.with(passthroughContext, () =>
          originalHandler.call(run)
        );
      }

      const { invocation, activeRun, onSuccess, onFailure } = started;
      const runScopeContext =
        activeRun?.kind === 'agent'
          ? invocation
              .getContext()
              .setValue(ACTIVE_AGENT_CONTEXT_KEY, activeRun)
          : activeRun?.kind === 'tool'
            ? invocation.getContext().setValue(ACTIVE_AGENT_CONTEXT_KEY, null)
            : enclosingAgent
              ? invocation
                  .getContext()
                  .setValue(ACTIVE_AGENT_CONTEXT_KEY, enclosingAgent)
              : invocation.getContext();
      try {
        const result = await context.with(runScopeContext, () =>
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
        started.cleanup?.();
        if (runId && activeRuns.get(runId) === activeRun) {
          activeRuns.delete(runId);
        }
      }
    };

    // BeeAI's `Run` extends `LazyPromise`, which is cold and re-executable:
    // every `.then()`, `.catch()`, `.finally()`, or `await` drains queued
    // `.context()` / `.observe()` / `.middleware()` tasks via `before()` and
    // invokes `this.handler()` fresh. Do not memoize the promise here, as
    // caching would suppress re-execution and drop late-bound tasks.
    run.handler = () => executeWrappedRun();
  }
}

/**
 * Checks whether a value is a lazy BeeAI `Run` object exposing a `handler`
 * function.
 */
function isBeeAIRun(value: unknown): value is BeeAIRunLike {
  return isRecord(value) && typeof value.handler === 'function';
}

/**
 * Checks whether a `beeai-framework` semantic version falls within the
 * supported `>=0.1.9 <0.1.14` range.
 */
function isSupportedVersion(version: unknown): boolean {
  if (typeof version !== 'string') return true;
  const match =
    /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      version.trim()
    );
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major === 0 && minor === 1 && patch >= 9 && patch < 14;
}

/**
 * Tracks all loaded CJS/ESM module copies, including those loaded while
 * disabled, so each copy is patched or unpatched together.
 */
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
 * Checks whether a BeeAI instance's emitter namespace includes `'langchain'`.
 */
function hasLangChainNamespace(instance: Record<string, unknown>): boolean {
  const emitter = ownDataValue(instance, 'emitter');
  const namespace = isRecord(emitter)
    ? ownDataValue(emitter, 'namespace')
    : undefined;
  return Array.isArray(namespace) && namespace.includes('langchain');
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

/**
 * Identifies BeeAI's `LangChainChatModel` and `LangChainEmbeddingModel` adapters
 * (`beeai-framework/adapters/langchain/backend/*`), which delegate model calls
 * to `@langchain/core` and report `providerId === 'langchain'`.
 */
function isLangChainDelegatedModel(modelInstance: unknown): boolean {
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
 * Walks the `Run` parent chain and OpenTelemetry contexts to find the enclosing
 * active agent run, stopping at tool or remote-agent boundaries so internal
 * helper calls inside tools are not attributed to the parent agent.
 */
function findEnclosingAgentRun(
  parentId: string | undefined,
  callerContext?: Context,
  executionContext?: Context
): ActiveAgentRun | undefined {
  let currentId = parentId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const record = activeRuns.get(currentId);
    if (!record) break;
    // Tool boundary: internal model or sub-tool calls belong to the tool, not the outer agent.
    if (record.kind === 'tool') {
      return undefined;
    }
    if (record.kind === 'agent') {
      // A cold Run constructed under an agent (`parentId` = agent) may be awaited inside a tool scope (`null`).
      if (executionContext?.getValue(ACTIVE_AGENT_CONTEXT_KEY) === null) {
        return undefined;
      }
      return record as ActiveAgentRun;
    }
    currentId = record.parentId;
  }
  // Executing inside a tool/remote-agent scope (e.g., passthrough `LangChainTool` or lost `RunContext`).
  if (executionContext?.getValue(ACTIVE_AGENT_CONTEXT_KEY) === null) {
    return undefined;
  }
  const fromCaller = callerContext?.getValue(ACTIVE_AGENT_CONTEXT_KEY);
  // Constructed inside a tool/remote-agent scope; do not fall through to an outer `executionContext` agent.
  if (fromCaller === null) {
    return undefined;
  }
  if (fromCaller) {
    return fromCaller as ActiveAgentRun;
  }
  const fromExecution = executionContext?.getValue(ACTIVE_AGENT_CONTEXT_KEY);
  if (fromExecution) {
    return fromExecution as ActiveAgentRun;
  }
  return undefined;
}

/**
 * Resolves the parent OpenTelemetry `Context` for a `Run`, preferring external
 * caller or execution spans over ancestor `Run` spans when nested.
 */
function resolveParentContext(
  callerContext: Context,
  executionContext: Context,
  parentRun: ActiveRun | undefined
): Context {
  const callerSpan = trace.getSpan(callerContext);
  const executionSpan = trace.getSpan(executionContext);

  if (parentRun) {
    const ancestorSpans = new Set<Span>();
    let current: ActiveRun | undefined = parentRun;
    const visited = new Set<string>();
    while (current && !visited.has(current.runId)) {
      visited.add(current.runId);
      const runSpan = trace.getSpan(current.invocation.getContext());
      if (runSpan) ancestorSpans.add(runSpan);
      if (current.callerSpan) ancestorSpans.add(current.callerSpan);
      current = current.parentId ? activeRuns.get(current.parentId) : undefined;
    }

    if (callerSpan && !ancestorSpans.has(callerSpan)) {
      return callerContext;
    }
    if (executionSpan && !ancestorSpans.has(executionSpan)) {
      return executionContext;
    }
    return parentRun.invocation.getContext();
  }

  if (callerSpan) {
    return callerContext;
  }
  if (executionSpan) {
    return executionContext;
  }
  return executionContext;
}
