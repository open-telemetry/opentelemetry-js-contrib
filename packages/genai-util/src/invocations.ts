/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SpanStatusCode,
  type Attributes,
  type HrTime,
  type Span,
} from '@opentelemetry/api';
import {
  ATTR_ERROR_TYPE,
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
  ATTR_GEN_AI_REQUEST_CHOICE_COUNT,
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_REASONING_LEVEL,
  ATTR_GEN_AI_REQUEST_SEED,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_REQUEST_STREAM_CURSOR,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_STATUS,
  ATTR_GEN_AI_RETRIEVAL_DOCUMENTS,
  ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
  GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
} from './semconv';
import type {
  AgentInvocationOptions,
  CompletionResult,
  ContentCaptureMode,
  FetchResponseInvocationOptions,
  InferenceInvocationOptions,
  InputMessages,
  OutputMessages,
  RemoteAgentInvocationOptions,
  RetrievalInvocationOptions,
  SystemInstruction,
  TokenUsage,
} from './types';
import {
  calculateDurationSeconds,
  formatInputMessages,
  formatOutputMessages,
  formatSystemInstructions,
  serializeContent,
} from './utils';
import {
  isEventContentCaptureEnabled,
  isSpanContentCaptureEnabled,
} from './environment-variables';
import type { TelemetryHandler } from './handler';

/**
 * Manages the lifecycle and telemetry of an LLM / GenAI inference operation.
 */
export class InferenceInvocation {
  private readonly _span: Span;
  private readonly _handler: TelemetryHandler;
  private readonly _startTime: HrTime;
  private readonly _providerName: string;
  private readonly _operationName: string;
  private readonly _requestModel?: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;
  private readonly _contentCaptureMode: ContentCaptureMode;
  private _responseModel?: string;
  private _responseId?: string;
  private _finishReasons: string[] = [];
  private _usage?: TokenUsage;
  private _inputMessages?: InputMessages;
  private _outputMessages?: OutputMessages;
  private _systemInstructions?: SystemInstruction;
  private _firstChunkTime?: HrTime;
  private _isEnded = false;
  private _customAttributes: Attributes = {};

  constructor(
    span: Span,
    handler: TelemetryHandler,
    options: InferenceInvocationOptions,
    startTime: HrTime = process.hrtime()
  ) {
    this._span = span;
    this._handler = handler;
    this._startTime = startTime;
    this._providerName = options.providerName;
    this._operationName =
      options.operationName ?? GEN_AI_OPERATION_NAME_VALUE_CHAT;
    this._requestModel = options.requestModel;
    this._serverAddress = options.serverAddress;
    this._serverPort = options.serverPort;
    this._contentCaptureMode = handler.getContentCaptureMode();

    this._initAttributes(options);
  }

  private _initAttributes(options: InferenceInvocationOptions): void {
    const attrs: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
      [ATTR_GEN_AI_OPERATION_NAME]: this._operationName,
      ...options.attributes,
    };

    if (this._requestModel) {
      attrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }

    if (options.conversationId) {
      attrs[ATTR_GEN_AI_CONVERSATION_ID] = options.conversationId;
    }

    if (options.serverAddress) {
      attrs[ATTR_SERVER_ADDRESS] = options.serverAddress;
    }
    if (options.serverPort) {
      attrs[ATTR_SERVER_PORT] = options.serverPort;
    }

