/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, type Attributes, type HrTime } from '@opentelemetry/api';
import { hrTime, hrTimeDuration, hrTimeToSeconds } from '@opentelemetry/core';
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
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
} from '../semconv';
import type {
  ContentCaptureMode,
  InferenceInvocationOptions,
  InputMessages,
  OutputMessages,
  SystemInstructions,
  TokenUsage,
} from '../types';
import {
  formatInputMessages,
  formatOutputMessages,
  formatSystemInstructions,
  getErrorType,
  getRequestOptionsAttributes,
} from '../utils';
import type { TelemetryHandler } from '../handler';
import { BaseInvocation } from './base';

/**
 * Build the span attributes that are known when the inference span is started.
 *
 * These are passed to the span at creation time so that they are visible to samplers.
 */
function buildInitialAttributes(
  options: InferenceInvocationOptions,
  operationName: string,
  contentCaptureMode: ContentCaptureMode
): Attributes {
  const attrs: Attributes = {
    [ATTR_GEN_AI_PROVIDER_NAME]: options.providerName,
    [ATTR_GEN_AI_OPERATION_NAME]: operationName,
    ...options.attributes,
  };

  if (options.requestModel) {
    attrs[ATTR_GEN_AI_REQUEST_MODEL] = options.requestModel;
  }

  if (options.conversationId) {
    attrs[ATTR_GEN_AI_CONVERSATION_ID] = options.conversationId;
  }

  if (options.serverAddress) {
    attrs[ATTR_SERVER_ADDRESS] = options.serverAddress;
  }
  if (options.serverPort !== undefined) {
    attrs[ATTR_SERVER_PORT] = options.serverPort;
  }

  Object.assign(attrs, getRequestOptionsAttributes(options.requestOptions));

  if (contentCaptureMode === 'span_only') {
    if (options.systemInstructions) {
      const formatted = formatSystemInstructions(options.systemInstructions);
      if (formatted) {
        attrs[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] = formatted;
      }
    }

    if (options.inputMessages && options.inputMessages.length > 0) {
      const formatted = formatInputMessages(options.inputMessages);
      if (formatted) {
        attrs[ATTR_GEN_AI_INPUT_MESSAGES] = formatted;
      }
    }
  }

  return attrs;
}

/**
 * Format a GenAI span name for an inference invocation adhering to
 * OpenTelemetry semantic conventions.
 *
 * Format: `{gen_ai.operation.name} {gen_ai.request.model}` when model is present,
 * or `{gen_ai.operation.name}` when model is omitted.
 *
 * @param operationName - The GenAI operation name.
 * @param requestModel - Optional model name requested.
 * @returns Standardized span name string.
 */
function getInferenceSpanName(
  operationName: string,
  requestModel?: string
): string {
  const model = requestModel?.trim();
  return model ? `${operationName} ${model}` : operationName;
}

/**
 * Manages the lifecycle and telemetry of an LLM / GenAI inference operation.
 *
 * @experimental This class is experimental and subject to change.
 */
export class InferenceInvocation extends BaseInvocation {
  private readonly _providerName: string;
  private readonly _operationName: string;
  private readonly _requestModel?: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;
  private readonly _contentCaptureMode: ContentCaptureMode;
  private _responseModel?: string;
  private _usage?: TokenUsage;
  private _inputMessages?: InputMessages;
  private _outputMessages?: OutputMessages;
  private _firstChunkTime?: HrTime;

