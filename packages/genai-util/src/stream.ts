/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context } from '@opentelemetry/api';
import { hrTime } from '@opentelemetry/core';
import type { BaseInvocation } from './invocations/base';
import { InferenceInvocation } from './invocations/inference';

/**
 * Structural type for asynchronous stream objects.
 */
export type AsyncStream<TChunk> = AsyncIterable<TChunk>;

/**
 * Options for wrapping an async stream with telemetry.
 *
 * @experimental This interface is experimental and subject to change.
 */
export interface AsyncStreamWrapperOptions<TChunk> {
  /** The active invocation owning the stream lifecycle. */
  invocation: BaseInvocation;
  /** Hook called for each stream chunk. */
  onChunk?: (chunk: TChunk) => void | Promise<void>;
  /** Hook called when the stream ends or is closed cleanly. */
  onEnd?: () => void | Promise<void>;
  /** Hook called when the stream encounters an error. */
  onError?: (error: unknown) => void | Promise<void>;
}

/**
 * Wrap any async iterable stream in-place with telemetry instrumentation.
 *
 * Replaces `[Symbol.asyncIterator]` on the stream object to:
 * 1. Track stream lifecycle (start -> chunks -> end/error) and complete the active invocation.
 * 2. Activate the invocation's span context while advancing the underlying async iterator and executing hooks (`onChunk`, `onEnd`, `onError`), without leaking ended span contexts on post-finalization re-iteration.
 * 3. Record stream chunk timing metrics (`time_to_first_chunk` and `time_per_output_chunk`) for inference invocations.
 * 4. Invoke telemetry hooks (`onChunk`, `onEnd`, `onError`).
 * 5. Preserve the original stream instance identity, prototype (`instanceof`), and SDK members.
 *
 * @experimental This function is experimental and subject to change.
 */
export function wrapAsyncStream<
  TStream extends AsyncStream<TChunk>,
  TChunk = TStream extends AsyncIterable<infer C> ? C : unknown,
