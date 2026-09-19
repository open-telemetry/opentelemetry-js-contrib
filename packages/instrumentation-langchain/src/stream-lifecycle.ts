/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context } from '@opentelemetry/api';
import type { Context, DiagLogger } from '@opentelemetry/api';

export interface StreamSourceOutcome {
  /** True only on natural source EOF, never producer return/cancellation. */
  completed: boolean;
  failed: boolean;
  error?: unknown;
}

export interface StreamLifecycleOptions {
  context?: Context;
  /**
   * Always-fulfilled terminal signal for this exact stream's producer. Resolve
   * with completed=true only on natural EOF, completed=false on cancellation,
   * or failed=true and the original error on failure (including throw undefined).
   * The tracker alone never ends observation; a public consumer must finish.
   */
  sourceCompletion?: Promise<StreamSourceOutcome>;
  onChunk(value: unknown): void;
  /**
   * completed is true only when the original output was fully observed through
   * public consumption. Native pipelines report completed=false, even on
   * success, so a callback must discard previously captured chunks. failed
   * distinguishes failure from successful termination with unavailable output.
   *
   * captureComplete additionally identifies unavailable capture, as opposed to
   * cancellation. Native algorithms are not replaced to obtain their chunks.
   * In particular, transformed EOF cannot prove source completion: a transform
   * may terminate early.
   */
  onEnd(
    completed: boolean,
    error: unknown,
    failed: boolean,
    captureComplete: boolean
  ): void;
  diag: Pick<DiagLogger, 'debug'>;
}

type End = (
  completed: boolean,
  error?: unknown,
  failed?: boolean,
  sourceComplete?: boolean
) => void;
type Method = (...args: unknown[]) => unknown;

interface Consumer {
  cancelled: boolean;
  delegated: boolean;
  original: boolean;
  end: End;
}

function isObject(value: unknown): value is object {
  return (
    value !== null && (typeof value === 'object' || typeof value === 'function')
  );
}

function isResult(
  value: unknown
): value is { done?: boolean; value?: unknown } {
  return isObject(value) && 'done' in value;
}

/**
 * Observe public consumption, optionally using an exact producer signal to
 * disambiguate native pipelines. Producer signals alone never end observation.
 * No stream, reader, iterator, result, or returned promise is replaced.
 */
