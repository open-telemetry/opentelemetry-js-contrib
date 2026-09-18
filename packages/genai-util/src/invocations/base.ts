/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SpanStatusCode,
  context,
  trace,
  type AttributeValue,
  type Attributes,
  type Context,
  type HrTime,
  type Span,
  type SpanKind,
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
   * Chosen by the concrete invocation rather than by the caller: use
   * {@link SpanKind.CLIENT} for operations that call out to a model provider, and
   * {@link SpanKind.INTERNAL} for in-process operations (e.g. tool or workflow
   * execution).
   */
  kind: SpanKind;
  /**
   * Initial span attributes.
   *
   * These are set at span creation time so that they are visible to samplers.
   *
   * These are NOT recorded on metrics: use {@link metricAttributes} for dimensions that
   * must appear on metrics.
   */
  attributes?: Attributes;
  /**
   * Initial metric attributes.
   *
   * These are recorded on the metrics emitted for this invocation and are NOT set on the
   * span. Each distinct combination of values creates a new time series, so they must be
   * low cardinality: never put message content, user identifiers, request identifiers, or
   * other unbounded values here.
   *
   * Concrete invocations seed this with their operation's semantic convention dimensions,
   * spreading the caller's own metric attributes last so that explicit caller values win.
   * Dimensions that are only known later (e.g. `gen_ai.response.model`) are added to
   * `_metricAttributes` as they arrive.
   */
  metricAttributes?: Attributes;
  /**
   * Context used as the parent of this invocation.
   *
   * Defaults to the currently active context, so an invocation created inside
   * {@link BaseInvocation.withContext} of another invocation is automatically nested
   * under it.
   */
  context?: Context;
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
 * The invocation may outlive the callback, for example until a returned stream is drained;
 * work that happens after the callback returns is not parented to the invocation.
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
  protected _metricAttributes: Attributes;

  /**
   * Start the invocation by creating and starting the underlying span.
   *
   * @param spanName Name of the span, per GenAI semantic conventions.
   * @param handler Handler providing the tracer and meter.
   * @param options Span kind, initial attributes, parent context, and start time.
   */
  constructor(
    spanName: string,
    handler: TelemetryHandler,
    options: BaseInvocationOptions
  ) {
    this._handler = handler;
    this._startTime = timeInputToHrTime(options.startTime ?? hrTime());
    this._metricAttributes = { ...options.metricAttributes };

    const parentContext = options.context ?? context.active();
    this._span = handler.getTracer().startSpan(
      spanName,
      {
        kind: options.kind,
        attributes: options.attributes,
        startTime: this._startTime,
      },
      parentContext
    );
    this._context = trace.setSpan(parentContext, this._span);
  }

  /**
   * Return whether this invocation has already ended.
   */
  public isEnded(): boolean {
    return this._isEnded;
  }

  /**
   * Return whether message content (prompts, completions, tool calls) should be
   * captured for this invocation.
   *
   * Delegates to the handler, which enables capture when the content capture mode is
   * not `'none'`. Subclasses should gate the recording of any sensitive content on this
   * value.
   */
  public shouldCaptureContent(): boolean {
    return this._handler.shouldCaptureContent();
  }

  /**
   * Set a custom span attribute.
   *
   * Span attributes are per-invocation and may be high cardinality. They are NOT
   * recorded on metrics: use {@link setMetricAttribute} for that.
   */
  public setAttribute(key: string, value: AttributeValue): this {
    this._span.setAttribute(key, value);
    return this;
  }

  /**
   * Set multiple custom span attributes.
   *
   * Span attributes are per-invocation and may be high cardinality. They are NOT
   * recorded on metrics: use {@link setMetricAttributes} for that.
   */
  public setAttributes(attributes: Attributes): this {
    this._span.setAttributes(attributes);
    return this;
  }

  /**
   * Set a custom metric attribute.
   *
   * The attribute is recorded on the metrics emitted for this invocation and is NOT set
   * on the span. Every distinct value creates a new time series, so the value must be low
   * cardinality: never pass message content, user identifiers, request identifiers, or
   * other unbounded values.
   */
  public setMetricAttribute(key: string, value: AttributeValue): this {
    this._metricAttributes[key] = value;
    return this;
  }

  /**
   * Set multiple custom metric attributes.
   *
   * The attributes are recorded on the metrics emitted for this invocation and are NOT set
   * on the span. They must be low cardinality; see {@link setMetricAttribute}.
   */
  public setMetricAttributes(attributes: Attributes): this {
    Object.assign(this._metricAttributes, attributes);
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
   * Ending an already ended invocation is a no-op. Failures while emitting the
   * invocation's telemetry are logged through the handler's diagnostic logger and are
   * never thrown at the caller; the span is ended either way.
   */
  public stop(endTime?: TimeInput): void {
    this._end(endTime);
  }

  /**
   * Complete the invocation with an error and end the underlying span.
   *
   * Ending an already ended invocation is a no-op. Failures while emitting the
   * invocation's telemetry are logged through the handler's diagnostic logger and are
   * never thrown at the caller, so calling this from a `catch` block cannot replace the
   * application's own error; the span is ended either way.
   */
  public fail(error: unknown, endTime?: TimeInput): void {
    this._end(endTime, { error });
  }

  /**
   * Shared completion path for {@link stop} and {@link fail}.
   *
   * The span is always ended once this method has taken ownership of the invocation:
   * emitting telemetry must never leave an unfinished span behind, and must never
   * surface a new exception to the instrumented application, which typically calls
   * {@link fail} from its own error path.
   *
   * @param endTime End time of the invocation, or `undefined` to use the current time.
   * @param failure The failure to record, or `undefined` for a successful invocation.
   *   Boxed because `error` is `unknown` and may legitimately be `undefined`, so a bare
   *   optional parameter could not distinguish success from a failure with no value.
   */
  private _end(endTime?: TimeInput, failure?: { error: unknown }): void {
    if (this._isEnded) {
      return;
    }

    // Resolved before the invocation is marked as ended: `timeInputToHrTime` throws on an
    // invalid `TimeInput`, and that is a caller bug worth surfacing rather than absorbing
    // into an invocation that can never be completed again. It also guarantees that the
    // `finally` below always has a valid timestamp to end the span with.
    const endHr = endTime != null ? timeInputToHrTime(endTime) : hrTime();
    this._isEnded = true;

    try {
      const durationSec = hrTimeToSeconds(
        hrTimeDuration(this._startTime, endHr)
      );
      let errorType: string | undefined;

      if (failure) {
        // The span's error state is recorded before the subclass hooks run so that a hook
        // that throws cannot leave a failed invocation reported as a span without an error
        // status.
        errorType = getErrorType(failure.error);
        this._span.setAttribute(ATTR_ERROR_TYPE, errorType);
        this._span.setStatus({ code: SpanStatusCode.ERROR });

        // The status description is optional, so it is layered on top of a status that is
        // already complete without it: an invocation that cannot describe its error, or
        // whose description hook throws, still reports the failure.
        const description = this._getErrorDescription(failure.error);
        if (description) {
          this._span.setStatus({
            code: SpanStatusCode.ERROR,
            message: description,
          });
        }
      }

      this._recordMetrics(durationSec, errorType);

      this._emitContentEvent(endHr);
    } catch (err) {
      // Reached when a subclass hook or error introspection throws. Telemetry is
      // best-effort: report the bug through diagnostics and keep the failure away from
      // the caller's own control flow.
      this._handler
        .getDiag()
        .error('Error while ending GenAI invocation telemetry', err);
    } finally {
      this._span.end(endHr);
    }
  }

  /**
   * Emit the operation-specific metrics for this invocation on stop/fail.
   *
   * Every concrete invocation must implement this: each GenAI operation has at least an
   * operation duration metric defined by the semantic conventions. A subclass with
   * nothing to record must say so explicitly with an empty body.
   *
   * Record with {@link _metricAttributes}, spreading it when a measurement needs an extra
   * dimension of its own (e.g. `{ ...this._metricAttributes, [ATTR_GEN_AI_TOKEN_TYPE]:
   * 'input' }`) so that the dimension does not leak into the invocation's other
   * measurements. Pass `this._context` to the recording call so that exemplars are
   * associated with the invocation span.
   *
   * @param durationSec Duration of the invocation in seconds.
   * @param errorType The resolved `error.type` value, or `undefined` if the invocation
   *   succeeded.
   */
  protected abstract _recordMetrics(
    durationSec: number,
    errorType?: string
  ): void;

  /**
   * Hook for subclasses to emit the invocation's log-based GenAI content event.
   *
   * Per the GenAI semantic conventions an invocation emits at most one such event:
   * inference operations emit a single `gen_ai.client.inference.operation.details`
   * carrying the whole exchange in its `gen_ai.input.messages` and
   * `gen_ai.output.messages` fields, so neither a multi-turn history nor a
   * multi-candidate response produces additional events. Operations with no content
   * event defined (embeddings, tool and agent operations) emit nothing.
   *
   * NOTE: Currently a no-op placeholder. Will be implemented with the OpenTelemetry Logs & Events API
   * once `@opentelemetry/api-logs` and EventLogger reach stability in OpenTelemetry JavaScript.
   */
  protected _emitContentEvent(_endTime?: HrTime): void {}

  /**
   * Hook for subclasses to describe a failure as the span status description.
   *
   * The description is optional in the OpenTelemetry specification, and it is only ever
   * read by a human, so the default is to set no description at all: the failure is
   * already carried by the error status and by the `error.type` attribute, which is the
   * value tooling actually queries. A subclass overrides this only when it can turn the
   * raw value into something predictable and useful, typically because it knows the error
   * shape of the SDK it instruments (e.g. a provider's message field).
   *
   * Keep the result short, human readable and free of sensitive data, and do not simply
   * repeat `error.type`, which is already on the span. An empty or `undefined` result
   * leaves the status without a description.
   *
   * @param _error The value passed to {@link fail}, which may be anything a library
   *   throws or rejects with, not necessarily an `Error`.
   * @returns The status description, or `undefined` to leave it unset.
   */
  protected _getErrorDescription(_error: unknown): string | undefined {
    return undefined;
  }
}
