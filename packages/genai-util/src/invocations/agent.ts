/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, type Attributes, type HrTime } from '@opentelemetry/api';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_AGENT_DESCRIPTION,
  ATTR_GEN_AI_AGENT_ID,
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_AGENT_VERSION,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_DATA_SOURCE_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PREVIOUS_RESPONSE_ID,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_DEFINITIONS,
  ATTR_GEN_AI_USAGE_AUDIO_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_AUDIO_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_AUDIO_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_IMAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_IMAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_IMAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_TEXT_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_TEXT_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_TEXT_OUTPUT_TOKENS,
  GEN_AI_FINISH_REASON_VALUE_ERROR,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
} from '../semconv';
import type {
  ContentCaptureMode,
  FinishReason,
  InputMessages,
  LocalAgentInvocationOptions,
  OutputMessages,
  OutputType,
  RemoteAgentInvocationOptions,
  SystemInstructions,
  TokenUsageDetails,
  ToolDefinitions,
} from '../types';
import {
  formatInputMessages,
  formatOutputMessages,
  formatSystemInstructions,
  formatToolDefinitions,
  getAgentRequestOptionsAttributes,
  mergeTokenUsageDetails,
} from '../utils';
import type { TelemetryHandler } from '../handler';
import { BaseInvocation } from './base';

/**
 * Format a GenAI span name for an agent invocation adhering to
 * OpenTelemetry semantic conventions.
 *
 * Format: `{gen_ai.operation.name} {gen_ai.agent.name}` when `gen_ai.agent.name`
 * is present, or `{gen_ai.operation.name}` when omitted.
 *
 * @param operationName - The GenAI operation name.
 * @param agentName - Optional human-readable agent name.
 * @returns Standardized span name string.
 */
function getAgentSpanName(operationName: string, agentName?: string): string {
  const name = agentName?.trim();
  return name ? `${operationName} ${name}` : operationName;
}

/**
 * Build the common span attributes known when an agent span is started.
 *
 * These are passed to the span at creation time so that they are visible to samplers.
 * Deferred structured attributes (system instructions, input/output messages, tool
 * definitions) are intentionally excluded: they are serialized once when the invocation ends.
 */
function buildCommonInitialAttributes(
  options: LocalAgentInvocationOptions | RemoteAgentInvocationOptions,
  operationName: string,
  supportsModelAttributes: boolean,
  includeStream: boolean
): Attributes {
  const attrs: Attributes = {
    ...options.attributes,
    ...(supportsModelAttributes
      ? getAgentRequestOptionsAttributes(options.requestOptions, includeStream)
      : undefined),
    [ATTR_GEN_AI_OPERATION_NAME]: operationName,
  };

  if (options.agentName) {
    attrs[ATTR_GEN_AI_AGENT_NAME] = options.agentName;
  }
  if (options.agentDescription) {
    attrs[ATTR_GEN_AI_AGENT_DESCRIPTION] = options.agentDescription;
  }
  if (options.conversationId) {
    attrs[ATTR_GEN_AI_CONVERSATION_ID] = options.conversationId;
  }
  if (options.dataSourceId) {
    attrs[ATTR_GEN_AI_DATA_SOURCE_ID] = options.dataSourceId;
  }
  if (supportsModelAttributes) {
    if (options.outputType) {
      attrs[ATTR_GEN_AI_OUTPUT_TYPE] = options.outputType;
    }
    if (options.requestModel) {
      attrs[ATTR_GEN_AI_REQUEST_MODEL] = options.requestModel;
    }
  }

  return attrs;
}

/**
 * Build the span attributes known when a remote client agent span is started.
 */
