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
  ATTR_GEN_AI_REQUEST_REASONING_LEVEL,
  ATTR_GEN_AI_REQUEST_SEED,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
} from '../semconv';
import type {
  CompletionResult,
  ContentCaptureMode,
  InferenceInvocationOptions,
  InputMessages,
  OutputMessages,
  SystemInstruction,
  TokenUsage,
} from '../types';
import {
  calculateDurationSeconds,
  formatInputMessages,
  formatOutputMessages,
  formatSystemInstructions,
  getErrorType,
} from '../utils';
import { isSpanContentCaptureEnabled } from '../environment-variables';
import type { TelemetryHandler } from '../handler';

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

    if (isSpanContentCaptureEnabled(this._contentCaptureMode)) {
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

    if (isSpanContentCaptureEnabled(this._contentCaptureMode)) {
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

    const errorType = getErrorType(error);
    this._span.setAttribute(ATTR_ERROR_TYPE, errorType);

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
      metricAttrs[ATTR_ERROR_TYPE] = getErrorType(error);
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
