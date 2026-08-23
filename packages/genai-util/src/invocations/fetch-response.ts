/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes, HrTime, Span, TimeInput } from '@opentelemetry/api';
import { hrTime } from '@opentelemetry/core';
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
  formatOutputMessages,
  formatSystemInstructions,
  getErrorType,
} from '../utils';
import { isSpanContentCaptureEnabled } from '../environment-variables';
import type { TelemetryHandler } from '../handler';
import { BaseInvocation } from './base';

/**
 * Manages the lifecycle and telemetry of a Fetch Response operation (fetching previously generated responses).
 *
 * @experimental This class is experimental and subject to change.
 */
export class FetchResponseInvocation extends BaseInvocation {
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

  constructor(
    span: Span,
    handler: TelemetryHandler,
    options: FetchResponseInvocationOptions,
    startTime: TimeInput = hrTime()
  ) {
    super(span, handler, startTime);
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
    if (
      this._handler &&
      isSpanContentCaptureEnabled(this._handler.getContentCaptureMode())
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
    if (
      this._handler &&
      isSpanContentCaptureEnabled(this._handler.getContentCaptureMode())
    ) {
      const formatted = formatSystemInstructions(instructions);
      if (formatted) {
        this._span.setAttribute(ATTR_GEN_AI_SYSTEM_INSTRUCTIONS, formatted);
      }
    }
    return this;
  }

  protected override _recordMetrics(
    durationSec: number,
    error?: unknown
  ): void {
    if (!this._handler) {
      return;
    }
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

  /**
   * Emit log-based event `gen_ai.client.inference.operation.details`.
   *
   * NOTE: Currently a no-op placeholder. Will be implemented using LoggerProvider / EventLogger
   * once the Logs & Events API is stable in OpenTelemetry JavaScript.
   */
  protected override _emitContentEvents(_endTime?: HrTime): void {
    // No-op until Logs/Events API is stable in JS.
  }

  protected override _runCompletionHook(
    durationSec: number,
    error?: unknown
  ): void {
    if (!this._handler) {
      return;
    }
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
      attributes: this._customAttributes,
    };

    void this._handler
      .getCompletionHookManager()
      .execute(result, this._handler.getDiag());
  }
}