>(stream: TStream, options: AsyncStreamWrapperOptions<TChunk>): TStream {
  const { invocation } = options;
  if (
    'setStreaming' in invocation &&
    typeof invocation.setStreaming === 'function'
  ) {
    invocation.setStreaming();
  }

  let isFinalized = false;
  let pendingChunks: Promise<void> = Promise.resolve();

  const runWithInvocationContext = <T>(fn: () => T): T =>
    isFinalized || invocation.isEnded()
      ? fn()
      : context.with(invocation.getContext(), fn);

  const processChunk = async (chunk: TChunk): Promise<void> => {
    if (options.onChunk && !isFinalized && !invocation.isEnded()) {
      try {
        await context.with(invocation.getContext(), () =>
          options.onChunk!(chunk)
        );
      } catch (err) {
        invocation.getDiag().error('Error in GenAI stream onChunk hook', err);
      }
    }
  };

  /**
   * Finalizes the stream telemetry on successful completion.
   *
   * Guards against duplicate finalization if the stream is ended multiple
   * times, ensuring `onEnd` (and consequently span stopping and final metric
   * recording) runs at most once.
   */
  const finalizeSuccess = async (): Promise<void> => {
    await pendingChunks;
    if (isFinalized || invocation.isEnded()) {
      isFinalized = true;
      return;
    }
    isFinalized = true;
    try {
      if (options.onEnd) {
        await context.with(invocation.getContext(), () => options.onEnd!());
      }
    } catch (err) {
      invocation.getDiag().error('Error in GenAI stream onEnd hook', err);
    } finally {
      invocation.stop();
    }
  };

  /**
   * Finalizes the stream telemetry when an error occurs during iteration.
   *
   * Ensures the error hook is invoked and the active span is marked as failed
   * exactly once, preventing duplicate error recordings if multiple failure paths
   * are encountered.
   */
  const finalizeFailure = async (error: unknown): Promise<void> => {
    await pendingChunks;
    if (isFinalized || invocation.isEnded()) {
      isFinalized = true;
      return;
    }
    isFinalized = true;
    try {
      if (options.onError) {
        await context.with(invocation.getContext(), () =>
          options.onError!(error)
        );
      }
    } catch (err) {
      invocation.getDiag().error('Error in GenAI stream onError hook', err);
    } finally {
      invocation.fail({
        exception: error instanceof Error ? error : undefined,
      });
    }
  };

  const wrapIterator = (
    iterator: AsyncIterator<TChunk>
  ): AsyncIterableIterator<TChunk> => {
    const originalNext = iterator.next.bind(iterator);
    const originalReturn =
      typeof iterator.return === 'function'
        ? iterator.return.bind(iterator)
        : undefined;
    const originalThrow =
      typeof iterator.throw === 'function'
        ? iterator.throw.bind(iterator)
        : undefined;

    // Shared step runner for `next()` and `throw()`. Both iterator methods can
    // advance the underlying generator to yield a chunk (e.g. if `throw()` is
    // caught inside the generator), complete cleanly (`done: true`), or reject.
    // Centralizing this handles chunk processing, stream timing metrics
    // (`time_to_first_chunk` and `time_per_output_chunk`), and success/failure
    // finalization uniformly across both paths.
    const advance = async (
      step: () => Promise<IteratorResult<TChunk>>
    ): Promise<IteratorResult<TChunk>> => {
      try {
        const result = await step();
        if (result.done) {
          await finalizeSuccess();
          return result;
        }

        if (isFinalized || invocation.isEnded()) {
          return result;
        }

        const chunkTime = hrTime();
        const chunkTask = pendingChunks.then(async () => {
          if (isFinalized || invocation.isEnded()) {
            return;
          }
          await processChunk(result.value);
          if (
            invocation instanceof InferenceInvocation &&
            !isFinalized &&
            !invocation.isEnded()
          ) {
            // Record after processChunk so response.model set during chunk processing is included on metrics,
            // passing chunkTime captured when the chunk arrived so processing overhead is excluded.
            invocation.recordStreamChunk(chunkTime);
          }
        });
        pendingChunks = chunkTask;
        await chunkTask;
        return result;
      } catch (error) {
        await finalizeFailure(error);
        throw error;
      }
    };

    return {
      async next(...args): Promise<IteratorResult<TChunk>> {
        return advance(() =>
          runWithInvocationContext(() => originalNext(...args))
        );
      },

      async return(value?: unknown): Promise<IteratorResult<TChunk>> {
        try {
          const result: IteratorResult<TChunk> = originalReturn
            ? await runWithInvocationContext(() => originalReturn(value))
            : { done: true, value };
          await finalizeSuccess();
          return result;
        } catch (error) {
          await finalizeFailure(error);
          throw error;
        }
      },

      async throw(error?: unknown): Promise<IteratorResult<TChunk>> {
        if (originalThrow) {
          return advance(() =>
            runWithInvocationContext(() => originalThrow(error))
          );
        }
        // Let any cleanup error from `originalReturn()` surface to the caller (matching
        // `yield*` delegation) while telemetry records the original `error` in `finally`.
        try {
          if (originalReturn) {
            await runWithInvocationContext(() => originalReturn());
          }
        } finally {
          await finalizeFailure(error);
        }
        throw error;
      },

      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };

  const originalAsyncIterator = stream[Symbol.asyncIterator];
  const streamAsIterator = stream as unknown as AsyncIterator<TChunk>;
  const wrappedSelfIterator =
    typeof streamAsIterator.next === 'function'
      ? wrapIterator(streamAsIterator)
      : undefined;

  if (wrappedSelfIterator) {
    Object.defineProperties(stream, {
      next: {
        configurable: true,
        enumerable: false,
        writable: true,
        value: wrappedSelfIterator.next,
      },
      return: {
        configurable: true,
        enumerable: false,
        writable: true,
        value: wrappedSelfIterator.return,
      },
      throw: {
        configurable: true,
        enumerable: false,
        writable: true,
        value: wrappedSelfIterator.throw,
      },
    });
  }

  // Use Object.defineProperty directly rather than shimmer: stream instances are
  // ephemeral per-request objects that never need unwrap bookkeeping, and this
  // also supports bare AsyncIterators that lack an existing [Symbol.asyncIterator].
  Object.defineProperty(stream, Symbol.asyncIterator, {
    configurable: true,
    enumerable: false,
    writable: true,
    value(this: TStream): AsyncIterableIterator<TChunk> {
      if (typeof originalAsyncIterator === 'function') {
        let iterator: AsyncIterator<TChunk>;
        try {
          iterator = runWithInvocationContext(() =>
            originalAsyncIterator.call(this)
          );
        } catch (error) {
          void finalizeFailure(error);
          throw error;
        }
        if ((iterator as unknown) !== this) {
          return wrapIterator(iterator);
        }
      }
      return wrappedSelfIterator!;
    },
  });

  return stream;
}
