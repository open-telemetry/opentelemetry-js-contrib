/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SpanKind,
  SpanStatusCode,
  context,
  trace,
  type AttributeValue,
  type Attributes,
  type Context,
  type HrTime,
  type Span,
  type TimeInput,
} from '@opentelemetry/api';
import {
  hrTime,
  hrTimeDuration,
  hrTimeToSeconds,
  timeInputToHrTime,
} from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import type { TelemetryHandler } from '../handler';
import { getErrorType } from '../utils';

/**
 * Options shared by all GenAI invocations.
 *
 * @experimental This interface is experimental and subject to change.
 */
export interface BaseInvocationOptions {
  /**
   * Kind of the span created for this invocation.
   *
   * Defaults to {@link SpanKind.CLIENT}, which is the kind used by GenAI operations
   * that call out to a model provider. Subclasses representing in-process operations
   * (e.g. tool or workflow execution) should pass {@link SpanKind.INTERNAL}.
   */
  kind?: SpanKind;
  /**
   * Initial span attributes.
   *
   * These are set at span creation time so that they are visible to samplers.
   */
  attributes?: Attributes;
  /**
   * Context used as the parent of this invocation.
   *
   * Defaults to the currently active context, so an invocation created inside
   * {@link BaseInvocation.withContext} of another invocation is automatically nested
   * under it.
   */
  parentContext?: Context;
  /** Start time of the invocation. Defaults to the time the invocation is created. */
  startTime?: TimeInput;
}

/**
 * Base class for GenAI telemetry invocations.
 *
 * An invocation owns a single GenAI operation: it starts the underlying span when
 * constructed, tracks duration, exposes hooks for metric emission, event emission and
 * completion callbacks, and ends the span at most once, on {@link stop} or {@link fail}.
 * Callers should set data on the invocation and never end the span directly.
 *
 * Completing the invocation is the caller's responsibility: exactly one {@link stop} or
 * {@link fail}, including on error paths. An invocation that is never completed leaves
 * its span unfinished, so it is never exported.
 *
 * {@link withContext} activates the invocation's context for the duration of a callback.
 * The invocation may outlive the callback, for example until a returned stream is drained,
 * and {@link getContext} covers downstream work that cannot be wrapped in a callback at all.
 *
 * @example
 * ```typescript
 * // `InferenceInvocation` is a concrete subclass of `BaseInvocation`.
 * const invocation = new InferenceInvocation(handler, options);
 * try {
 *   // Keep the whole operation inside the callback so that spans created by the client
 *   // (and continuations after `await`) are children of the invocation span.
 *   const response = await invocation.withContext(async () => {
 *     const response = await client.chat(request);
 *     invocation.setAttribute('custom.attr', 'value');
 *     return response;
 *   });
 *   invocation.stop();
 *   return response;
 * } catch (error) {
 *   invocation.fail(error);
 *   throw error;
 * }
 * ```
 *
 * @experimental This class is experimental and subject to change.
 */
export abstract class BaseInvocation {
  protected readonly _span: Span;
  protected readonly _context: Context;
  protected readonly _handler: TelemetryHandler;
  protected readonly _startTime: HrTime;
  protected _isEnded = false;
  protected _customAttributes: Attributes = {};

  /**
   * Start the invocation by creating and starting the underlying span.
   *
   * @param spanName Name of the span, per GenAI semantic conventions.
   * @param handler Handler providing the tracer, meter, and completion hooks.
   * @param options Span kind, initial attributes, parent context, and start time.
   */
  constructor(
    spanName: string,
    handler: TelemetryHandler,
    options: BaseInvocationOptions = {}
  ) {
    this._handler = handler;
    this._startTime = timeInputToHrTime(options.startTime ?? hrTime());

    const parentContext = options.parentContext ?? context.active();
    this._span = handler.getTracer().startSpan(
      spanName,
      {
        kind: options.kind ?? SpanKind.CLIENT,
        attributes: options.attributes,
        startTime: this._startTime,
      },
      parentContext
    );
    this._context = trace.setSpan(parentContext, this._span);
  }

  /**
   * Return the underlying OpenTelemetry Span.
   *
   * The span is owned by this invocation: use {@link stop} or {@link fail} to end it.
   */
  public getSpan(): Span {
    return this._span;
  }

  /**
   * Return the OpenTelemetry Context holding this invocation's span.
   *
   * Pass it to `context.with()` or `context.bind()` to make the invocation the parent
   * of downstream work that cannot be wrapped by {@link withContext}.
   */
  public getContext(): Context {
    return this._context;
  }

  /**
   * Return whether this invocation has already ended.
   */
  public isEnded(): boolean {
    return this._isEnded;
  }

  /**
   * Set a custom span attribute.
   */
  public setAttribute(key: string, value: AttributeValue): this {
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
   * Run a function with this invocation's context active, so that spans created by the
   * function (or by the libraries it calls) are children of the invocation span.
   *
   * The invocation is NOT ended by this method: the caller must always finish it with
   * {@link stop} or {@link fail}, on both the success and the error path. Completing the
   * invocation inside the callback is allowed but not required; what matters is that it
   * happens exactly once.
   *
   * The context is only active for the duration of the callback, so the callback should
   * wrap the whole operation. For asynchronous work, pass an `async` callback and `await`
   * its result: the context stays active across `await` points inside the callback, while
   * code that runs after the returned promise settles is outside the invocation context.
   * A synchronous callback is equally supported, and is the right choice when the wrapped
   * call returns a value (e.g. a stream) that is consumed later.
   *
   * @param fn Function receiving this invocation.
   * @returns Whatever `fn` returns.
   */
  public withContext<T>(fn: (invocation: this) => T): T {
    return context.with(this._context, () => fn(this));
  }

  /**
   * Complete the invocation successfully and end the underlying span.
   *
   * Ending an already ended invocation is a no-op.
   */
  public stop(endTime?: TimeInput): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;

    const endHr = endTime != null ? timeInputToHrTime(endTime) : hrTime();
    const durationSec = hrTimeToSeconds(hrTimeDuration(this._startTime, endHr));

    this._recordMetrics(durationSec);
    this._emitContentEvents(endHr);

    try {
      this._runCompletionHook(durationSec);
    } finally {
      this._span.end(endHr);
    }
  }

  /**
   * Complete the invocation with an error and end the underlying span.
   *
   * Ending an already ended invocation is a no-op.
   */
  public fail(error: Error | string | unknown, endTime?: TimeInput): void {
    if (this._isEnded) {
      return;
    }
    this._isEnded = true;

    const endHr = endTime != null ? timeInputToHrTime(endTime) : hrTime();
    const durationSec = hrTimeToSeconds(hrTimeDuration(this._startTime, endHr));

    this._recordMetrics(durationSec, error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : String(error);

    const errorType = getErrorType(error);
    this._span.setAttribute(ATTR_ERROR_TYPE, errorType);

    const errorObj = error instanceof Error ? error : new Error(errorMessage);

    if (error instanceof Error) {
      this._span.recordException(error);
    }

    this._emitContentEvents(endHr);

    this._span.setStatus({
      code: SpanStatusCode.ERROR,
      message: errorMessage,
    });

    try {
      this._runCompletionHook(durationSec, errorObj);
    } finally {
      this._span.end(endHr);
    }
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
  protected _runCompletionHook(_durationSec: number, _error?: Error): void {}
}
