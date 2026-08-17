/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ATTR_GEN_AI_REQUEST_STREAM } from './semconv';
import type { AgentInvocation, InferenceInvocation } from './invocations';

/**
 * Structural interface for asynchronous stream objects.
 */
export interface AsyncStream<TChunk> extends AsyncIterable<TChunk> {
  close?: () => Promise<void> | void;
  abort?: () => void;
  [key: string | symbol]: any;
}

/**
 * Options for wrapping an async stream with telemetry.
 */
export interface AsyncStreamWrapperOptions<TChunk> {
  /** The active invocation (InferenceInvocation or AgentInvocation). */
  invocation?: InferenceInvocation | AgentInvocation;
  /** Hook called for each stream chunk. */
  onChunk?: (chunk: TChunk) => void | Promise<void>;
  /** Hook called when the stream ends successfully. */
  onEnd?: () => void | Promise<void>;
  /** Hook called when the stream encounters an error. */
  onError?: (error: unknown) => void | Promise<void>;
}

/**
 * Base class and proxy wrapper for asynchronous GenAI stream responses.
 *
 * Wraps an SDK async iterable/stream and intercepts iteration to:
 * 1. Track stream lifecycle (start -> chunks -> end/error).
 * 2. Record stream metrics (TTFT / time to first chunk).
 * 3. Invoke telemetry hooks (`_processChunk`, `_onStreamEnd`, `_onStreamError`).
 * 4. Transparently proxy all underlying SDK methods and properties (via ES6 Proxy).
 */
export class AsyncStreamWrapper<
  TChunk,
  TStream extends AsyncStream<TChunk> = AsyncStream<TChunk>,
> implements AsyncIterable<TChunk>
{
  protected readonly _stream: TStream;
  protected readonly _invocation?: InferenceInvocation | AgentInvocation;
  protected readonly _options?: AsyncStreamWrapperOptions<TChunk>;
  private _isFinalized = false;
  private _hasFirstChunk = false;

  constructor(
    stream: TStream,
    optionsOrInvocation?:
      | AsyncStreamWrapperOptions<TChunk>
      | InferenceInvocation
      | AgentInvocation
  ) {
    this._stream = stream;

    if (
      optionsOrInvocation &&
      ('stop' in optionsOrInvocation || 'fail' in optionsOrInvocation)
    ) {
      this._invocation = optionsOrInvocation as
        | InferenceInvocation
        | AgentInvocation;
    } else if (optionsOrInvocation) {
      this._options = optionsOrInvocation as AsyncStreamWrapperOptions<TChunk>;
      this._invocation = this._options.invocation;
    }

    if (this._invocation) {
      this._invocation.setAttribute(ATTR_GEN_AI_REQUEST_STREAM, true);
    }

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        const val = Reflect.get(target._stream, prop);
        if (typeof val === 'function') {
          return (val as (...args: unknown[]) => unknown).bind(target._stream);
        }
        return val;
      },
      set(target, prop, value) {
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
        : (this._stream as any);

    const self = this;

    return {
      async next(...args): Promise<IteratorResult<TChunk>> {
        try {
          const result = await iterator.next(...args);
          if (result.done) {
            await self._finalizeSuccess();
            return result;
          }

          if (!self._hasFirstChunk) {
            self._hasFirstChunk = true;
            self._invocation?.recordStreamChunk(result.value);
          }

          await self._processChunk(result.value);
          return result;
        } catch (error) {
          await self._finalizeFailure(error);
          throw error;
        }
      },

      async return(value?: any): Promise<IteratorResult<TChunk>> {
        await self._finalizeSuccess();
        if (typeof iterator.return === 'function') {
          return iterator.return(value);
        }
        return { done: true, value };
      },

      async throw(error?: any): Promise<IteratorResult<TChunk>> {
        await self._finalizeFailure(error);
        if (typeof iterator.throw === 'function') {
          return iterator.throw(error);
        }
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
   * Hook called for each chunk. Subclasses can override to process chunk data.
   */
  protected async _processChunk(chunk: TChunk): Promise<void> {
    if (this._options?.onChunk) {
      await this._options.onChunk(chunk);
    }
  }

  /**
   * Hook called on successful stream completion.
   */
  protected async _onStreamEnd(): Promise<void> {
    if (this._options?.onEnd) {
      await this._options.onEnd();
    }
    if (this._invocation) {
      this._invocation.stop();
    }
  }

  /**
   * Hook called on stream error.
   */
  protected async _onStreamError(error: unknown): Promise<void> {
    if (this._options?.onError) {
      await this._options.onError(error);
    }
    if (this._invocation) {
      this._invocation.fail(error);
    }
  }

  /**
   * Finalizes the stream telemetry on successful completion.
   *
   * Guards against duplicate execution if the stream is closed or iterated
   * multiple times, ensuring `_onStreamEnd` (and consequently span stopping
   * and final metric recording) runs exactly once.
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
 */
export function wrapAsyncStream<TStream extends AsyncIterable<any>>(
  stream: TStream,
  optionsOrInvocation?:
    | AsyncStreamWrapperOptions<
        TStream extends AsyncIterable<infer TChunk> ? TChunk : any
      >
    | InferenceInvocation
    | AgentInvocation
): TStream {
  return new AsyncStreamWrapper(
    stream as any,
    optionsOrInvocation as any
  ) as unknown as TStream;
}