export function observeStream<T extends object>(
  stream: T,
  options: StreamLifecycleOptions
): T {
  const observed = new WeakSet<object>();
  let ended = false;
  let captureComplete = true;
  let depth = 0;
  let sourceCompleted = false;
  let sourceOutcome: StreamSourceOutcome | undefined;
  let hasConsumerOutcome = false;
  const sourceListeners = new Set<() => void>();

  function diagnostic(message: string) {
    try {
      options.diag.debug(`LangChain: ${message}`);
    } catch {
      // Diagnostics must not change application behavior.
    }
  }

  function safely(callback: () => void) {
    try {
      callback();
    } catch {
      captureComplete = false;
      diagnostic('could not observe stream consumption');
    }
  }

  function withContext<R>(callback: () => R): R {
    return options.context
      ? context.with(options.context, callback)
      : callback();
  }

  const end: End = (completed, error, failed = false) => {
    if (ended) return;
    hasConsumerOutcome = true;
    if (sourceOutcome?.failed) {
      completed = false;
      error = sourceOutcome.error;
      failed = true;
    } else if (sourceOutcome && !sourceOutcome.completed) {
      completed = false;
    }
    ended = true;
    sourceListeners.clear();
    safely(() =>
      withContext(() =>
        options.onEnd(
          completed && captureComplete,
          error,
          failed,
          captureComplete
        )
      )
    );
  };

  function omitContent() {
    if (!captureComplete) return;
    captureComplete = false;
    diagnostic(
      'native stream pipeline output is not observable; omitting captured content'
    );
  }

  function observeResult(
    result: unknown,
    success: (value: unknown) => void,
    failure: (error: unknown) => void
  ) {
    // Attaching handlers, rather than returning .then(), preserves subclasses
    // and the identity of promises returned by application overrides.
    if (result instanceof Promise) {
      try {
        void result.then(
          value => safely(() => success(value)),
          error => safely(() => failure(error))
        );
      } catch {
        diagnostic('could not attach stream completion observer');
      }
    }
  }

  function wrap(
    target: object,
    key: PropertyKey,
    invoke: (original: Method, args: unknown[]) => unknown
  ) {
    try {
      const original: unknown = Reflect.get(target, key);
      if (typeof original !== 'function') return;
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        ...descriptor,
        value: function (this: unknown, ...args: unknown[]) {
          // A borrowed method must operate on its actual receiver, without
          // attributing that other object's consumption to this operation.
          if (this !== target) return Reflect.apply(original, this, args);
          return withContext(() =>
            invoke((...values) => Reflect.apply(original, target, values), args)
          );
        },
      });
    } catch {
      diagnostic('could not wrap a public stream method');
    }
  }

  function read(
    target: object,
    key: PropertyKey,
    consumer: Consumer,
    released?: () => boolean
  ) {
    wrap(target, key, (original, args) => {
      if (depth) return Reflect.apply(original, target, args);
      let result: unknown;
      depth++;
      try {
        result = Reflect.apply(original, target, args);
      } catch (error) {
        readFailure(consumer, error);
        throw error;
      } finally {
        depth--;
      }
      observeResult(
        result,
        value => {
          if (consumer.delegated || !isResult(value)) return;
          if (value.done) {
            // cancel() closes pending reads before its own promise settles.
            // Let the cancellation observer decide success versus failure.
            if (!consumer.cancelled && !released?.())
              consumer.end(true, undefined, false, consumer.original);
          } else if (!ended && captureComplete) {
            withContext(() => options.onChunk(value.value));
          }
        },
        error => readFailure(consumer, error)
      );
      return result;
    });
  }

  function readFailure(consumer: Consumer, error: unknown) {
    // Reading an untransformed tee branch exposes a shared-source failure.
    // A transformed reader's failure may instead belong only to that branch.
    if (consumer.original) end(false, error, true);
    else consumer.end(false, error, true);
  }

  function cancel(
    target: object,
    key: PropertyKey,
    consumer: Consumer,
    release?: () => void
  ) {
    wrap(target, key, (original, args) => {
      if (release) {
        release();
        return Reflect.apply(original, target, args);
      }
      if (depth) return Reflect.apply(original, target, args);
      consumer.cancelled = true;
      let result: unknown;
      depth++;
      try {
        result = Reflect.apply(original, target, args);
      } catch (error) {
        consumer.end(false, error, true);
        throw error;
      } finally {
        depth--;
      }
      observeResult(
        result,
        () => consumer.end(false),
        error => consumer.end(false, error, true)
      );
      return result;
    });
  }

  function preventCancel(value: unknown): boolean {
    if (!isObject(value)) return false;
    // Avoid invoking a user getter a second time after the native method has
    // already read it. Unknown accessor values conservatively permit reuse.
    for (
      let current: object | null = value;
      current;
      current = Object.getPrototypeOf(current)
    ) {
      const descriptor = Object.getOwnPropertyDescriptor(
        current,
        'preventCancel'
      );
      if (descriptor) {
        if ('value' in descriptor) return Boolean(descriptor.value);
        diagnostic(
          'preventCancel accessor is not re-evaluated; iterator return completion is not observable'
        );
        return true;
      }
    }
    return false;
  }

  function iterator(target: object, consumer: Consumer, keepOpen = false) {
    if (observed.has(target)) return;
    observed.add(target);
    let released = false;
    read(target, 'next', consumer, () => released);
    const release = keepOpen
      ? () => {
          released = true;
        }
      : undefined;
    cancel(target, 'return', consumer, release);
    cancel(target, 'throw', consumer, release);
  }

  function readable(target: object, consumer: Consumer) {
    if (observed.has(target)) return;
    iterator(target, consumer);
    wrap(target, 'getReader', (original, args) => {
      const reader: unknown = Reflect.apply(original, target, args);
      if (isObject(reader) && !observed.has(reader)) {
        observed.add(reader);
        read(reader, 'read', consumer);
        cancel(reader, 'cancel', consumer);
      }
      return reader;
    });
    cancel(target, 'cancel', consumer);
    for (const key of ['values', Symbol.asyncIterator]) {
      wrap(target, key, (original, args) => {
        const result: unknown = Reflect.apply(original, target, args);
        if (isObject(result))
          safely(() => iterator(result, consumer, preventCancel(args[0])));
        return result;
      });
    }
    wrap(target, 'pipeTo', (original, args) => {
      let result: unknown;
      try {
        result = Reflect.apply(original, target, args);
      } catch (error) {
        consumer.end(false, error, true);
        throw error;
      }
      omitContent();
      consumer.delegated = true;
      observeResult(
        result,
        () =>
          consumer.end(
            !consumer.cancelled,
            undefined,
            false,
            consumer.original
          ),
        error => consumer.end(false, error, true)
      );
      return result;
    });
    wrap(target, 'pipeThrough', (original, args) => {
      let result: unknown;
      try {
        result = Reflect.apply(original, target, args);
      } catch (error) {
        consumer.end(false, error, true);
        throw error;
      }
      omitContent();
      consumer.delegated = true;
      if (isObject(result)) {
        readable(result, {
          cancelled: false,
          delegated: false,
          original: false,
          end: consumer.end,
        });
      }
      return result;
    });
    wrap(target, 'tee', (original, args) => {
      let result: unknown;
      try {
        result = Reflect.apply(original, target, args);
      } catch (error) {
        consumer.end(false, error, true);
        throw error;
      }
      omitContent();
      consumer.delegated = true;
      if (Array.isArray(result) && result.length === 2) {
        const finished = new Map<
          number,
          {
            completed: boolean;
            error: unknown;
            failed: boolean;
            sourceComplete: boolean;
          }
        >();
        let settled = false;
        const update = () => {
          if (settled || ended) return;
          const outcomes = Array.from(finished.values());
          const completed = outcomes.find(
            outcome =>
              outcome.completed &&
              (!sourceOutcome || sourceOutcome.completed) &&
              (outcome.sourceComplete || sourceCompleted)
          );
          if (!completed && finished.size !== 2) return;
          settled = true;
          sourceListeners.delete(update);
          if (completed) {
            // A sibling consuming the full source wins over a branch-local
            // transform/destination failure. Original output remains omitted.
            consumer.end(true, undefined, false, true);
          } else {
            const failure = outcomes.find(outcome => outcome.failed);
            consumer.end(false, failure?.error, failure !== undefined);
          }
        };
        sourceListeners.add(update);
        result.forEach((branch: unknown, index: number) => {
          if (!isObject(branch)) return;
          readable(branch, {
            cancelled: false,
            delegated: false,
            original: consumer.original,
            end: (completed, error, failed = false, sourceComplete = false) => {
              if (finished.has(index)) return;
              hasConsumerOutcome = true;
              if (sourceOutcome?.failed) {
                end(false, sourceOutcome.error, sourceOutcome.failed);
                return;
              }
              finished.set(index, { completed, error, failed, sourceComplete });
              // A failed/cancelled consumer says nothing about an active
              // sibling. Transformed EOF also needs exact producer confirmation.
              update();
            },
          });
        });
      }
      return result;
    });
  }

  readable(stream, {
    cancelled: false,
    delegated: false,
    original: true,
    end,
  });
  function sourceEnded(outcome: StreamSourceOutcome) {
    sourceOutcome = outcome;
    sourceCompleted = outcome.completed && !outcome.failed;
    if (hasConsumerOutcome && outcome.failed) {
      end(false, outcome.error, outcome.failed);
    } else {
      for (const update of sourceListeners) update();
    }
  }
  observeResult(
    options.sourceCompletion,
    value => sourceEnded(value as StreamSourceOutcome),
    error => sourceEnded({ completed: false, failed: true, error })
  );
  return stream;
}