function buildRemoteInitialAttributes(
  options: RemoteAgentInvocationOptions,
  operationName: string,
  providerName: string
): Attributes {
  const attrs = buildCommonInitialAttributes(
    options,
    operationName,
    true,
    true
  );

  if (providerName) {
    attrs[ATTR_GEN_AI_PROVIDER_NAME] = providerName;
  }
  if (options.agentId) {
    attrs[ATTR_GEN_AI_AGENT_ID] = options.agentId;
  }
  if (options.agentVersion) {
    attrs[ATTR_GEN_AI_AGENT_VERSION] = options.agentVersion;
  }
  if (options.previousResponseId) {
    attrs[ATTR_GEN_AI_REQUEST_PREVIOUS_RESPONSE_ID] =
      options.previousResponseId;
  }
  if (options.serverAddress) {
    attrs[ATTR_SERVER_ADDRESS] = options.serverAddress;
    if (options.serverPort !== undefined) {
      attrs[ATTR_SERVER_PORT] = options.serverPort;
    }
  }

  return attrs;
}

/**
 * Base class managing shared lifecycle and telemetry for GenAI Agent invocations.
 *
 * Concrete subclasses separate in-process executions ({@link LocalAgentInvocation},
 * `SpanKind.INTERNAL`) from remote hosted agent calls ({@link RemoteAgentInvocation},
 * `SpanKind.CLIENT`). Create instances via {@link TelemetryHandler.startLocalAgent}
 * and {@link TelemetryHandler.startRemoteAgent}.
 *
 * @experimental This class is experimental and subject to change.
 */
export abstract class AgentInvocation extends BaseInvocation {
  protected readonly _operationName: string;
  protected readonly _supportsModelAttributes: boolean;
  protected _agentName?: string;
  protected _requestModel?: string;
  private readonly _contentCaptureMode: ContentCaptureMode;
  private _finishReasons?: FinishReason[];
  private _usage?: TokenUsageDetails;
  private _inputMessages?: InputMessages;
  private _outputMessages?: OutputMessages;
  private _systemInstructions?: SystemInstructions;
  private _toolDefinitions?: ToolDefinitions;

  protected constructor(
    handler: TelemetryHandler,
    options: LocalAgentInvocationOptions | RemoteAgentInvocationOptions,
    operationName: string,
    supportsModelAttributes: boolean,
    kind: SpanKind,
    initialAttributes: Attributes
  ) {
    super(getAgentSpanName(operationName, options.agentName), handler, {
      kind,
      attributes: initialAttributes,
      metricAttributes: options.metricAttributes,
      context: options.parentContext,
      startTime: options.startTime,
    });

    this._operationName = operationName;
    this._supportsModelAttributes = supportsModelAttributes;
    this._agentName = options.agentName;
    this._requestModel = supportsModelAttributes
      ? options.requestModel
      : undefined;
    this._contentCaptureMode = handler.getContentCaptureMode();
    this._inputMessages = options.inputMessages
      ? [...options.inputMessages]
      : undefined;
    this._systemInstructions = options.systemInstructions;
    this._toolDefinitions = options.toolDefinitions
      ? [...options.toolDefinitions]
      : undefined;
  }

  /**
   * Set the human-readable name of the GenAI agent (`gen_ai.agent.name`) and update
   * the span name to `{gen_ai.operation.name} {gen_ai.agent.name}`.
   */
  public setAgentName(name: string): this {
    this._agentName = name;
    this._span.setAttribute(ATTR_GEN_AI_AGENT_NAME, name);
    this._span.updateName(getAgentSpanName(this._operationName, name));
    return this;
  }

  /**
   * Set the free-form description of the GenAI agent (`gen_ai.agent.description`).
   */
  public setAgentDescription(description: string): this {
    this._span.setAttribute(ATTR_GEN_AI_AGENT_DESCRIPTION, description);
    return this;
  }

  /**
   * Set the conversation / session / thread ID (`gen_ai.conversation.id`).
   */
  public setConversationId(id: string): this {
    this._span.setAttribute(ATTR_GEN_AI_CONVERSATION_ID, id);
    return this;
  }