  /**
   * Start an inference invocation, creating and starting the underlying span.
   *
   * @param handler Handler providing the tracer, meter, and completion hooks.
   * @param options Request details, parent context, and initial attributes.
   */
  constructor(handler: TelemetryHandler, options: InferenceInvocationOptions) {
    const operationName =
      options.operationName ?? GEN_AI_OPERATION_NAME_VALUE_CHAT;
    const contentCaptureMode = handler.getContentCaptureMode();

    super(getInferenceSpanName(operationName, options.requestModel), handler, {
      kind: SpanKind.CLIENT,
      attributes: buildInitialAttributes(
        options,
        operationName,
        contentCaptureMode
      ),
      context: options.parentContext,
      startTime: options.startTime,
    });

    this._providerName = options.providerName;
    this._operationName = operationName;
    this._requestModel = options.requestModel;
    this._serverAddress = options.serverAddress;
    this._serverPort = options.serverPort;
    this._contentCaptureMode = contentCaptureMode;
    this._inputMessages =
      options.inputMessages && options.inputMessages.length > 0
        ? [...options.inputMessages]
        : undefined;
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
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, id);
    return this;
  }

  /**
   * Set finish reasons for the response choices.
   */
  public setFinishReasons(reasons: string[] | string): this {
    const arr = Array.isArray(reasons) ? reasons : [reasons];
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
        ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
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

    if (this._contentCaptureMode === 'span_only') {
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

    if (this._contentCaptureMode === 'span_only') {
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
  public setSystemInstructions(instructions: SystemInstructions): this {
    if (this._contentCaptureMode === 'span_only') {
      const formatted = formatSystemInstructions(instructions);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_SYSTEM_INSTRUCTIONS, formatted);
      }
    }
    return this;
  }

  /**
   * Set time to first chunk in seconds for streaming responses.
   */
  public setTimeToFirstChunk(seconds: number): this {
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK, seconds);
    return this;
  }

  /**
   * Helper for stream chunks recording. On first chunk, marks stream request and records TTFT metric.
   */
  public recordStreamChunk(_chunk?: unknown): this {
    if (!this._firstChunkTime) {
      this._firstChunkTime = hrTime();
      this._span.setAttribute(ATTR_GEN_AI_REQUEST_STREAM, true);
      const ttftSec = hrTimeToSeconds(
        hrTimeDuration(this._startTime, this._firstChunkTime)
      );
      this._span.setAttribute(
        ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
        ttftSec
      );

      this._handler.recordTimeToFirstChunk(
        ttftSec,
        this._getMetricAttributes(),
        this._context
      );
    }
    return this;
  }

  /**
   * Build the metric attributes shared by all metrics recorded for this invocation.
   */
  private _getMetricAttributes(error?: unknown): Attributes {
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
    if (error) {
      metricAttrs[ATTR_ERROR_TYPE] = getErrorType(error);
    }
    return metricAttrs;
  }

  protected override _recordMetrics(
    durationSec: number,
    error?: unknown
  ): void {
    const metricAttrs = this._getMetricAttributes(error);

    // The invocation context is passed explicitly: metrics are recorded while the
    // invocation's context may no longer be active, and exemplars must still point
    // at the invocation span.
    this._handler.recordOperationDuration(
      durationSec,
      metricAttrs,
      this._context
    );
    if (this._usage) {
      this._handler.recordTokenUsage(this._usage, metricAttrs, this._context);
    }
  }

  /**
   * Emit log-based event `gen_ai.client.inference.operation.details`.
   *
   * NOTE: Currently a no-op placeholder. Will be implemented using LoggerProvider / EventLogger
   * once the Logs & Events API is stable in OpenTelemetry JavaScript.
   */
  protected override _emitContentEvent(_endTime?: HrTime): void {
    // No-op until Logs/Events API is stable in JS.
  }

  // protected override _runCompletionHook(
  //   durationSec: number,
  //   error?: Error
  // ): void {
  //   const result: CompletionResult = {
  //     span: this._span,
  //     providerName: this._providerName,
  //     operationName: this._operationName,
  //     requestModel: this._requestModel,
  //     responseModel: this._responseModel,
  //     responseId: this._responseId,
  //     finishReasons: this._finishReasons,
  //     usage: this._usage,
  //     durationSeconds: durationSec,
  //     inputMessages: this._inputMessages,
  //     outputMessages: this._outputMessages,
  //     systemInstructions: this._systemInstructions,
  //     error,
  //     attributes: this._customAttributes,
  //   };

  //   // Execute asynchronously in background
  //   void this._handler
  //     .getCompletionHookManager()
  //     .execute(result, this._handler.getDiag());
  // }
}