    const reqOpts = options.requestOptions;
    if (reqOpts) {
      if (reqOpts.temperature !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_TEMPERATURE] = reqOpts.temperature;
      }
      if (reqOpts.topP !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_TOP_P] = reqOpts.topP;
      }
      if (reqOpts.topK !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_TOP_K] = reqOpts.topK;
      }
      if (reqOpts.maxTokens !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = reqOpts.maxTokens;
      }
      if (reqOpts.stopSequences && reqOpts.stopSequences.length > 0) {
        attrs[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = reqOpts.stopSequences;
      }
      if (reqOpts.frequencyPenalty !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY] = reqOpts.frequencyPenalty;
      }
      if (reqOpts.presencePenalty !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY] = reqOpts.presencePenalty;
      }
      if (reqOpts.choiceCount !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_CHOICE_COUNT] = reqOpts.choiceCount;
      }
      if (reqOpts.seed !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_SEED] = reqOpts.seed;
      }
      if (reqOpts.encodingFormats && reqOpts.encodingFormats.length > 0) {
        attrs[ATTR_GEN_AI_REQUEST_ENCODING_FORMATS] = reqOpts.encodingFormats;
      }
      if (reqOpts.stream !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_STREAM] = reqOpts.stream;
      }
      if (reqOpts.reasoningLevel !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_REASONING_LEVEL] = reqOpts.reasoningLevel;
      }
    }

    if (options.systemInstructions) {
      this.setSystemInstructions(options.systemInstructions);
    }

    if (options.inputMessages && options.inputMessages.length > 0) {
      this.addInputMessages(options.inputMessages);
    }

    this._span.setAttributes(attrs);
  }

  /**
   * Set the model name that produced the response.
   */
  public setResponseModel(model: string): this {
    this._responseModel = model;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);
    return this;
  }

  /**
   * Set the response identifier.
   */
  public setResponseId(id: string): this {
    this._responseId = id;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, id);
    return this;
  }

  /**
   * Set finish reasons for the response choices.
   */
  public setFinishReasons(reasons: string[] | string): this {
    const arr = Array.isArray(reasons) ? reasons : [reasons];
    this._finishReasons = arr;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, arr);
    return this;
  }

  /**
   * Record token usage.
   */
  public setUsage(usage: TokenUsage): this {
    this._usage = usage;
    if (usage.inputTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_INPUT_TOKENS,
        usage.inputTokens
      );
    }
    if (usage.outputTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
        usage.outputTokens
      );
    }
    if (usage.reasoningTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
        usage.reasoningTokens
      );
    }
    if (usage.cacheReadTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
        usage.cacheReadTokens
      );
    }
    if (usage.cacheCreationTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
        usage.cacheCreationTokens
      );
    }
    return this;
  }

  /**
   * Add input messages to the invocation.
   */
  public addInputMessages(messages: InputMessages): this {
    this._inputMessages = [...(this._inputMessages ?? []), ...messages];

    if (
      isSpanContentCaptureEnabled(this._contentCaptureMode) ||
      isEventContentCaptureEnabled(this._contentCaptureMode)
    ) {
      const formatted = formatInputMessages(this._inputMessages);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_INPUT_MESSAGES, formatted);
      }
    }

    return this;
  }

  /**
   * Add output messages to the invocation.
   */
  public addOutputMessages(messages: OutputMessages): this {
    this._outputMessages = [...(this._outputMessages ?? []), ...messages];

    if (
      isSpanContentCaptureEnabled(this._contentCaptureMode) ||
      isEventContentCaptureEnabled(this._contentCaptureMode)
    ) {
      const formatted = formatOutputMessages(this._outputMessages);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, formatted);
      }
    }

    return this;
  }

  /**
   * Set system instructions.
   */
  public setSystemInstructions(instructions: SystemInstruction): this {
    this._systemInstructions = instructions;
    if (
      isSpanContentCaptureEnabled(this._contentCaptureMode) ||
      isEventContentCaptureEnabled(this._contentCaptureMode)
    ) {
      const formatted = formatSystemInstructions(instructions);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_SYSTEM_INSTRUCTIONS, formatted);
      }
    }
    return this;
  }

  /**
   * Set custom span attribute.
   */
  public setAttribute(key: string, value: any): this {
    this._customAttributes[key] = value;
    this._span.setAttribute(key, value);
    return this;
  }

  /**
   * Set multiple custom span attributes.
   */
  public setAttributes(attributes: Attributes): this {
    Object.assign(this._customAttributes, attributes);
    this._span.setAttributes(attributes);
    return this;
  }

  /**
   * Helper for stream chunks recording. On first chunk, marks stream request and records TTFT metric.
   */
  public recordStreamChunk(_chunk?: unknown): this {
    if (!this._firstChunkTime) {
      this._firstChunkTime = process.hrtime();
      this._span.setAttribute(ATTR_GEN_AI_REQUEST_STREAM, true);
      const ttftSec = calculateDurationSeconds(
        this._startTime,
        this._firstChunkTime
      );

      const metricAttrs: Attributes = {
        [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
        [ATTR_GEN_AI_OPERATION_NAME]: this._operationName,
      };
      if (this._requestModel) {
        metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
      }
      if (this._responseModel) {
        metricAttrs[ATTR_GEN_AI_RESPONSE_MODEL] = this._responseModel;
      }
      if (this._serverAddress) {
        metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
      }
      if (this._serverPort !== undefined) {
        metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
      }

      this._handler.recordServerTimeToFirstToken(ttftSec, metricAttrs);
    }
    return this;
  }

  /**
   * Complete the invocation successfully.
   */
  public stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;

    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    this._recordMetrics(durationSec);

    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endHr);

    this._runCompletionHook(durationSec);
  }

  /**
   * Complete the invocation with an error.
   */
  public fail(
    error: Error | string | unknown,
    endTime?: HrTime | number
  ): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;

    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    this._recordMetrics(durationSec, error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'GenAI operation error';

    if (error instanceof Error) {
      this._span.recordException(error);
    }

    this._span.setStatus({
      code: SpanStatusCode.ERROR,
      message: errorMessage,
    });
    this._span.end(endHr);

    this._runCompletionHook(durationSec, error);
  }

  private _recordMetrics(durationSec: number, error?: unknown): void {
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
      [ATTR_GEN_AI_OPERATION_NAME]: this._operationName,
    };
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._responseModel) {
      metricAttrs[ATTR_GEN_AI_RESPONSE_MODEL] = this._responseModel;
    }
    if (error) {
      metricAttrs[ATTR_ERROR_TYPE] =
        error instanceof Error ? error.name : 'Error';
    }

    this._handler.recordOperationDuration(durationSec, metricAttrs);
    if (this._usage) {
      this._handler.recordTokenUsage(this._usage, metricAttrs);
    }
  }

  private _runCompletionHook(durationSec: number, error?: unknown): void {
    const result: CompletionResult = {
      span: this._span,
      providerName: this._providerName,
      operationName: this._operationName,
      requestModel: this._requestModel,
      responseModel: this._responseModel,
      responseId: this._responseId,
      finishReasons: this._finishReasons,
      usage: this._usage,
      durationSeconds: durationSec,
      inputMessages: this._inputMessages,
      outputMessages: this._outputMessages,
      systemInstructions: this._systemInstructions,
      error,
      attributes: this._customAttributes,
    };

    // Execute asynchronously in background
    void this._handler
      .getCompletionHookManager()
      .execute(result, this._handler.getDiag());
  }

  public getSpan(): Span {
    return this._span;
  }
}

