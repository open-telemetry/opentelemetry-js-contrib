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
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_CHOICE_COUNT,
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_SEED,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_TOTAL_TOKENS,
  EVENT_GEN_AI_ASSISTANT_MESSAGE,
  EVENT_GEN_AI_CHOICE,
  EVENT_GEN_AI_SYSTEM_MESSAGE,
  EVENT_GEN_AI_TOOL_MESSAGE,
  EVENT_GEN_AI_USER_MESSAGE,
} from './semconv';
import type {
  ChatMessage,
  CompletionResult,
  ContentCaptureMode,
  InferenceInvocationOptions,
  InputMessages,
  OutputMessage,
  OutputMessages,
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
  private readonly _contentCaptureMode: ContentCaptureMode;
  private _responseModel?: string;
  private _responseId?: string;
  private _finishReasons: string[] = [];
  private _usage?: TokenUsage;
  private _inputMessages?: InputMessages;
  private _outputMessages?: OutputMessages;
  private _systemInstructions?: SystemInstruction;
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
    this._operationName = options.operationName ?? 'chat';
    this._requestModel = options.requestModel;
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
      attrs['server.address'] = options.serverAddress;
    }
    if (options.serverPort) {
      attrs['server.port'] = options.serverPort;
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
  setResponseModel(model: string): this {
    this._responseModel = model;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);
    return this;
  }

  /**
   * Set the response identifier.
   */
  setResponseId(id: string): this {
    this._responseId = id;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, id);
    return this;
  }

  /**
   * Set finish reasons for the response choices.
   */
  setFinishReasons(reasons: string[] | string): this {
    const arr = Array.isArray(reasons) ? reasons : [reasons];
    this._finishReasons = arr;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, arr);
    return this;
  }

  /**
   * Record token usage.
   */
  setUsage(usage: TokenUsage): this {
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
    if (usage.totalTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_TOTAL_TOKENS,
        usage.totalTokens
      );
    }
    return this;
  }

  /**
   * Add input messages to the invocation.
   */
  addInputMessages(messages: InputMessages): this {
    this._inputMessages = [...(this._inputMessages ?? []), ...messages];

    if (isSpanContentCaptureEnabled(this._contentCaptureMode)) {
      const formatted = formatInputMessages(this._inputMessages);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_INPUT_MESSAGES, formatted);
      }
    }

    if (isEventContentCaptureEnabled(this._contentCaptureMode)) {
      for (const msg of messages) {
        this._emitMessageEvent(msg);
      }
    }

    return this;
  }

  /**
   * Add output messages to the invocation.
   */
  addOutputMessages(messages: OutputMessages): this {
    this._outputMessages = [...(this._outputMessages ?? []), ...messages];

    if (isSpanContentCaptureEnabled(this._contentCaptureMode)) {
      const formatted = formatOutputMessages(this._outputMessages);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, formatted);
      }
    }

    if (isEventContentCaptureEnabled(this._contentCaptureMode)) {
      for (let i = 0; i < messages.length; i++) {
        this._emitChoiceEvent(messages[i], i);
      }
    }

    return this;
  }

  /**
   * Set system instructions.
   */
  setSystemInstructions(instructions: SystemInstruction): this {
    this._systemInstructions = instructions;
    if (isSpanContentCaptureEnabled(this._contentCaptureMode)) {
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
  setAttribute(key: string, value: any): this {
    this._customAttributes[key] = value;
    this._span.setAttribute(key, value);
    return this;
  }

  /**
   * Set multiple custom span attributes.
   */
  setAttributes(attributes: Attributes): this {
    Object.assign(this._customAttributes, attributes);
    this._span.setAttributes(attributes);
    return this;
  }

  /**
   * Helper for stream chunks recording.
   */
  recordStreamChunk(_chunk: unknown): this {
    return this;
  }

  private _emitMessageEvent(msg: ChatMessage): void {
    let eventName: string = EVENT_GEN_AI_USER_MESSAGE;
    if (msg.role === 'system') {
      eventName = EVENT_GEN_AI_SYSTEM_MESSAGE;
    } else if (msg.role === 'assistant') {
      eventName = EVENT_GEN_AI_ASSISTANT_MESSAGE;
    } else if (msg.role === 'tool') {
      eventName = EVENT_GEN_AI_TOOL_MESSAGE;
    }

    this._span.addEvent(eventName, {
      'gen_ai.message.role': msg.role,
      'gen_ai.message.content': serializeContent(msg.parts),
    });
  }

  private _emitChoiceEvent(msg: OutputMessage, index: number): void {
    this._span.addEvent(EVENT_GEN_AI_CHOICE, {
      'gen_ai.choice.index': index,
      'gen_ai.choice.finish_reason': msg.finish_reason ?? 'stop',
      'gen_ai.choice.message.role': msg.role,
      'gen_ai.choice.message.content': serializeContent(msg.parts),
    });
  }

  /**
   * Complete the invocation successfully.
   */
  stop(endTime?: HrTime | number): void {
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
  fail(error: Error | string | unknown, endTime?: HrTime | number): void {
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
      metricAttrs['error.type'] = error instanceof Error ? error.name : 'Error';
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

  getSpan(): Span {
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
      [ATTR_GEN_AI_OPERATION_NAME]: 'embeddings',
      ...options.attributes,
    };

    if (this._requestModel) {
      attrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }

    this._span.setAttributes(attrs);
  }

  setResponseModel(model: string): this {
    this._responseModel = model;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);
    return this;
  }

  getResponseModel(): string | undefined {
    return this._responseModel;
  }

  setUsage(usage: TokenUsage): this {
    this._usage = usage;
    if (usage.inputTokens !== undefined) {
      this._span.setAttribute(
        ATTR_GEN_AI_USAGE_INPUT_TOKENS,
        usage.inputTokens
      );
    }
    return this;
  }

  setAttribute(key: string, value: any): this {
    this._span.setAttribute(key, value);
    return this;
  }

  stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
      [ATTR_GEN_AI_OPERATION_NAME]: 'embeddings',
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

  fail(error: Error | string | unknown, endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
      [ATTR_GEN_AI_OPERATION_NAME]: 'embeddings',
      'error.type': error instanceof Error ? error.name : 'Error',
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

  getSpan(): Span {
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
      toolArguments?: unknown;
      attributes?: Attributes;
    }
  ) {
    this._span = span;
    const attrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: 'execute_tool',
      [ATTR_GEN_AI_TOOL_NAME]: options.toolName,
      ...options.attributes,
    };

    if (options.toolDescription) {
      attrs[ATTR_GEN_AI_TOOL_DESCRIPTION] = options.toolDescription;
    }
    if (options.toolCallId) {
      attrs[ATTR_GEN_AI_TOOL_CALL_ID] = options.toolCallId;
    }

    this._span.setAttributes(attrs);
  }

  setResult(_result: unknown): this {
    return this;
  }

  setAttribute(key: string, value: any): this {
    this._span.setAttribute(key, value);
    return this;
  }

  stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endTime);
  }

  fail(error: Error | string | unknown, endTime?: HrTime | number): void {
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

  getSpan(): Span {
    return this._span;
  }
}

/**
 * Manages the lifecycle and telemetry of an Agent invocation.
 */
export class AgentInvocation {
  private readonly _span: Span;
  private _isEnded = false;

  constructor(span: Span) {
    this._span = span;
  }

  setAttribute(key: string, value: any): this {
    this._span.setAttribute(key, value);
    return this;
  }

  stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endTime);
  }

  fail(error: Error | string | unknown, endTime?: HrTime | number): void {
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

  getSpan(): Span {
    return this._span;
  }
}

/**
 * Manages the lifecycle and telemetry of a Workflow invocation.
 */
export class WorkflowInvocation {
  private readonly _span: Span;
  private _isEnded = false;

  constructor(span: Span) {
    this._span = span;
  }

  setAttribute(key: string, value: any): this {
    this._span.setAttribute(key, value);
    return this;
  }

  stop(endTime?: HrTime | number): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;
    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endTime);
  }

  fail(error: Error | string | unknown, endTime?: HrTime | number): void {
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

  getSpan(): Span {
    return this._span;
  }
}
