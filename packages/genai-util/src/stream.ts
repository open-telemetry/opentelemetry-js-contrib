/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api';
import { hrTime } from '@opentelemetry/core';
import { InferenceInvocation } from './invocations/inference';

/**
 * Structural interface for asynchronous stream objects.
 */
export interface AsyncStream<TChunk> extends AsyncIterable<TChunk> {
  close?: () => Promise<void> | void;
}

/**
 * Options for wrapping an async stream with telemetry.
 *
 * @experimental This interface is experimental and subject to change.
 */
export interface AsyncStreamWrapperOptions<TChunk> {
  /** The active invocation (InferenceInvocation). */
  invocation: InferenceInvocation;
  /** Hook called for each stream chunk. */
  onChunk?: (chunk: TChunk) => void | Promise<void>;
  /** Hook called when the stream ends or is closed cleanly. */
  onEnd?: () => void | Promise<void>;
  /** Hook called when the stream encounters an error. */
  onError?: (error: unknown) => void | Promise<void>;
}

/**
 * Proxy wrapper for asynchronous GenAI stream responses.
 *
 * Wraps an SDK async iterable/stream and intercepts iteration to:
 * 1. Track stream lifecycle (start -> chunks -> end/error) and complete the active invocation.
 * 2. Record stream metrics (`time_to_first_chunk` and `time_per_output_chunk`).
 * 3. Invoke telemetry hooks (`onChunk`, `onEnd`, `onError`).
 * 4. Transparently proxy underlying SDK methods and properties (via ES6 Proxy).
 */
class AsyncStreamWrapper<
  TChunk,
  TStream extends AsyncStream<TChunk> = AsyncStream<TChunk>,
> implements AsyncIterable<TChunk>
{
  private readonly _stream: TStream;
  private readonly _invocation: InferenceInvocation;
  private readonly _options: AsyncStreamWrapperOptions<TChunk>;
  private _isFinalized = false;

  constructor(stream: TStream, options: AsyncStreamWrapperOptions<TChunk>) {
    this._stream = stream;
    this._options = options;
    this._invocation = options.invocation;
    this._invocation.setStreaming();

    // Return a Proxy so the wrapper transparently forwards SDK-specific stream members.
    return new Proxy(this, {
      get(target, prop, receiver) {
        // Use the wrapper's own properties/methods first (e.g. close, Symbol.asyncIterator).
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        // Fall back to the underlying SDK stream for SDK-specific members.
        const val = Reflect.get(target._stream, prop);
        if (typeof val === 'function') {
          // Bind SDK methods to the underlying stream so their internal `this` context is preserved.
          // Without bind, calling `wrapped.sdkMethod()` would set `this` to the Proxy instead of `_stream`.
          return (val as (...args: unknown[]) => unknown).bind(target._stream);
        }
        return val;
      },
      set(target, prop, value) {
        // Update wrapper properties on `target`, or forward SDK property mutations to `_stream`.
        if (prop in target) {
          return Reflect.set(target, prop, value);
        }
        return Reflect.set(target._stream, prop, value);
      },
      has(target, prop) {
        return prop in target || prop in target._stream;
      },
    });
  }

  public [Symbol.asyncIterator](): AsyncIterator<TChunk> {
    const iterator =
      typeof this._stream[Symbol.asyncIterator] === 'function'
        ? this._stream[Symbol.asyncIterator]()
        : (this._stream as unknown as AsyncIterator<TChunk>);

    const self = this;

    const advance = async (
      step: () => Promise<IteratorResult<TChunk>>
    ): Promise<IteratorResult<TChunk>> => {
      try {
        const result = await step();
        if (result.done) {
          await self._finalizeSuccess();
          return result;
        }

        const chunkTime = hrTime();
        await self._processChunk(result.value);
        // Record after _processChunk so response.model set during chunk processing is included on metrics,
        // passing chunkTime captured when the chunk arrived so processing overhead is excluded.
        self._invocation.recordStreamChunk(chunkTime);
        return result;
      } catch (error) {
        await self._finalizeFailure(error);
        throw error;
      }
    };

    return {
      async next(...args): Promise<IteratorResult<TChunk>> {
        return advance(() => iterator.next(...args));
      },

      async return(value?: unknown): Promise<IteratorResult<TChunk>> {
        try {
          let result: IteratorResult<TChunk>;
          if (typeof iterator.return === 'function') {
            result = await iterator.return(value);
          } else {
            if (typeof self._stream.close === 'function') {
              await self._stream.close();
            }
            result = { done: true, value: value as unknown as TChunk };
          }
          await self._finalizeSuccess();
          return result;
        } catch (error) {
          await self._finalizeFailure(error);
          throw error;
        }
      },

      async throw(error?: unknown): Promise<IteratorResult<TChunk>> {
        if (typeof iterator.throw === 'function') {
          return advance(() => iterator.throw!(error));
        }
        await self._finalizeFailure(error);
        throw error;
      },
    };
  }

  /**
   * Close the stream and finalize telemetry.
   */
  public async close(): Promise<void> {
    try {
      if (typeof this._stream.close === 'function') {
        await this._stream.close();
      }
      await this._finalizeSuccess();
    } catch (error) {
      await this._finalizeFailure(error);
      throw error;
    }
  }

  /**
   * Hook called for each chunk.
   */
  private async _processChunk(chunk: TChunk): Promise<void> {
    if (this._options.onChunk) {
      try {
        await this._options.onChunk(chunk);
      } catch (err) {
        diag.error('Error in GenAI stream onChunk hook', err);
      }
    }
  }

  /**
   * Hook called on successful stream completion.
   */
  private async _onStreamEnd(): Promise<void> {
    try {
      if (this._options.onEnd) {
        await this._options.onEnd();
      }
    } catch (err) {
      diag.error('Error in GenAI stream onEnd hook', err);
    } finally {
      this._invocation.stop();
    }
  }

  /**
   * Hook called on stream error.
   */
  private async _onStreamError(error: unknown): Promise<void> {
    try {
      if (this._options.onError) {
        await this._options.onError(error);
      }
    } catch (err) {
      diag.error('Error in GenAI stream onError hook', err);
    } finally {
      this._invocation.fail({
        exception: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Finalizes the stream telemetry on successful completion.
   *
   * Guards against duplicate finalization if the stream is closed or ended
   * multiple times, ensuring `_onStreamEnd` (and consequently span stopping
   * and final metric recording) runs at most once.
   */
  private async _finalizeSuccess(): Promise<void> {
    if (this._isFinalized) {
      return;
    }
    this._isFinalized = true;
    await this._onStreamEnd();
  }

  /**
   * Finalizes the stream telemetry when an error occurs during iteration or closing.
   *
   * Ensures the error hook is invoked and the active span is marked as failed
   * exactly once, preventing duplicate error recordings if multiple failure paths
   * are encountered.
   *
   * @param error - The error or exception encountered during stream processing.
   */
  private async _finalizeFailure(error: unknown): Promise<void> {
    if (this._isFinalized) {
      return;
    }
    this._isFinalized = true;
    await this._onStreamError(error);
  }
}

/**
 * Wrap any async iterable stream with telemetry instrumentation.
 *
 * @experimental This function is experimental and subject to change.
 */
export function wrapAsyncStream<
  TStream extends AsyncStream<TChunk>,
  TChunk = TStream extends AsyncIterable<infer C> ? C : unknown,
>(stream: TStream, options: AsyncStreamWrapperOptions<TChunk>): TStream {
  return new AsyncStreamWrapper(stream, options) as unknown as TStream;
}