/**
 * Manages the lifecycle and telemetry of an Embedding operation.
 */
export class EmbeddingInvocation {
  private readonly _span: Span;
  private readonly _handler: TelemetryHandler;
  private readonly _startTime: HrTime;
  private readonly _providerName: string;
  private readonly _requestModel?: string;
  private _responseModel?: string;
  private _usage?: TokenUsage;
  private _isEnded = false;

  constructor(
    span: Span,
    handler: TelemetryHandler,
    options: {
      providerName: string;
      requestModel?: string;
      inputTexts?: string[];
      attributes?: Attributes;
    },
    startTime: HrTime = process.hrtime()
  ) {
    this._span = span;
    this._handler = handler;
    this._startTime = startTime;
    this._providerName = options.providerName;
    this._requestModel = options.requestModel;

    const attrs: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
      ...options.attributes,
    };

    if (this._requestModel) {
      attrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }

    this._span.setAttributes(attrs);
  }

  public setResponseModel(model: string): this {
    this._responseModel = model;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);
    return this;
  }

  public getResponseModel(): string | undefined {
    return this._responseModel;
  }

  public setUsage(usage: TokenUsage): this {
    this._usage = usage;
    if (usage.inputTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_INPUT_TOKENS,
        usage.inputTokens
      );
    }
    return this;
  }

  public setAttribute(key: string, value: any): this {
    this._span.setAttribute(key, value);
    return this;
  }

  public stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
    };
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._responseModel) {
      metricAttrs[ATTR_GEN_AI_RESPONSE_MODEL] = this._responseModel;
    }

    this._handler.recordOperationDuration(durationSec, metricAttrs);
    if (this._usage) {
      this._handler.recordTokenUsage(this._usage, metricAttrs);
    }

    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endHr);
  }

  public fail(
    error: Error | string | unknown,
    endTime?: HrTime | number
  ): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
      [ATTR_ERROR_TYPE]: error instanceof Error ? error.name : 'Error',
    };

    this._handler.recordOperationDuration(durationSec, metricAttrs);

    if (error instanceof Error) {
      this._span.recordException(error);
    }

    this._span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    this._span.end(endHr);
  }

  public getSpan(): Span {
    return this._span;
  }
}

/**
 * Manages the lifecycle and telemetry of a Tool execution.
 */
export class ToolInvocation {
  private readonly _span: Span;
  private _isEnded = false;

  constructor(
    span: Span,
    options: {
      toolName: string;
      toolDescription?: string;
      toolCallId?: string;
      toolType?: string;
      toolArguments?: unknown;
      attributes?: Attributes;
    }
  ) {
    this._span = span;
    const attrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
      [ATTR_GEN_AI_TOOL_NAME]: options.toolName,
      ...options.attributes,
    };

