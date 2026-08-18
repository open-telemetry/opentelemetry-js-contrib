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
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_REQUEST_STREAM_CURSOR,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_STATUS,
  ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE,
} from '../semconv';
import type {
  CompletionResult,
  FetchResponseInvocationOptions,
  OutputMessages,
  SystemInstruction,
} from '../types';
import {
  calculateDurationSeconds,
  formatOutputMessages,
  formatSystemInstructions,
  getErrorType,
} from '../utils';
import { isSpanContentCaptureEnabled } from '../environment-variables';
import type { TelemetryHandler } from '../handler';

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

  public setTimeToFirstChunk(seconds: number): this {
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK, seconds);
    return this;
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

    const errorType = getErrorType(error);
    this._span.setAttribute(ATTR_ERROR_TYPE, errorType);

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
      metricAttrs[ATTR_ERROR_TYPE] = getErrorType(error);
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
