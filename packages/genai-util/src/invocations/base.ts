/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SpanStatusCode,
  type Attributes,
  type HrTime,
  type Span,
  type TimeInput,
} from '@opentelemetry/api';
import { hrTime, timeInputToHrTime } from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import type { TelemetryHandler } from '../handler';
import { calculateDurationSeconds, getErrorType } from '../utils';

/**
 * Base class for GenAI telemetry invocations.
 * Manages the underlying Span lifecycle, duration tracking, attribute manipulation,
 * error handling, and hooks for metric emission and completion callbacks.
 *
 * @experimental This class is experimental and subject to change.
 */
export abstract class BaseInvocation {
  protected readonly _span: Span;
  protected readonly _handler?: TelemetryHandler;
  protected readonly _startTime: HrTime;
  protected _isEnded = false;
  protected _customAttributes: Attributes = {};

  constructor(
    span: Span,
    handler?: TelemetryHandler,
    startTime: TimeInput = hrTime()
  ) {
    this._span = span;
    this._handler = handler;
    this._startTime = timeInputToHrTime(startTime);
  }

  /**
   * Return the underlying OpenTelemetry Span.
   */
  public getSpan(): Span {
    return this._span;
  }

  /**
   * Set a custom span attribute.
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
   * Complete the invocation successfully.
   */
  public stop(endTime?: TimeInput): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;

    const endHr = endTime != null ? timeInputToHrTime(endTime) : hrTime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    this._recordMetrics(durationSec);
    this._emitContentEvents(endHr);

    this._span.setStatus({ code: SpanStatusCode.OK });
    this._span.end(endHr);

    this._runCompletionHook(durationSec);
  }

  /**
   * Complete the invocation with an error.
   */
  public fail(error: Error | string | unknown, endTime?: TimeInput): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;

    const endHr = endTime != null ? timeInputToHrTime(endTime) : hrTime();
    const durationSec = calculateDurationSeconds(this._startTime, endHr);

    this._recordMetrics(durationSec, error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : String(error);

    const errorType = getErrorType(error);
    this._span.setAttribute(ATTR_ERROR_TYPE, errorType);

    if (error instanceof Error) {
      this._span.recordException(error);
    }

    this._emitContentEvents(endHr);

    this._span.setStatus({
      code: SpanStatusCode.ERROR,
      message: errorMessage,
    });
    this._span.end(endHr);

    this._runCompletionHook(durationSec, error);
  }

  /**
   * Hook for subclasses to emit operation-specific metrics on stop/fail.
   */
  protected _recordMetrics(_durationSec: number, _error?: unknown): void {}

  /**
   * Hook for subclasses to emit log-based GenAI events (e.g. `gen_ai.client.inference.operation.details`).
   *
   * NOTE: Currently a no-op placeholder. Will be implemented with the OpenTelemetry Logs & Events API
   * once `@opentelemetry/api-logs` and EventLogger reach stability in OpenTelemetry JavaScript.
   */
  protected _emitContentEvents(_endTime?: HrTime): void {}

  /**
   * Hook for subclasses to execute registered completion hooks on stop/fail.
   */
  protected _runCompletionHook(_durationSec: number, _error?: unknown): void {}
}