    if (options.toolDescription) {
      attrs[ATTR_GEN_AI_TOOL_DESCRIPTION] = options.toolDescription;
    }
    if (options.toolCallId) {
      attrs[ATTR_GEN_AI_TOOL_CALL_ID] = options.toolCallId;
    }
    if (options.toolType) {
      attrs[ATTR_GEN_AI_TOOL_TYPE] = options.toolType;
    }
    if (options.toolArguments !== undefined) {
      attrs[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] =
        typeof options.toolArguments === 'string'
          ? options.toolArguments
          : JSON.stringify(options.toolArguments);
    }

    this._span.setAttributes(attrs);
  }

  public setResult(result: unknown): this {
    if (result !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_TOOL_CALL_RESULT,
        typeof result === 'string' ? result : JSON.stringify(result)
      );
    }
    return this;
  }

  public setAttribute(key: string, value: any): this {
    this._span.setAttribute(key, value);
    return this;
  }

  public setAttributes(attributes: Attributes): this {
    this._span.setAttributes(attributes);
    return this;
  }

  public stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endTime);
  }

  public fail(
    error: Error | string | unknown,
    endTime?: HrTime | number
  ): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    if (error instanceof Error) {
      this._span.recordException(error);
    }
    this._span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    this._span.end(endTime);
  }

  public getSpan(): Span {
    return this._span;
  }
}

/**
 * Manages the lifecycle and telemetry of an Agent invocation (local or remote).
 */
export class AgentInvocation {
  private readonly _span: Span;
  private readonly _handler?: TelemetryHandler;
  private readonly _startTime: HrTime;
  private readonly _providerName?: string;
  private readonly _requestModel?: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;
  private readonly _agentName?: string;
  private _agentId?: string;
  private _agentDescription?: string;
  private _agentVersion?: string;
  private _conversationId?: string;
  private _dataSourceId?: string;
  private _outputType?: string;
  private _usage?: TokenUsage;
  private _finishReasons?: string[];
  private _inputMessages?: InputMessages;
  private _outputMessages?: OutputMessages;
  private _systemInstructions?: SystemInstruction;
  private _firstChunkTime?: HrTime;
  private _customAttributes: Attributes = {};
  private _isEnded = false;

  constructor(
    span: Span,
    handler?: TelemetryHandler,
    options?: AgentInvocationOptions | RemoteAgentInvocationOptions,
    startTime: HrTime = process.hrtime()
  ) {
    this._span = span;
    this._handler = handler;
    this._startTime = startTime;
    this._providerName = (
      options as RemoteAgentInvocationOptions
    )?.providerName;
    this._requestModel = options?.requestModel;
    this._serverAddress = (
      options as RemoteAgentInvocationOptions
    )?.serverAddress;
    this._serverPort = (options as RemoteAgentInvocationOptions)?.serverPort;
    this._agentName = options?.agentName;
    this._agentId = options?.agentId;
    this._agentDescription = options?.agentDescription;
    this._agentVersion = options?.agentVersion;
    this._conversationId = options?.conversationId;
    this._dataSourceId = options?.dataSourceId;
    this._outputType = options?.outputType;

    const attrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
      ...options?.attributes,
    };

    if (this._providerName) {
      attrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
    }
    if (this._requestModel) {
      attrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._agentId) {
      attrs[ATTR_GEN_AI_AGENT_ID] = this._agentId;
    }
    if (this._agentName) {
      attrs[ATTR_GEN_AI_AGENT_NAME] = this._agentName;
    }
    if (this._agentDescription) {
      attrs[ATTR_GEN_AI_AGENT_DESCRIPTION] = this._agentDescription;
    }
    if (this._agentVersion) {
      attrs[ATTR_GEN_AI_AGENT_VERSION] = this._agentVersion;
    }
    if (this._conversationId) {
      attrs[ATTR_GEN_AI_CONVERSATION_ID] = this._conversationId;
    }
    if (this._dataSourceId) {
      attrs[ATTR_GEN_AI_DATA_SOURCE_ID] = this._dataSourceId;
    }
    if (this._outputType) {
      attrs[ATTR_GEN_AI_OUTPUT_TYPE] = this._outputType;
    }
    if (this._serverAddress) {
      attrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
    }
    if (this._serverPort !== undefined) {
      attrs[ATTR_SERVER_PORT] = this._serverPort;
    }