  /**
   * Set the data source identifier (`gen_ai.data_source.id`).
   */
  public setDataSourceId(id: string): this {
    this._span.setAttribute(ATTR_GEN_AI_DATA_SOURCE_ID, id);
    return this;
  }

  /**
   * Set the content type requested or produced (`gen_ai.output.type`).
   */
  public setOutputType(outputType: OutputType): this {
    if (this._supportsModelAttributes) {
      this._span.setAttribute(ATTR_GEN_AI_OUTPUT_TYPE, outputType);
    }
    return this;
  }

  /**
   * Set the requested model name (`gen_ai.request.model`).
   */
  public setRequestModel(model: string): this {
    if (this._supportsModelAttributes) {
      this._requestModel = model;
      this._span.setAttribute(ATTR_GEN_AI_REQUEST_MODEL, model);
    }
    return this;
  }

  /**
   * Set finish reasons for the agent response (`gen_ai.response.finish_reasons`).
   *
   * Finalized onto `gen_ai.response.finish_reasons` when the invocation ends.
   */
  public setFinishReasons(reasons: readonly FinishReason[]): this {
    this._finishReasons = [...reasons];
    return this;
  }

  /**
   * Record token usage details onto the agent span (`gen_ai.usage.*`).
   *
   * Populates span attributes only (does not record `gen_ai.client.inference.*`
   * token metrics, avoiding double-counting with child `InferenceInvocation` spans).
   * `cacheReadTokenCount`, `cacheWriteTokenCount`, and `tokenUsageByModality` apply
   * only to {@link RemoteAgentInvocation} (`SpanKind.CLIENT`) spans.
   *
   * May be called multiple times; fields are merged and finalized onto the span
   * when the invocation ends.
   */
  public setUsage(usage: TokenUsageDetails): this {
    this._usage = mergeTokenUsageDetails(this._usage, usage);
    return this;
  }

  /**
   * Add input messages to the invocation (`gen_ai.input.messages`).
   *
   * May be called multiple times; messages are accumulated and serialized once when
   * the invocation ends.
   */
  public addInputMessages(messages: InputMessages): this {
    (this._inputMessages ??= []).push(...messages);
    return this;
  }

  /**
   * Add output messages to the invocation (`gen_ai.output.messages`).
   *
   * May be called multiple times; messages are accumulated and serialized once when
   * the invocation ends.
   */
  public addOutputMessages(messages: OutputMessages): this {
    (this._outputMessages ??= []).push(...messages);
    return this;
  }

  /**
   * Set system instructions (`gen_ai.system_instructions`), replacing any previously set value.
   *
   * Serialized once when the invocation ends.
   */
  public setSystemInstructions(instructions: SystemInstructions): this {
    this._systemInstructions = instructions;
    return this;
  }

  /**
   * Set tool definitions available to the agent (`gen_ai.tool.definitions`), replacing any previously set value.
   *
   * Per GenAI semantic conventions, schema attributes are opt-in and are not governed by
   * `contentCaptureMode`; call this method only when tool definition capture is enabled.
   * Serialized once when the invocation ends.
   */
  public setToolDefinitions(definitions: ToolDefinitions): this {
    this._toolDefinitions = [...definitions];
    return this;
  }

