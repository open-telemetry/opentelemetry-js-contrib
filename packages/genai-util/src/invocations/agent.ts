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
  AgentInvocationOptions,
  ContentCaptureMode,
  FinishReason,
  InputMessages,
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
 * Determine whether the provided options represent a remote client agent invocation
 * (`gen_ai.client.invoke_agent`) rather than an in-process agent invocation
 * (`gen_ai.invoke_agent.internal`).
 */
function isRemoteAgentOptions(
  options: AgentInvocationOptions | RemoteAgentInvocationOptions
): options is RemoteAgentInvocationOptions {
  return (
    'providerName' in options &&
    typeof options.providerName === 'string' &&
    options.providerName.length > 0
  );
}

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
 * Build the span attributes that are known when the agent span is started.
 *
 * These are passed to the span at creation time so that they are visible to samplers.
 * Content attributes (system instructions, input/output messages, tool definitions)
 * are intentionally excluded: they are serialized once when the invocation ends.
 */
function buildInitialAttributes(
  options: AgentInvocationOptions | RemoteAgentInvocationOptions,
  operationName: string,
  isRemote: boolean
): Attributes {
  const attrs: Attributes = {
    ...options.attributes,
    ...getAgentRequestOptionsAttributes(options.requestOptions, isRemote),
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
  if (options.outputType) {
    attrs[ATTR_GEN_AI_OUTPUT_TYPE] = options.outputType;
  }
  if (options.requestModel) {
    attrs[ATTR_GEN_AI_REQUEST_MODEL] = options.requestModel;
  }

  if (isRemoteAgentOptions(options)) {
    attrs[ATTR_GEN_AI_PROVIDER_NAME] = options.providerName;

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
  }

  return attrs;
}

/**
 * Manages the lifecycle and telemetry of an Agent, Workflow, or Framework Entrypoint invocation.
 *
 * Supports both:
 * - In-process agent / workflow / entrypoint invocations (`gen_ai.invoke_agent.internal`, {@link SpanKind.INTERNAL})
 * - Remote client agent invocations (`gen_ai.client.invoke_agent`, {@link SpanKind.CLIENT}) when `providerName` is specified.
 *
 * @experimental This class is experimental and subject to change.
 */
export class AgentInvocation extends BaseInvocation {
  private readonly _isRemote: boolean;
  private readonly _providerName?: string;
  private readonly _operationName: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;
  private readonly _contentCaptureMode: ContentCaptureMode;
  private _agentName?: string;
  private _requestModel?: string;
  private _finishReasons?: FinishReason[];
  private _usage?: TokenUsageDetails;
  private _inputMessages?: InputMessages;
  private _outputMessages?: OutputMessages;
  private _systemInstructions?: SystemInstructions;
  private _toolDefinitions?: ToolDefinitions;
  private _inferenceCalls?: number;
  private _toolCalls?: number;

  /**
   * Start an agent invocation, creating and starting the underlying span.
   *
   * @param handler Handler providing the tracer, meter, and completion hooks.
   * @param options Agent details, parent context, and initial attributes.
   */
  constructor(
    handler: TelemetryHandler,
    options: AgentInvocationOptions | RemoteAgentInvocationOptions = {}
  ) {
    const isRemote = isRemoteAgentOptions(options);
    const operationName =
      options.operationName ?? GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT;

    super(getAgentSpanName(operationName, options.agentName), handler, {
      kind: isRemote ? SpanKind.CLIENT : SpanKind.INTERNAL,
      attributes: buildInitialAttributes(options, operationName, isRemote),
      metricAttributes: options.metricAttributes,
      context: options.parentContext,
      startTime: options.startTime,
    });

    this._isRemote = isRemote;
    this._operationName = operationName;
    this._agentName = options.agentName;
    this._requestModel = options.requestModel;
    this._contentCaptureMode = handler.getContentCaptureMode();
    this._inputMessages = options.inputMessages
      ? [...options.inputMessages]
      : undefined;
    this._systemInstructions = options.systemInstructions;
    this._toolDefinitions = options.toolDefinitions
      ? [...options.toolDefinitions]
      : undefined;

    if (isRemoteAgentOptions(options)) {
      this._providerName = options.providerName;
      this._serverAddress = options.serverAddress;
      this._serverPort = options.serverPort;
    }
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
   * Set the unique identifier of the GenAI agent (`gen_ai.agent.id`).
   */
  public setAgentId(id: string): this {
    if (this._isRemote) {
      this._span.setAttribute(ATTR_GEN_AI_AGENT_ID, id);
    }
    return this;
  }

  /**
   * Set the version of the GenAI agent (`gen_ai.agent.version`).
   */
  public setAgentVersion(version: string): this {
    if (this._isRemote) {
      this._span.setAttribute(ATTR_GEN_AI_AGENT_VERSION, version);
    }
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
    this._span.setAttribute(ATTR_GEN_AI_OUTPUT_TYPE, outputType);
    return this;
  }

  /**
   * Set the requested model name (`gen_ai.request.model`).
   */
  public setRequestModel(model: string): this {
    this._requestModel = model;
    this._span.setAttribute(ATTR_GEN_AI_REQUEST_MODEL, model);
    return this;
  }

  /**
   * Set the request streaming attribute to true (`gen_ai.request.stream`).
   */
  public setStreaming(): this {
    if (this._isRemote) {
      this._span.setAttribute(ATTR_GEN_AI_REQUEST_STREAM, true);
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
   * Record token usage details.
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
   * Serialized once when the invocation ends.
   */
  public setToolDefinitions(definitions: ToolDefinitions): this {
    this._toolDefinitions = [...definitions];
    return this;
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
   * Semantic convention dimensions for duration metrics (`gen_ai.invoke_agent.duration`
   * for in-process invocations, `gen_ai.client.invoke_agent.duration` for remote client
   * invocations).
   *
   * Caller-supplied metric attributes override these; see
   * {@link BaseInvocation._getMetricAttributes}.
   */
  protected override _getSemconvMetricAttributes(): Attributes {
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: this._operationName,
    };
    if (this._isRemote && this._providerName) {
      metricAttrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
    }
    if (this._agentName) {
      metricAttrs[ATTR_GEN_AI_AGENT_NAME] = this._agentName;
    }
    if (
      this._requestModel &&
      (this._isRemote ||
        this._operationName === GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT)
    ) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._isRemote && this._serverAddress) {
      metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
      if (this._serverPort !== undefined) {
        metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
      }
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
    const durationAttrs = this._getMetricAttributes(errorType);

    if (this._isRemote) {
      this._handler.recordClientInvokeAgentDuration(
        durationSec,
        durationAttrs,
        this._context
      );
      return;
    }

    this._handler.recordInvokeAgentDuration(
      durationSec,
      durationAttrs,
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

  /**
   * Finalize finish reasons, token usage, and serialize the invocation's content
   * onto the span.
   */
  protected override _onInvocationEnd(
    _endTime: HrTime,
    _errorType?: string
  ): void {
    if (this._finishReasons && this._finishReasons.length > 0) {
      this._setFinishReasonsAttribute();
    }

    if (this._usage) {
      this._setUsageAttributes(this._usage);
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

    const toolDefinitions = formatToolDefinitions(this._toolDefinitions);
    if (toolDefinitions) {
      this._span.setAttribute(ATTR_GEN_AI_TOOL_DEFINITIONS, toolDefinitions);
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

  private _setUsageAttributes(usage: TokenUsageDetails): void {
    this._setTokenUsageAttributeIfNonNegative(
      ATTR_GEN_AI_USAGE_INPUT_TOKENS,
      usage.inputTokenCount
    );
    this._setTokenUsageAttributeIfNonNegative(
      ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
      usage.outputTokenCount
    );

    if (!this._isRemote) {
      return;
    }

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

  private _setTokenUsageAttributeIfNonNegative(
    key: string,
    tokenCount: number | undefined
  ): void {
    if (tokenCount !== undefined && tokenCount >= 0) {
      this._span.setAttribute(key, tokenCount);
    }
  }

  private _setTokenUsageAttributeIfPositive(
    key: string,
    tokenCount: number | undefined
  ): void {
    if (tokenCount !== undefined && tokenCount > 0) {
      this._span.setAttribute(key, tokenCount);
    }
  }
}