    const reqOpts = options?.requestOptions;
    if (reqOpts) {
      if (reqOpts.temperature !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_TEMPERATURE] = reqOpts.temperature;
      }
      if (reqOpts.topP !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_TOP_P] = reqOpts.topP;
      }
      if (reqOpts.topK !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_TOP_K] = reqOpts.topK;
      }
      if (reqOpts.maxTokens !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = reqOpts.maxTokens;
      }
      if (reqOpts.stopSequences && reqOpts.stopSequences.length > 0) {
        attrs[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = reqOpts.stopSequences;
      }
      if (reqOpts.frequencyPenalty !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY] = reqOpts.frequencyPenalty;
      }
      if (reqOpts.presencePenalty !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY] = reqOpts.presencePenalty;
      }
      if (reqOpts.choiceCount !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_CHOICE_COUNT] = reqOpts.choiceCount;
      }
      if (reqOpts.seed !== undefined) {
        attrs[ATTR_GEN_AI_REQUEST_SEED] = reqOpts.seed;
      }
      if (reqOpts.encodingFormats && reqOpts.encodingFormats.length > 0) {
        attrs[ATTR_GEN_AI_REQUEST_ENCODING_FORMATS] = reqOpts.encodingFormats;
      }
    }

    if (options?.systemInstructions) {
      this.setSystemInstructions(options.systemInstructions);
    }
    if (options?.inputMessages && options.inputMessages.length > 0) {
      this.addInputMessages(options.inputMessages);
    }

    this._span.setAttributes(attrs);
  }

  public setAgentId(agentId: string): this {
    this._agentId = agentId;
    this._span.setAttribute(ATTR_GEN_AI_AGENT_ID, agentId);
    return this;
  }

  public getAgentId(): string | undefined {
    return this._agentId;
  }

  public setAgentName(agentName: string): this {
    this._span.setAttribute(ATTR_GEN_AI_AGENT_NAME, agentName);
    return this;
  }

  public getAgentName(): string | undefined {
    return this._agentName;
  }

  public setAgentDescription(agentDescription: string): this {
    this._agentDescription = agentDescription;
    this._span.setAttribute(ATTR_GEN_AI_AGENT_DESCRIPTION, agentDescription);
    return this;
  }

  public getAgentDescription(): string | undefined {
    return this._agentDescription;
  }

  public setAgentVersion(agentVersion: string): this {
    this._agentVersion = agentVersion;
    this._span.setAttribute(ATTR_GEN_AI_AGENT_VERSION, agentVersion);
    return this;
  }

  public getAgentVersion(): string | undefined {
    return this._agentVersion;
  }

  public setConversationId(conversationId: string): this {
    this._conversationId = conversationId;
    this._span.setAttribute(ATTR_GEN_AI_CONVERSATION_ID, conversationId);
    return this;
  }

  public getConversationId(): string | undefined {
    return this._conversationId;
  }

  public setDataSourceId(dataSourceId: string): this {
    this._dataSourceId = dataSourceId;
    this._span.setAttribute(ATTR_GEN_AI_DATA_SOURCE_ID, dataSourceId);
    return this;
  }

  public getDataSourceId(): string | undefined {
    return this._dataSourceId;
  }

  public setOutputType(outputType: string): this {
    this._outputType = outputType;
    this._span.setAttribute(ATTR_GEN_AI_OUTPUT_TYPE, outputType);
    return this;
  }

  public getOutputType(): string | undefined {
    return this._outputType;
  }

  public setFinishReasons(reasons: string[] | string): this {
    const arr = Array.isArray(reasons) ? reasons : [reasons];
    this._finishReasons = arr;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, arr);
    return this;
  }

  public getFinishReasons(): string[] | undefined {
    return this._finishReasons;
  }

  public setUsage(usage: TokenUsage): this {
    this._usage = usage;
    if (usage.inputTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_INPUT_TOKENS,
        usage.inputTokens
      );
    }
    if (usage.outputTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
        usage.outputTokens
      );
    }
    if (usage.reasoningTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
        usage.reasoningTokens
      );
    }
    if (usage.cacheReadTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
        usage.cacheReadTokens
      );
    }
    if (usage.cacheCreationTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
        usage.cacheCreationTokens
      );
    }
    return this;
  }

  public getUsage(): TokenUsage | undefined {
    return this._usage;
  }

  public addInputMessages(messages: InputMessages): this {
    this._inputMessages = [...(this._inputMessages ?? []), ...messages];
    const mode = this._handler?.getContentCaptureMode() ?? 'none';
    if (
      isSpanContentCaptureEnabled(mode) ||
      isEventContentCaptureEnabled(mode)
    ) {
      const formatted = formatInputMessages(this._inputMessages);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_INPUT_MESSAGES, formatted);
      }
    }
    return this;
  }

  public addOutputMessages(messages: OutputMessages): this {
    this._outputMessages = [...(this._outputMessages ?? []), ...messages];
    const mode = this._handler?.getContentCaptureMode() ?? 'none';
    if (
      isSpanContentCaptureEnabled(mode) ||
      isEventContentCaptureEnabled(mode)
    ) {
      const formatted = formatOutputMessages(this._outputMessages);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, formatted);
      }
    }
    return this;
  }

  public setSystemInstructions(instructions: SystemInstruction): this {
    this._systemInstructions = instructions;
    const mode = this._handler?.getContentCaptureMode() ?? 'none';
    if (
      isSpanContentCaptureEnabled(mode) ||
      isEventContentCaptureEnabled(mode)
    ) {
      const formatted = formatSystemInstructions(instructions);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_SYSTEM_INSTRUCTIONS, formatted);
      }
    }
    return this;
  }

  public setAttribute(key: string, value: any): this {
    this._customAttributes[key] = value;
    this._span.setAttribute(key, value);
    return this;
  }

  public setAttributes(attributes: Attributes): this {
    Object.assign(this._customAttributes, attributes);
    this._span.setAttributes(attributes);
    return this;
  }

  /**
   * Helper for stream chunks recording. On first chunk, marks stream request and records TTFT metric.
   */
  public recordStreamChunk(_chunk?: unknown): this {
    if (!this._firstChunkTime) {
      this._firstChunkTime = process.hrtime();
      this._span.setAttribute(ATTR_GEN_AI_REQUEST_STREAM, true);
      if (this._handler) {
        const ttftSec = calculateDurationSeconds(
          this._startTime,
          this._firstChunkTime
        );
        const metricAttrs: Attributes = {
          [ATTR_GEN_AI_OPERATION_NAME]:
            GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
        };
        if (this._providerName) {
          metricAttrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
        }
        if (this._requestModel) {
          metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
        }
        if (this._serverAddress) {
          metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
        }
        if (this._serverPort !== undefined) {
          metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
        }

        this._handler.recordServerTimeToFirstToken(ttftSec, metricAttrs);
      }
    }
    return this;
  }

  public stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    this._recordMetrics(durationSec);

    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endHr);

    this._runCompletionHook(durationSec);
  }

  public fail(
    error: Error | string | unknown,
    endTime?: HrTime | number
  ): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    this._recordMetrics(durationSec, error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'GenAI agent error';

    if (error instanceof Error) {
      this._span.recordException(error);
    }

    this._span.setStatus({
      code: SpanStatusCode.ERROR,
      message: errorMessage,
    });
    this._span.end(endHr);

    this._runCompletionHook(durationSec, error);
  }

  private _recordMetrics(durationSec: number, error?: unknown): void {
    if (!this._handler) {
      return;
    }
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
    };
    if (this._providerName) {
      metricAttrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
    }
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._serverAddress) {
      metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
    }
    if (this._serverPort !== undefined) {
      metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
    }
    if (error) {
      metricAttrs[ATTR_ERROR_TYPE] =
        error instanceof Error ? error.name : 'Error';
    }

    this._handler.recordOperationDuration(durationSec, metricAttrs);
    if (this._usage) {
      this._handler.recordTokenUsage(this._usage, metricAttrs);
    }
  }

  private _runCompletionHook(durationSec: number, error?: unknown): void {
    if (!this._handler) {
      return;
    }
    const result: CompletionResult = {
      span: this._span,
      providerName: this._providerName,
      operationName: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
      requestModel: this._requestModel,
      finishReasons: this._finishReasons,
      usage: this._usage,
      durationSeconds: durationSec,
      inputMessages: this._inputMessages,
      outputMessages: this._outputMessages,
      systemInstructions: this._systemInstructions,
      error,
      attributes: this._customAttributes,
    };

    void this._handler
      .getCompletionHookManager()
      .execute(result, this._handler.getDiag());
  }

  public getSpan(): Span {
    return this._span;
  }
}