  /**
   * Finalize finish reasons, token usage, opt-in tool definitions, and serialize
   * message content onto the span.
   */
  protected override _onInvocationEnd(
    _endTime: HrTime,
    _errorType?: string
  ): void {
    if (this._supportsModelAttributes && this._finishReasons !== undefined) {
      this._setFinishReasonsAttribute();
    }

    if (this._supportsModelAttributes && this._usage) {
      this._setUsageAttributes(this._usage);
    }

    const toolDefinitions = formatToolDefinitions(this._toolDefinitions);
    if (toolDefinitions) {
      this._span.setAttribute(ATTR_GEN_AI_TOOL_DEFINITIONS, toolDefinitions);
    }

    if (this._contentCaptureMode !== 'span_only') {
      return;
    }

    const systemInstructions = formatSystemInstructions(
      this._systemInstructions
    );
    if (systemInstructions) {
      this._span.setAttribute(
        ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
        systemInstructions
      );
    }

    const inputMessages = formatInputMessages(this._inputMessages);
    if (inputMessages) {
      this._span.setAttribute(ATTR_GEN_AI_INPUT_MESSAGES, inputMessages);
    }

    const outputMessages = formatOutputMessages(this._outputMessages);
    if (outputMessages) {
      this._span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, outputMessages);
    }
  }

  /**
   * Populate `gen_ai.response.finish_reasons` on the span, filling any expected
   * choice position that did not receive a finish reason with `'error'`.
   */
  private _setFinishReasonsAttribute(): void {
    const expectedCount = Math.max(
      1,
      this._outputMessages?.length ?? 0,
      this._finishReasons?.length ?? 0
    );
    const reasons: FinishReason[] = [];
    for (let i = 0; i < expectedCount; i++) {
      const reason = this._finishReasons?.[i];
      reasons.push(
        reason != null && reason !== ''
          ? reason
          : GEN_AI_FINISH_REASON_VALUE_ERROR
      );
    }
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, reasons);
  }

  protected _setUsageAttributes(usage: TokenUsageDetails): void {
    this._setTokenUsageAttributeIfNonNegative(
      ATTR_GEN_AI_USAGE_INPUT_TOKENS,
      usage.inputTokenCount
    );
    this._setTokenUsageAttributeIfNonNegative(
      ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
      usage.outputTokenCount
    );
  }

  protected _setTokenUsageAttributeIfNonNegative(
    key: string,
    tokenCount: number | undefined
  ): void {
    if (tokenCount !== undefined && tokenCount >= 0) {
      this._span.setAttribute(key, tokenCount);
    }
  }

  protected _setTokenUsageAttributeIfPositive(
    key: string,
    tokenCount: number | undefined
  ): void {
    if (tokenCount !== undefined && tokenCount > 0) {
      this._span.setAttribute(key, tokenCount);
    }
  }
}

/**
 * Manages the lifecycle and telemetry of an in-process Agent, Workflow, or Framework
 * Entrypoint invocation (`gen_ai.invoke_agent.internal`, {@link SpanKind.INTERNAL}).
 *
 * @experimental This class is experimental and subject to change.
 */
export class LocalAgentInvocation extends AgentInvocation {
  private _inferenceCalls?: number;
  private _toolCalls?: number;

  /**
   * Start an in-process agent invocation, creating and starting the underlying
   * `SpanKind.INTERNAL` span.
   *
   * @param handler Handler providing the tracer, meter, and completion hooks.
   * @param options Agent details, parent context, and initial attributes.
   */
  constructor(
    handler: TelemetryHandler,
    options: LocalAgentInvocationOptions = {}
  ) {
    const operationName =
      options.operationName ?? GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT;
    const supportsModelAttributes =
      operationName === GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT;

    super(
      handler,
      options,
      operationName,
      supportsModelAttributes,
      SpanKind.INTERNAL,
      buildCommonInitialAttributes(
        options,
        operationName,
        supportsModelAttributes,
        false
      )
    );

    if (options.trackInferenceCalls) {
      this._inferenceCalls = 0;
    }
    if (options.trackToolCalls) {
      this._toolCalls = 0;
    }
  }

  /**
   * Set the total number of inference (model) calls made during this in-process agent invocation.
   *
   * Recorded on the `gen_ai.invoke_agent.inference_calls` histogram when the invocation ends.
   */
  public setInferenceCalls(count: number): this {
    this._inferenceCalls = count;
    return this;
  }