/**
 * Manages the lifecycle and telemetry of a Workflow invocation.
 */
export class WorkflowInvocation {
  private readonly _span: Span;
  private _isEnded = false;

  constructor(
    span: Span,
    options?: {
      workflowName?: string;
      attributes?: Attributes;
    }
  ) {
    this._span = span;
    const attrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
      ...options?.attributes,
    };
    if (options?.workflowName) {
      attrs[ATTR_GEN_AI_WORKFLOW_NAME] = options.workflowName;
    }
    this._span.setAttributes(attrs);
  }

  public setAttribute(key: string, value: any): this {
    this._span.setAttribute(key, value);
    return this;
  }

  public setAttributes(attributes: Attributes): this {
    this._span.setAttributes(attributes);
    return this;
  }

  public stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endTime);
  }

  public fail(
    error: Error | string | unknown,
    endTime?: HrTime | number
  ): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    if (error instanceof Error) {
      this._span.recordException(error);
    }
    this._span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    this._span.end(endTime);
  }

  public getSpan(): Span {
    return this._span;
  }
}

/**
 * Manages the lifecycle and telemetry of a Retrieval operation (vector database / RAG retrievers).
 */
export class RetrievalInvocation {
  private readonly _span: Span;
  private readonly _handler: TelemetryHandler;
  private readonly _startTime: HrTime;
  private readonly _dataSourceId?: string;
  private readonly _providerName?: string;
  private readonly _requestModel?: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;
  private _topK?: number;
  private _isEnded = false;

  constructor(
    span: Span,
    handler: TelemetryHandler,
    options: RetrievalInvocationOptions,
    startTime: HrTime = process.hrtime()
  ) {
    this._span = span;
    this._handler = handler;
    this._startTime = startTime;
    this._dataSourceId = options.dataSourceId;
    this._providerName = options.providerName;
    this._requestModel = options.requestModel;
    this._serverAddress = options.serverAddress;
    this._serverPort = options.serverPort;
    this._topK = options.topK;

    const attrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
      ...options.attributes,
    };

    if (this._dataSourceId) {
      attrs[ATTR_GEN_AI_DATA_SOURCE_ID] = this._dataSourceId;
    }
    if (this._providerName) {
      attrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
    }
    if (this._requestModel) {
      attrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._serverAddress) {
      attrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
    }
    if (this._serverPort !== undefined) {
      attrs[ATTR_SERVER_PORT] = this._serverPort;
    }
    if (this._topK !== undefined) {
      attrs[ATTR_GEN_AI_REQUEST_TOP_K] = this._topK;
    }

    this._span.setAttributes(attrs);

    if (options.queryText) {
      this.setQueryText(options.queryText);
    }
    if (options.documents) {
      this.setDocuments(options.documents);
    }
  }

  public setQueryText(queryText: string): this {
    if (isSpanContentCaptureEnabled(this._handler.getContentCaptureMode())) {
      this._span.setAttribute(ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT, queryText);
    }
    return this;
  }

  public setDocuments(documents: unknown[]): this {
    if (isSpanContentCaptureEnabled(this._handler.getContentCaptureMode())) {
      const formatted = serializeContent(documents);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_RETRIEVAL_DOCUMENTS, formatted);
      }
    }
    return this;
  }

  public setTopK(topK: number): this {
    this._topK = topK;
    this._span.setAttribute(ATTR_GEN_AI_REQUEST_TOP_K, topK);
    return this;
  }

  public setAttribute(key: string, value: any): this {
    this._span.setAttribute(key, value);
    return this;
  }

  public setAttributes(attributes: Attributes): this {
    this._span.setAttributes(attributes);
    return this;
  }

  public stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
    };
    if (this._providerName) {
      metricAttrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
    }
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._serverAddress) {
      metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
    }
    if (this._serverPort !== undefined) {
      metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
    }

    this._handler.recordOperationDuration(durationSec, metricAttrs);

    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endHr);
  }

  public fail(
    error: Error | string | unknown,
    endTime?: HrTime | number
  ): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
      [ATTR_ERROR_TYPE]: error instanceof Error ? error.name : 'Error',
    };
    if (this._providerName) {
      metricAttrs[ATTR_GEN_AI_PROVIDER_NAME] = this._providerName;
    }
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._serverAddress) {
      metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
    }
    if (this._serverPort !== undefined) {
      metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
    }

    this._handler.recordOperationDuration(durationSec, metricAttrs);

    if (error instanceof Error) {
      this._span.recordException(error);
    }

    this._span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    this._span.end(endHr);
  }

  public getSpan(): Span {
    return this._span;
  }
}

/**
 * Manages the lifecycle and telemetry of a Fetch Response operation (fetching previously generated responses).
 */
export class FetchResponseInvocation {
  private readonly _span: Span;
  private readonly _handler: TelemetryHandler;
  private readonly _startTime: HrTime;
  private readonly _providerName: string;
  private readonly _responseId: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;
  private _responseModel?: string;
  private _responseStatus?: string;
  private _finishReasons?: string[];
  private _streamCursor?: string;
  private _outputMessages: OutputMessages = [];
  private _systemInstructions?: SystemInstruction;
  private _isEnded = false;