  /**
   * Increment the number of inference (model) calls made during this in-process agent invocation.
   *
   * Recorded on the `gen_ai.invoke_agent.inference_calls` histogram when the invocation ends.
   */
  public recordInferenceCall(count = 1): this {
    this._inferenceCalls = (this._inferenceCalls ?? 0) + count;
    return this;
  }

  /**
   * Set the total number of tool calls made during this in-process agent invocation.
   *
   * Recorded on the `gen_ai.invoke_agent.tool_calls` histogram when the invocation ends.
   */
  public setToolCalls(count: number): this {
    this._toolCalls = count;
    return this;
  }

  /**
   * Increment the number of tool calls made during this in-process agent invocation.
   *
   * Recorded on the `gen_ai.invoke_agent.tool_calls` histogram when the invocation ends.
   */
  public recordToolCall(count = 1): this {
    this._toolCalls = (this._toolCalls ?? 0) + count;
    return this;
  }

  /**
   * Semantic convention dimensions for `gen_ai.invoke_agent.duration`.
   */
  protected override _getSemconvMetricAttributes(): Attributes {
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: this._operationName,
    };
    if (this._agentName) {
      metricAttrs[ATTR_GEN_AI_AGENT_NAME] = this._agentName;
    }
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    return metricAttrs;
  }

  /**
   * Build metric attributes for `gen_ai.invoke_agent.inference_calls` and
   * `gen_ai.invoke_agent.tool_calls`, which define `gen_ai.operation.name` and
   * `gen_ai.agent.name` as dimensions (without `gen_ai.request.model` or `error.type`).
   */
  private _getCallCountMetricAttributes(): Attributes {
    const semconvAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: this._operationName,
    };
    if (this._agentName) {
      semconvAttrs[ATTR_GEN_AI_AGENT_NAME] = this._agentName;
    }
    return {
      ...semconvAttrs,
      ...this._metricAttributes,
    };
  }

  protected override _recordMetrics(
    durationSec: number,
    errorType?: string
  ): void {
    this._handler.recordInvokeAgentDuration(
      durationSec,
      this._getMetricAttributes(errorType),
      this._context
    );

    if (this._inferenceCalls !== undefined && this._inferenceCalls >= 0) {
      this._handler.recordInvokeAgentInferenceCalls(
        this._inferenceCalls,
        this._getCallCountMetricAttributes(),
        this._context
      );
    }

    if (this._toolCalls !== undefined && this._toolCalls >= 0) {
      this._handler.recordInvokeAgentToolCalls(
        this._toolCalls,
        this._getCallCountMetricAttributes(),
        this._context
      );
    }
  }
}

/**
 * Manages the lifecycle and telemetry of a remote client Agent invocation
 * (`gen_ai.client.invoke_agent`, {@link SpanKind.CLIENT}).
 *
 * @experimental This class is experimental and subject to change.
 */
export class RemoteAgentInvocation extends AgentInvocation {
  private readonly _providerName: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;

  /**
   * Start a remote client agent invocation, creating and starting the underlying
   * `SpanKind.CLIENT` span.
   *
   * @param handler Handler providing the tracer, meter, and completion hooks.
   * @param options Remote agent details, provider name, parent context, and initial attributes.
   */
  constructor(
    handler: TelemetryHandler,
    options: RemoteAgentInvocationOptions
  ) {
    const operationName =
      options.operationName ?? GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT;
    const providerName =
      typeof options.providerName === 'string'
        ? options.providerName.trim()
        : '';

    super(
      handler,
      options,
      operationName,
      true,
      SpanKind.CLIENT,
      buildRemoteInitialAttributes(options, operationName, providerName)
    );

    if (!providerName) {
      handler
        .getDiag()
        .warn(
          'RemoteAgentInvocation started with an empty providerName; gen_ai.provider.name will be omitted.'
        );
    }

    this._providerName = providerName;
    this._serverAddress = options.serverAddress;
    this._serverPort = options.serverPort;
  }