  constructor(
    span: Span,
    handler: TelemetryHandler,
    options: FetchResponseInvocationOptions,
    startTime: HrTime = process.hrtime()
  ) {
    this._span = span;
    this._handler = handler;
    this._startTime = startTime;
    this._providerName = options.providerName;
    this._responseId = options.responseId;
    this._serverAddress = options.serverAddress;
    this._serverPort = options.serverPort;

    const attrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE,
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
      [ATTR_GEN_AI_RESPONSE_ID]: this._responseId,
      ...options.attributes,
    };

    if (options.requestStream !== undefined) {
      attrs[ATTR_GEN_AI_REQUEST_STREAM] = options.requestStream;
    }
    if (options.streamCursor) {
      attrs[ATTR_GEN_AI_REQUEST_STREAM_CURSOR] = options.streamCursor;
      this._streamCursor = options.streamCursor;
    }
    if (this._serverAddress) {
      attrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
    }
    if (this._serverPort !== undefined) {
      attrs[ATTR_SERVER_PORT] = this._serverPort;
    }

    this._span.setAttributes(attrs);
  }

  public setResponseModel(model: string): this {
    this._responseModel = model;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);
    return this;
  }

  public getResponseModel(): string | undefined {
    return this._responseModel;
  }

  public setResponseStatus(status: string): this {
    this._responseStatus = status;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_STATUS, status);
    return this;
  }

  public getResponseStatus(): string | undefined {
    return this._responseStatus;
  }

  public setFinishReasons(reasons: string[] | string): this {
    const list = Array.isArray(reasons) ? reasons : [reasons];
    this._finishReasons = list;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, list);
    return this;
  }

  public setStreamCursor(cursor: string): this {
    this._streamCursor = cursor;
    this._span.setAttribute(ATTR_GEN_AI_REQUEST_STREAM_CURSOR, cursor);
    return this;
  }

  public getStreamCursor(): string | undefined {
    return this._streamCursor;
  }

  public addOutputMessages(messages: OutputMessages): this {
    this._outputMessages.push(...messages);
    if (isSpanContentCaptureEnabled(this._handler.getContentCaptureMode())) {
      const formatted = formatOutputMessages(this._outputMessages);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, formatted);
      }
    }
    return this;
  }

  public setSystemInstructions(instructions: SystemInstruction): this {
    this._systemInstructions = instructions;
    if (isSpanContentCaptureEnabled(this._handler.getContentCaptureMode())) {
      const formatted = formatSystemInstructions(instructions);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_SYSTEM_INSTRUCTIONS, formatted);
      }
    }
    return this;
  }

  public setAttribute(key: string, value: any): this {
    this._span.setAttribute(key, value);
    return this;
  }

  public setAttributes(attributes: Attributes): this {
    this._span.setAttributes(attributes);
    return this;
  }

  public stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    this._recordMetrics(durationSec);

    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endHr);

    this._runCompletionHook(durationSec);
  }

  public fail(
    error: Error | string | unknown,
    endTime?: HrTime | number
  ): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    this._recordMetrics(durationSec, error);

    if (error instanceof Error) {
      this._span.recordException(error);
    }

    this._span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    this._span.end(endHr);

    this._runCompletionHook(durationSec, error);
  }

  private _recordMetrics(durationSec: number, error?: unknown): void {
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE,
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
    };
    if (this._responseModel) {
      metricAttrs[ATTR_GEN_AI_RESPONSE_MODEL] = this._responseModel;
    }
    if (this._serverAddress) {
      metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
    }
    if (this._serverPort !== undefined) {
      metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
    }
    if (error) {
      metricAttrs[ATTR_ERROR_TYPE] =
        error instanceof Error ? error.name : 'Error';
    }

    this._handler.recordOperationDuration(durationSec, metricAttrs);
  }

  private _runCompletionHook(durationSec: number, error?: unknown): void {
    const result: CompletionResult = {
      span: this._span,
      providerName: this._providerName,
      operationName: GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE,
      responseModel: this._responseModel,
      responseId: this._responseId,
      responseStatus: this._responseStatus,
      finishReasons: this._finishReasons,
      durationSeconds: durationSec,
      outputMessages:
        this._outputMessages.length > 0 ? this._outputMessages : undefined,
      systemInstructions: this._systemInstructions,
      error,
    };

    void this._handler
      .getCompletionHookManager()
      .execute(result, this._handler.getDiag());
  }

  public getSpan(): Span {
    return this._span;
  }
}