  /**
   * Set the unique identifier of the GenAI agent (`gen_ai.agent.id`).
   */
  public setAgentId(id: string): this {
    this._span.setAttribute(ATTR_GEN_AI_AGENT_ID, id);
    return this;
  }

  /**
   * Set the version of the GenAI agent (`gen_ai.agent.version`).
   */
  public setAgentVersion(version: string): this {
    this._span.setAttribute(ATTR_GEN_AI_AGENT_VERSION, version);
    return this;
  }

  /**
   * Set the unique identifier of the previous response (`gen_ai.request.previous_response.id`).
   */
  public setPreviousResponseId(id: string): this {
    this._span.setAttribute(ATTR_GEN_AI_REQUEST_PREVIOUS_RESPONSE_ID, id);
    return this;
  }

  /**
   * Set the request streaming attribute to true (`gen_ai.request.stream`).
   */
  public setStreaming(): this {
    this._span.setAttribute(ATTR_GEN_AI_REQUEST_STREAM, true);
    return this;
  }

  /**
   * Semantic convention dimensions for `gen_ai.client.invoke_agent.duration`.
   */
  protected override _getSemconvMetricAttributes(): Attributes {
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: this._operationName,
    };
    if (this._providerName) {
      metricAttrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
    }
    if (this._agentName) {
      metricAttrs[ATTR_GEN_AI_AGENT_NAME] = this._agentName;
    }
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._serverAddress) {
      metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
      if (this._serverPort !== undefined) {
        metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
      }
    }
    return metricAttrs;
  }

  protected override _recordMetrics(
    durationSec: number,
    errorType?: string
  ): void {
    this._handler.recordClientInvokeAgentDuration(
      durationSec,
      this._getMetricAttributes(errorType),
      this._context
    );
  }

  protected override _setUsageAttributes(usage: TokenUsageDetails): void {
    super._setUsageAttributes(usage);

    this._setTokenUsageAttributeIfPositive(
      ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
      usage.cacheReadTokenCount
    );
    this._setTokenUsageAttributeIfPositive(
      ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
      usage.cacheWriteTokenCount
    );

    const modality = usage.tokenUsageByModality;
    if (!modality) {
      return;
    }

    this._setTokenUsageAttributeIfPositive(
      ATTR_GEN_AI_USAGE_TEXT_INPUT_TOKENS,
      modality.inputTokens?.text
    );
    this._setTokenUsageAttributeIfPositive(
      ATTR_GEN_AI_USAGE_TEXT_OUTPUT_TOKENS,
      modality.outputTokens?.text
    );
    this._setTokenUsageAttributeIfPositive(
      ATTR_GEN_AI_USAGE_TEXT_CACHE_READ_INPUT_TOKENS,
      modality.cacheReadTokens?.text
    );

    this._setTokenUsageAttributeIfPositive(
      ATTR_GEN_AI_USAGE_IMAGE_INPUT_TOKENS,
      modality.inputTokens?.image
    );
    this._setTokenUsageAttributeIfPositive(
      ATTR_GEN_AI_USAGE_IMAGE_OUTPUT_TOKENS,
      modality.outputTokens?.image
    );
    this._setTokenUsageAttributeIfPositive(
      ATTR_GEN_AI_USAGE_IMAGE_CACHE_READ_INPUT_TOKENS,
      modality.cacheReadTokens?.image
    );

    this._setTokenUsageAttributeIfPositive(
      ATTR_GEN_AI_USAGE_AUDIO_INPUT_TOKENS,
      modality.inputTokens?.audio
    );
    this._setTokenUsageAttributeIfPositive(
      ATTR_GEN_AI_USAGE_AUDIO_OUTPUT_TOKENS,
      modality.outputTokens?.audio
    );
    this._setTokenUsageAttributeIfPositive(
      ATTR_GEN_AI_USAGE_AUDIO_CACHE_READ_INPUT_TOKENS,
      modality.cacheReadTokens?.audio
    );
  }
}
