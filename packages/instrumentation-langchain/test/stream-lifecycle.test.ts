/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ReadableStream,
  TransformStream,
  WritableStream,
} from 'node:stream/web';
import type {
  ReadableStreamDefaultReader,
  UnderlyingSource,
} from 'node:stream/web';
import type { IterableReadableStream } from '@langchain/core/utils/stream';
import { context, createContextKey, ROOT_CONTEXT } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { expect } from 'expect';
import { observeStream } from '../src/stream-lifecycle';
import type { StreamSourceOutcome } from '../src/stream-lifecycle';

interface End {
  completed: boolean;
  error: unknown;
  failed: boolean;
  captureComplete: boolean;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function observation<T extends object>(
  stream: T,
  sourceCompletion?: Promise<StreamSourceOutcome>
) {
  const chunks: unknown[] = [];
  const ends: End[] = [];
  const diagnostics: string[] = [];
  const observed = observeStream(stream, {
    sourceCompletion,
    onChunk: value => chunks.push(value),
    onEnd: (completed, error, failed, captureComplete) =>
      ends.push({ completed, error, failed, captureComplete }),
    diag: { debug: message => diagnostics.push(message) },
  });
  return { observed, chunks, ends, diagnostics };
}

const complete = (captureComplete = true): End => ({
  completed: captureComplete,
  error: undefined,
  failed: false,
  captureComplete,
});
const cancelled = (captureComplete = true): End => ({
  ...complete(captureComplete),
  completed: false,
});
const failed = (error: unknown, captureComplete = true): End => ({
  ...cancelled(captureComplete),
  error,
  failed: true,
});

function source(values: string[] = ['a', 'b']): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const value of values) controller.enqueue(value);
      controller.close();
    },
  });
}

function generatedSource(generator: AsyncGenerator<string, void, unknown>) {
  const completion = deferred<StreamSourceOutcome>();
  let cancelled = false;
  const stream = new ReadableStream<string>({
    async pull(controller) {
      let result: IteratorResult<string, void>;
      try {
        result = await generator.next();
      } catch (error) {
        completion.resolve({ completed: false, failed: true, error });
        if (!cancelled) controller.error(error);
        return;
      }
      // Native cancel closes the controller before an in-flight next settles.
      // That late result is not a producer failure or a natural source EOF.
      if (cancelled) return;
      if (result.done) {
        completion.resolve({ completed: true, failed: false });
        controller.close();
      } else {
        controller.enqueue(result.value);
      }
    },
    async cancel() {
      cancelled = true;
      try {
        await generator.return();
        completion.resolve({ completed: false, failed: false });
      } catch (error) {
        completion.resolve({ completed: false, failed: true, error });
        throw error;
      }
    },
  });
  return { stream, sourceCompletion: completion.promise };
}

async function drain(stream: {
  getReader(): {
    read(): Promise<{ done: boolean; value?: string }>;
    releaseLock(): void;
  };
}) {
  const values: string[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      values.push(result.value!);
    }
  } finally {
    reader.releaseLock();
  }
  return values;
}

describe('Public stream lifecycle', () => {
  it('preserves the stream, chunks, read results and read promise identity', async () => {
    const chunk = { text: 'a' };
    const result = { done: false, value: chunk };
    class ReadPromise extends Promise<typeof result> {}
    const promise = ReadPromise.resolve(result);
    const reader = { read: () => promise };
    const stream = { getReader: () => reader };
    const observer = observation(stream);
    expect(observer.observed).toBe(stream);
    expect(stream.getReader()).toBe(reader);
    expect(reader.read()).toBe(promise);
    expect(await promise).toBe(result);
    expect(observer.chunks).toEqual([chunk]);
    expect(observer.chunks[0]).toBe(chunk);
  });

  it('preserves iterator return result and promise subclasses', async () => {
    const value = { done: true, value: 'returned' };
    class ReturnPromise extends Promise<typeof value> {}
    const promise = ReturnPromise.resolve(value);
    const stream = { return: () => promise };
    const observer = observation(stream);
    expect(stream.return()).toBe(promise);
    expect(await promise).toBe(value);
    expect(observer.ends).toEqual([cancelled()]);
  });

  it('preserves method descriptors and borrowed receivers without prototype metadata', async () => {
    const nativeRead = ReadableStream.prototype.getReader;
    const descriptor = Object.getOwnPropertyDescriptor(
      ReadableStream.prototype,
      'getReader'
    );
    const stream = source();
    const own = {
      value: nativeRead,
      enumerable: true,
      configurable: true,
      writable: false,
    };
    Object.defineProperty(stream, 'getReader', own);
    const observer = observation(stream);
    const other = source(['other']);
    const getReader: () => ReadableStreamDefaultReader<string> =
      stream.getReader;
    const borrowed = getReader.call(other);
    expect(await borrowed.read()).toEqual({ done: false, value: 'other' });
    expect(observer.chunks).toEqual([]);
    expect(observer.ends).toEqual([]);
    expect(Object.getOwnPropertyDescriptor(stream, 'getReader')).toMatchObject({
      enumerable: true,
      configurable: true,
      writable: false,
    });
    expect(
      Object.getOwnPropertyDescriptor(ReadableStream.prototype, 'getReader')
    ).toEqual(descriptor);
    expect(Object.getOwnPropertyNames(nativeRead).sort()).toEqual([
      'length',
      'name',
    ]);
    borrowed.releaseLock();
    expect(await drain(stream)).toEqual(['a', 'b']);
    expect(observer.ends).toEqual([complete()]);
  });

  it('preserves synchronous throws, including undefined', () => {
    const stream = {
      next() {
        throw undefined;
      },
    };
    const observer = observation(stream);
    let threw = false;
    try {
      stream.next();
    } catch (error) {
      threw = true;
      expect(error).toBeUndefined();
    }
    expect(threw).toBe(true);
    expect(observer.ends).toEqual([failed(undefined)]);
  });

  it('does not change behavior when telemetry callbacks or diagnostics throw', async () => {
    const stream = source();
    observeStream(stream, {
      onChunk() {
        throw new Error('telemetry chunk');
      },
      onEnd() {
        throw new Error('telemetry end');
      },
      diag: {
        debug() {
          throw new Error('telemetry diagnostic');
        },
      },
    });
    expect(await drain(stream)).toEqual(['a', 'b']);
  });

  it('binds actual reader and iterator operations to the requested context', async () => {
    const manager = new AsyncLocalStorageContextManager().enable();
    const installed = context.setGlobalContextManager(manager);
    const key = createContextKey('stream lifecycle test');
    const expected = ROOT_CONTEXT.setValue(key, 'operation');
    const contexts: unknown[] = [];
    const reader = {
      async read() {
        contexts.push(context.active().getValue(key));
        await Promise.resolve();
        contexts.push(context.active().getValue(key));
        return { done: false, value: 'chunk' };
      },
    };
    const stream = {
      getReader() {
        return reader;
      },
      async next() {
        contexts.push(context.active().getValue(key));
        return this.getReader().read();
      },
    };
    const chunks: unknown[] = [];
    observeStream(stream, {
      context: expected,
      onChunk: value => chunks.push(value),
      onEnd() {},
      diag: { debug() {} },
    });
    try {
      await stream.next();
      await reader.read();
      expect(contexts).toEqual(Array(5).fill('operation'));
      expect(chunks).toEqual(['chunk', 'chunk']);
      expect(context.active().getValue(key)).toBeUndefined();
    } finally {
      if (installed) context.disable();
      manager.disable();
    }
  });

  it('captures reader reads once and ends only when the consumer sees EOF', async () => {
    const stream = source();
    const observer = observation(stream);
    const reader = stream.getReader();
    expect(await reader.read()).toEqual({ value: 'a', done: false });
    expect(await reader.read()).toEqual({ value: 'b', done: false });
    expect(observer.ends).toEqual([]);
    expect(await reader.read()).toEqual({ value: undefined, done: true });
    await reader.read();
    expect(observer.chunks).toEqual(['a', 'b']);
    expect(observer.ends).toEqual([complete()]);
  });

  it('observes native values and Symbol.asyncIterator without duplicate chunks', async () => {
    for (const useValues of [true, false]) {
      const stream = source();
      const observer = observation(stream);
      const iterator = useValues
        ? stream.values()
        : stream[Symbol.asyncIterator]();
      expect(await iterator.next()).toEqual({ done: false, value: 'a' });
      expect(await iterator.next()).toEqual({ done: false, value: 'b' });
      expect(await iterator.next()).toEqual({ done: true, value: undefined });
      expect(observer.chunks).toEqual(['a', 'b']);
      expect(observer.ends).toEqual([complete()]);
    }
  });

  it('allows continued consumption after values({preventCancel:true}) exits early', async () => {
    const stream = source();
    const observer = observation(stream);
    const iterator = stream.values({ preventCancel: true });
    expect(await iterator.next()).toEqual({ done: false, value: 'a' });
    await iterator.return!();
    await iterator.next();
    expect(observer.ends).toEqual([]);
    expect(await drain(stream)).toEqual(['b']);
    expect(observer.chunks).toEqual(['a', 'b']);
    expect(observer.ends).toEqual([complete()]);
  });

  it('does not evaluate preventCancel accessors more than the native method', async () => {
    let accesses = 0;
    const stream = source();
    const observer = observation(stream);
    const iterator = stream.values({
      get preventCancel() {
        accesses++;
        return true;
      },
    });
    await iterator.next();
    await iterator.return!();
    expect(accesses).toBe(1);
    expect(await drain(stream)).toEqual(['b']);
    expect(observer.ends).toEqual([complete()]);
  });

  it('ends an early native iterator return as cancellation', async () => {
    const reason = { reason: 'stop' };
    let received: unknown;
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('a');
      },
      cancel(value) {
        received = value;
      },
    });
    const observer = observation(stream);
    const iterator = stream.values();
    await iterator.next();
    const result = await iterator.return!(reason);
    expect(received).toBe(reason);
    expect(result).toEqual({ done: true, value: reason });
    expect(observer.ends).toEqual([cancelled()]);
  });

  it('marks reader cancellation synchronously before a pending read sees EOF', async () => {
    const cancellation = deferred<void>();
    const reason = { reason: 'stop' };
    let received: unknown;
    const stream = new ReadableStream<string>({
      cancel(value) {
        received = value;
        return cancellation.promise;
      },
    });
    const observer = observation(stream);
    const reader = stream.getReader();
    const pending = reader.read();
    const cancelledPromise = reader.cancel(reason);
    expect(await pending).toEqual({ done: true, value: undefined });
    expect(observer.ends).toEqual([]);
    cancellation.resolve();
    await cancelledPromise;
    expect(received).toBe(reason);
    expect(observer.ends).toEqual([cancelled()]);
  });

  it('retains cancellation failure after a pending read sees EOF', async () => {
    const cancellation = deferred<void>();
    const error = new Error('cancel failed');
    const stream = new ReadableStream<string>({
      cancel: () => cancellation.promise,
    });
    const observer = observation(stream);
    const reader = stream.getReader();
    const pending = reader.read();
    const cancelledPromise = reader.cancel();
    await pending;
    expect(observer.ends).toEqual([]);
    cancellation.reject(error);
    await expect(cancelledPromise).rejects.toBe(error);
    expect(observer.ends).toEqual([failed(error)]);
  });

  it('records native source errors without changing rejection identity', async () => {
    const error = new Error('source failed');
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.error(error);
      },
    });
    const observer = observation(stream);
    await expect(stream.getReader().read()).rejects.toBe(error);
    expect(observer.ends).toEqual([failed(error)]);
  });

  it('observes direct cancellation without inventing output', async () => {
    const stream = source();
    const observer = observation(stream);
    await stream.cancel();
    expect(observer.chunks).toEqual([]);
    expect(observer.ends).toEqual([cancelled()]);
  });

  it('preserves a reader cancel override promise and receiver', async () => {
    const done = deferred<void>();
    let receiver: unknown;
    const reader = {
      cancel() {
        receiver = this;
        return done.promise;
      },
    };
    const stream = { getReader: () => reader };
    const observer = observation(stream);
    expect(stream.getReader().cancel()).toBe(done.promise);
    expect(receiver).toBe(reader);
    done.resolve();
    await done.promise;
    expect(observer.ends).toEqual([cancelled()]);
  });

  it('preserves a borrowed reader method without observing the other reader', async () => {
    const stream = source();
    const observer = observation(stream);
    const reader = stream.getReader();
    const other = source(['other']).getReader();
    expect(await reader.read.call(other)).toEqual({
      done: false,
      value: 'other',
    });
    expect(observer.chunks).toEqual([]);
    reader.releaseLock();
    other.releaseLock();
    expect(await drain(stream)).toEqual(['a', 'b']);
    expect(observer.ends).toEqual([complete()]);
  });
});

describe('Native stream pipelines', () => {
  it('observes pipeTo completion without changing delivery or capturing guessed chunks', async () => {
    const stream = source();
    const observer = observation(stream);
    const chunks: string[] = [];
    const close = deferred<void>();
    const closing = deferred<void>();
    const destination = new WritableStream<string>({
      write: value => {
        chunks.push(value);
      },
      close() {
        closing.resolve();
        return close.promise;
      },
    });
    const result = stream.pipeTo(destination);
    await closing.promise;
    expect(observer.ends).toEqual([]);
    close.resolve();
    await result;
    expect(chunks).toEqual(['a', 'b']);
    expect(observer.chunks).toEqual([]);
    expect(observer.ends).toEqual([complete(false)]);
    expect(observer.diagnostics).toHaveLength(1);
  });

  it('preserves pipeTo override promise identity and the exact options object', async () => {
    class PipelinePromise extends Promise<void> {}
    const result = PipelinePromise.resolve();
    const destination = new WritableStream<string>();
    const options = { preventClose: true };
    let received: unknown[];
    const stream = {
      pipeTo(...args: unknown[]) {
        received = args;
        return result;
      },
    };
    const observer = observation(stream);
    expect(stream.pipeTo(destination, options)).toBe(result);
    await result;
    expect(received!).toEqual([destination, options]);
    expect(received![1]).toBe(options);
    expect(observer.ends).toEqual([complete(false)]);
  });

  it('invalidates previously captured output when native consumption takes over', async () => {
    const stream = source();
    const observer = observation(stream);
    const reader = stream.getReader();
    await reader.read();
    reader.releaseLock();
    expect(observer.chunks).toEqual(['a']);
    await stream.pipeTo(new WritableStream<string>());
    expect(observer.chunks).toEqual(['a']);
    expect(observer.ends).toEqual([complete(false)]);
  });

  for (const method of ['pipeTo', 'pipeThrough', 'tee'] as const) {
    it(`prevents a completed-only callback from exporting a prefix after ${method}`, async () => {
      const stream = source();
      const chunks: unknown[] = [];
      let output: unknown;
      let ends = 0;
      let failure: boolean | undefined;
      observeStream(stream, {
        onChunk: value => chunks.push(value),
        onEnd(completed, _error, failed) {
          ends++;
          failure = failed;
          if (completed) output = chunks;
        },
        diag: { debug() {} },
      });
      const reader = stream.getReader();
      await reader.read();
      reader.releaseLock();
      expect(chunks).toEqual(['a']);
      if (method === 'pipeTo') {
        await stream.pipeTo(new WritableStream<string>());
      } else if (method === 'pipeThrough') {
        expect(
          await drain(stream.pipeThrough(new TransformStream<string, string>()))
        ).toEqual(['b']);
      } else {
        const [first, second] = stream.tee();
        expect(await Promise.all([drain(first), drain(second)])).toEqual([
          ['b'],
          ['b'],
        ]);
      }
      expect(ends).toBe(1);
      expect(failure).toBe(false);
      expect(output).toBeUndefined();
      expect(chunks).toEqual(['a']);
    });
  }

  for (const cause of ['source', 'write', 'close', 'abort'] as const) {
    it(`preserves pipeTo ${cause} failure without false success`, async () => {
      const error = new Error(`${cause} failed`);
      const abort = new AbortController();
      const stream =
        cause === 'source'
          ? new ReadableStream<string>({
              start(controller) {
                controller.error(error);
              },
            })
          : cause === 'abort'
            ? new ReadableStream<string>()
            : source();
      const observer = observation(stream);
      const destination = new WritableStream<string>({
        write() {
          if (cause === 'write') throw error;
        },
        close() {
          if (cause === 'close') throw error;
        },
      });
      const result = stream.pipeTo(destination, { signal: abort.signal });
      if (cause === 'abort') abort.abort(error);
      await expect(result).rejects.toBe(error);
      expect(observer.ends).toEqual([failed(error, false)]);
    });
  }

  it('does not rewrite preventCancel or lock behavior when a destination fails', async () => {
    const error = new Error('destination failed');
    let cancellations = 0;
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('a');
        controller.enqueue('b');
      },
      cancel() {
        cancellations++;
      },
    });
    const observer = observation(stream);
    const destination = new WritableStream<string>({
      write() {
        throw error;
      },
    });
    await expect(
      stream.pipeTo(destination, { preventCancel: true })
    ).rejects.toBe(error);
    expect(cancellations).toBe(0);
    expect(stream.locked).toBe(false);
    expect(observer.ends).toEqual([failed(error, false)]);
    await stream.cancel();
  });

  it('preserves pipeThrough readable identity and excludes transformed output', async () => {
    const stream = source();
    const observer = observation(stream);
    const transform = new TransformStream<string, string>({
      transform(value, controller) {
        controller.enqueue(value.toUpperCase());
      },
    });
    const result = stream.pipeThrough(transform);
    expect(result).toBe(transform.readable);
    expect(await drain(result)).toEqual(['A', 'B']);
    expect(observer.chunks).toEqual([]);
    expect(observer.ends).toEqual([cancelled(false)]);
  });

  it('never reports transformed EOF as success when terminate cancels its source', async () => {
    let cancellations = 0;
    const cancellation = deferred<void>();
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('a');
        controller.enqueue('b');
      },
      cancel() {
        cancellations++;
        cancellation.resolve();
      },
    });
    const observer = observation(stream);
    const transform = new TransformStream<string, string>({
      transform(value, controller) {
        controller.enqueue(value);
        controller.terminate();
      },
    });
    expect(await drain(stream.pipeThrough(transform))).toEqual(['a']);
    expect(observer.ends).toEqual([cancelled(false)]);
    await cancellation.promise;
    expect(cancellations).toBe(1);
  });

  for (const cause of ['source', 'transform', 'flush'] as const) {
    it(`observes pipeThrough ${cause} errors`, async () => {
      const error = new Error(`${cause} failed`);
      const stream =
        cause === 'source'
          ? new ReadableStream<string>({
              start(controller) {
                controller.error(error);
              },
            })
          : source();
      const observer = observation(stream);
      const transform = new TransformStream<string, string>({
        transform(value, controller) {
          if (cause === 'transform') throw error;
          controller.enqueue(value);
        },
        flush() {
          if (cause === 'flush') throw error;
        },
      });
      await expect(drain(stream.pipeThrough(transform))).rejects.toBe(error);
      expect(observer.ends).toEqual([failed(error, false)]);
    });
  }

  it('does not mistake a cancelled pipeThrough pending read for success', async () => {
    const stream = new ReadableStream<string>();
    const observer = observation(stream);
    const result = stream.pipeThrough(new TransformStream<string, string>());
    const reader = result.getReader();
    const pending = reader.read();
    const cancel = reader.cancel('stop');
    expect(await pending).toEqual({ done: true, value: undefined });
    await cancel;
    expect(observer.ends).toEqual([cancelled(false)]);
  });

  it('tracks nested pipelines without attributing transformed chunks to the source', async () => {
    const stream = source();
    const observer = observation(stream);
    const upper = new TransformStream<string, string>({
      transform(value, controller) {
        controller.enqueue(value.toUpperCase());
      },
    });
    const duplicate = new TransformStream<string, string>({
      transform(value, controller) {
        controller.enqueue(value + value);
      },
    });
    const chunks: string[] = [];
    await stream
      .pipeThrough(upper)
      .pipeThrough(duplicate)
      .pipeTo(
        new WritableStream<string>({
          write(value) {
            chunks.push(value);
          },
        })
      );
    expect(chunks).toEqual(['AA', 'BB']);
    expect(observer.chunks).toEqual([]);
    expect(observer.ends).toEqual([cancelled(false)]);
    expect(observer.diagnostics).toHaveLength(1);
  });

  it('ends tee when one branch fully consumes the source, without double counting', async () => {
    const stream = source();
    const observer = observation(stream);
    const [first, second] = stream.tee();
    expect(await drain(first)).toEqual(['a', 'b']);
    expect(observer.ends).toEqual([complete(false)]);
    expect(await drain(second)).toEqual(['a', 'b']);
    expect(observer.ends).toHaveLength(1);
    expect(observer.chunks).toEqual([]);
  });

  it('does not finish tee when only one branch cancels', async () => {
    const stream = source();
    const observer = observation(stream);
    const [first, second] = stream.tee();
    const cancellation = first.cancel('not needed');
    await Promise.resolve();
    expect(observer.ends).toEqual([]);
    expect(await drain(second)).toEqual(['a', 'b']);
    await cancellation;
    expect(observer.ends).toEqual([complete(false)]);
  });

  it('observes both tee cancellations and preserves their reasons', async () => {
    let reason: unknown;
    const stream = new ReadableStream<string>({
      cancel(value) {
        reason = value;
      },
    });
    const observer = observation(stream);
    const [first, second] = stream.tee();
    const firstReader = first.getReader();
    const pending = firstReader.read();
    const one = firstReader.cancel('one');
    expect(await pending).toEqual({ done: true, value: undefined });
    expect(observer.ends).toEqual([]);
    const two = second.cancel('two');
    await Promise.all([one, two]);
    expect(reason).toEqual(['one', 'two']);
    expect(observer.ends).toEqual([cancelled(false)]);
  });

  it('observes tee source errors even when the sibling is not consumed', async () => {
    const error = new Error('source failed');
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.error(error);
      },
    });
    const observer = observation(stream);
    const [first] = stream.tee();
    await expect(drain(first)).rejects.toBe(error);
    expect(observer.ends).toEqual([failed(error, false)]);
  });

  it('observes tee cancellation failure rather than pending-read EOF', async () => {
    const error = new Error('cancel failed');
    const stream = new ReadableStream<string>({
      cancel() {
        throw error;
      },
    });
    const observer = observation(stream);
    const [first, second] = stream.tee();
    const results = await Promise.allSettled([first.cancel(), second.cancel()]);
    expect(results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    expect(observer.ends).toEqual([failed(error, false)]);
  });

  it('supports nested tee branches and native pipeTo consumption', async () => {
    const stream = source();
    const observer = observation(stream);
    const [first, unused] = stream.tee();
    const [nested, nestedUnused] = first.tee();
    const cancellation = unused.cancel();
    const nestedCancellation = nestedUnused.cancel();
    await nested.pipeTo(new WritableStream<string>());
    await Promise.all([cancellation, nestedCancellation]);
    expect(observer.ends).toEqual([complete(false)]);
    expect(observer.chunks).toEqual([]);
  });
});

describe('Exact source completion and tee consumer outcomes', () => {
  for (const withSourceSignal of [false, true]) {
    it(`waits for an active sibling after a branch transform fails (source signal=${withSourceSignal})`, async () => {
      const gate = deferred<void>();
      const waiting = deferred<void>();
      const error = new Error('branch transform failed');
      let usage = 0;
      const generated = generatedSource(
        (async function* () {
          usage += 7;
          yield 'first';
          waiting.resolve();
          await gate.promise;
          usage += 7;
          yield 'second';
        })()
      );
      const observer = observation(
        generated.stream,
        withSourceSignal ? generated.sourceCompletion : undefined
      );
      const [first, second] = generated.stream.tee();
      const bad = drain(
        first.pipeThrough(
          new TransformStream<string, string>({
            transform() {
              throw error;
            },
          })
        )
      );
      const good = drain(second);
      await expect(bad).rejects.toBe(error);
      await waiting.promise;
      expect(usage).toBe(7);
      expect(observer.ends).toEqual([]);
      gate.resolve();
      expect(await good).toEqual(['first', 'second']);
      expect(usage).toBe(14);
      expect(observer.ends).toEqual([complete(false)]);
      expect(observer.chunks).toEqual([]);
    });
  }

  it('finishes a fully drained transformed tee branch without touching its sibling', async () => {
    const generated = generatedSource(
      (async function* () {
        yield 'a';
        yield 'b';
      })()
    );
    const observer = observation(generated.stream, generated.sourceCompletion);
    const [first, untouched] = generated.stream.tee();
    expect(
      await drain(first.pipeThrough(new TransformStream<string, string>()))
    ).toEqual(['a', 'b']);
    expect(untouched.locked).toBe(false);
    expect(observer.ends).toEqual([complete(false)]);
    // Cleanup is intentionally after the completion assertion.
    await untouched.cancel();
    expect(observer.ends).toHaveLength(1);
  });

  it('defers a branch-local pipeTo destination error while its sibling is active', async () => {
    const gate = deferred<void>();
    const error = new Error('destination failed');
    const generated = generatedSource(
      (async function* () {
        yield 'a';
        await gate.promise;
        yield 'b';
      })()
    );
    const observer = observation(generated.stream, generated.sourceCompletion);
    const [first, second] = generated.stream.tee();
    const bad = first.pipeTo(
      new WritableStream<string>({
        write() {
          throw error;
        },
      }),
      { preventCancel: true }
    );
    const good = drain(second);
    await expect(bad).rejects.toBe(error);
    expect(observer.ends).toEqual([]);
    gate.resolve();
    expect(await good).toEqual(['a', 'b']);
    expect(observer.ends).toEqual([complete(false)]);
    await first.cancel();
  });

  it('rechecks transformed EOF when the exact source confirmation arrives later', async () => {
    const completion = deferred<StreamSourceOutcome>();
    const stream = source();
    const observer = observation(stream, completion.promise);
    const [first, untouched] = stream.tee();
    await drain(first.pipeThrough(new TransformStream<string, string>()));
    expect(observer.ends).toEqual([]);
    completion.resolve({ completed: true, failed: false });
    await completion.promise;
    expect(observer.ends).toEqual([complete(false)]);
    await untouched.cancel();
  });

  it('does not finish from the producer signal before transformed output finishes', async () => {
    const flush = deferred<void>();
    const generated = generatedSource(
      (async function* () {
        yield 'a';
      })()
    );
    const observer = observation(generated.stream, generated.sourceCompletion);
    const [first, untouched] = generated.stream.tee();
    const consuming = drain(
      first.pipeThrough(
        new TransformStream<string, string>({
          transform(value, controller) {
            controller.enqueue(value);
          },
          flush() {
            return flush.promise;
          },
        })
      )
    );
    await generated.sourceCompletion;
    expect(observer.ends).toEqual([]);
    flush.resolve();
    expect(await consuming).toEqual(['a']);
    expect(observer.ends).toEqual([complete(false)]);
    await untouched.cancel();
  });

  it('never ends an unread stream from successful producer completion alone', async () => {
    const completion = deferred<StreamSourceOutcome>();
    const stream = source();
    const observer = observation(stream, completion.promise);
    completion.resolve({ completed: true, failed: false });
    await completion.promise;
    expect(observer.ends).toEqual([]);
    expect(await drain(stream)).toEqual(['a', 'b']);
    expect(observer.ends).toEqual([complete()]);
  });

  it('does not mistake early transformed EOF for source completion with an active sibling', async () => {
    const gate = deferred<void>();
    const generated = generatedSource(
      (async function* () {
        yield 'a';
        await gate.promise;
        yield 'b';
      })()
    );
    const observer = observation(generated.stream, generated.sourceCompletion);
    const [first, second] = generated.stream.tee();
    const transformed = first.pipeThrough(
      new TransformStream<string, string>({
        transform(value, controller) {
          controller.enqueue(value);
          controller.terminate();
        },
      })
    );
    expect(await drain(transformed)).toEqual(['a']);
    expect(observer.ends).toEqual([]);
    const good = drain(second);
    gate.resolve();
    expect(await good).toEqual(['a', 'b']);
    expect(observer.ends).toEqual([complete(false)]);
  });

  it('reports exact source failure immediately even after a different branch-local failure', async () => {
    const gate = deferred<void>();
    const branchError = new Error('branch failed');
    const sourceError = new Error('source failed');
    const generated = generatedSource(
      (async function* () {
        yield 'a';
        await gate.promise;
        throw sourceError;
      })()
    );
    const observer = observation(generated.stream, generated.sourceCompletion);
    const [first, untouched] = generated.stream.tee();
    await expect(
      drain(
        first.pipeThrough(
          new TransformStream<string, string>({
            transform() {
              throw branchError;
            },
          })
        )
      )
    ).rejects.toBe(branchError);
    expect(observer.ends).toEqual([]);
    gate.resolve();
    await expect(generated.sourceCompletion).resolves.toEqual({
      completed: false,
      failed: true,
      error: sourceError,
    });
    expect(observer.ends).toEqual([failed(sourceError, false)]);
    expect(untouched.locked).toBe(false);
  });

  it('waits for consumption before reporting an always-fulfilled undefined source failure', async () => {
    const completion = deferred<StreamSourceOutcome>();
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.error(undefined);
      },
    });
    const observer = observation(stream, completion.promise);
    completion.resolve({ completed: false, failed: true, error: undefined });
    await expect(completion.promise).resolves.toEqual({
      completed: false,
      failed: true,
      error: undefined,
    });
    expect(observer.ends).toEqual([]);
    await expect(stream.getReader().read()).rejects.toBeUndefined();
    expect(observer.ends).toEqual([failed(undefined)]);
  });

  it('does not confuse producer return with natural EOF or end from the tracker alone', async () => {
    const completion = deferred<StreamSourceOutcome>();
    let close!: () => void;
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('prefix');
        close = () => controller.close();
      },
    });
    const observer = observation(stream, completion.promise);
    const reader = stream.getReader();
    await reader.read();
    completion.resolve({ completed: false, failed: false });
    await completion.promise;
    expect(observer.ends).toEqual([]);
    close();
    await reader.read();
    expect(observer.chunks).toEqual(['prefix']);
    expect(observer.ends).toEqual([cancelled()]);
  });

  it('does not promote transformed tee EOF from a cancelled source outcome', async () => {
    const completion = deferred<StreamSourceOutcome>();
    let stopProducer!: () => void;
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('a');
        controller.enqueue('b');
        stopProducer = () => controller.close();
      },
    });
    const observer = observation(stream, completion.promise);
    const [first, untouched] = stream.tee();
    const transformed = first.pipeThrough(
      new TransformStream<string, string>({
        transform(value, controller) {
          controller.enqueue(value);
          controller.terminate();
        },
      })
    );
    expect(await drain(transformed)).toEqual(['a']);
    expect(observer.ends).toEqual([]);
    stopProducer();
    completion.resolve({ completed: false, failed: false });
    await completion.promise;
    expect(observer.ends).toEqual([]);
    await untouched.cancel();
    expect(observer.ends).toEqual([cancelled(false)]);
  });

  it('reports local failure once all tee branches are terminal without successful consumption', async () => {
    const error = new Error('branch failed');
    const completion = deferred<StreamSourceOutcome>();
    const stream = source();
    const observer = observation(stream, completion.promise);
    const [first, second] = stream.tee();
    await expect(
      drain(
        first.pipeThrough(
          new TransformStream<string, string>({
            transform() {
              throw error;
            },
          })
        )
      )
    ).rejects.toBe(error);
    expect(observer.ends).toEqual([]);
    await second.cancel();
    expect(observer.ends).toEqual([failed(error, false)]);
    completion.resolve({ completed: true, failed: false });
    await completion.promise;
    expect(observer.ends).toHaveLength(1);
  });

  it('does not wait for a natural producer EOF when all consumers cancel', async () => {
    const completion = deferred<StreamSourceOutcome>();
    const stream = new ReadableStream<string>();
    const observer = observation(stream, completion.promise);
    const [first, second] = stream.tee();
    await Promise.all([first.cancel(), second.cancel()]);
    expect(observer.ends).toEqual([cancelled(false)]);
  });

  it('retains a branch failure when the exact producer subsequently returns', async () => {
    const error = new Error('branch failed before source return');
    const generated = generatedSource(
      (async function* () {
        while (true) yield 'chunk';
      })()
    );
    const observer = observation(generated.stream, generated.sourceCompletion);
    const [first, second] = generated.stream.tee();
    await expect(
      drain(
        first.pipeThrough(
          new TransformStream<string, string>({
            transform() {
              throw error;
            },
          })
        )
      )
    ).rejects.toBe(error);
    expect(observer.ends).toEqual([]);
    await second.cancel();
    await expect(generated.sourceCompletion).resolves.toEqual({
      completed: false,
      failed: false,
    });
    expect(observer.ends).toEqual([failed(error, false)]);
  });

  it('models producer return during an in-flight next without controller races', async () => {
    const entered = deferred<void>();
    const gate = deferred<void>();
    const generated = generatedSource(
      (async function* () {
        entered.resolve();
        await gate.promise;
        yield 'late chunk';
      })()
    );
    const observer = observation(generated.stream, generated.sourceCompletion);
    const reader = generated.stream.getReader();
    const pending = reader.read();
    await entered.promise;
    const cancellation = reader.cancel();
    expect(await pending).toEqual({ done: true, value: undefined });
    expect(observer.ends).toEqual([]);
    gate.resolve();
    await cancellation;
    await expect(generated.sourceCompletion).resolves.toEqual({
      completed: false,
      failed: false,
    });
    expect(observer.chunks).toEqual([]);
    expect(observer.ends).toEqual([cancelled()]);
  });

  it('reports failure rather than success when both branch transforms fail', async () => {
    const error = new Error('both transforms failed');
    const stream = source();
    const observer = observation(
      stream,
      Promise.resolve({ completed: true, failed: false })
    );
    const branches = stream.tee();
    const results = await Promise.allSettled(
      branches.map(branch =>
        drain(
          branch.pipeThrough(
            new TransformStream<string, string>({
              transform() {
                throw error;
              },
            })
          )
        )
      )
    );
    expect(results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    expect(observer.ends).toEqual([failed(error, false)]);
  });

  it('preserves active siblings across nested tee and transform failures', async () => {
    const gate = deferred<void>();
    const error = new Error('nested transform failed');
    const generated = generatedSource(
      (async function* () {
        yield 'a';
        await gate.promise;
        yield 'b';
      })()
    );
    const observer = observation(generated.stream, generated.sourceCompletion);
    const [outer, untouched] = generated.stream.tee();
    const [bad, good] = outer
      .pipeThrough(new TransformStream<string, string>())
      .tee();
    const broken = drain(
      bad.pipeThrough(
        new TransformStream<string, string>({
          transform() {
            throw error;
          },
        })
      )
    );
    const consumed = drain(good);
    await expect(broken).rejects.toBe(error);
    expect(observer.ends).toEqual([]);
    gate.resolve();
    expect(await consumed).toEqual(['a', 'b']);
    expect(observer.ends).toEqual([complete(false)]);
    expect(untouched.locked).toBe(false);
    await untouched.cancel();
  });
});

describe('Actual LangChain IterableReadableStream lifecycle', () => {
  let makeStream: (
    source: UnderlyingSource<string>
  ) => IterableReadableStream<string>;

  before(function () {
    if (Number(process.versions.node.split('.')[0]) < 20) this.skip();
    // Load the SDK only after the Node 18 guard.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      IterableReadableStream,
    }: typeof import('@langchain/core/utils/stream') = require('@langchain/core/utils/stream');
    /* eslint-enable @typescript-eslint/no-require-imports */
    makeStream = source => new IterableReadableStream(source);
  });

  it('observes next -> getReader.read once and preserves stream identity', async () => {
    const stream = makeStream({
      start(controller) {
        controller.enqueue('a');
        controller.enqueue('b');
        controller.close();
      },
    });
    const observer = observation(stream);
    expect(observer.observed).toBe(stream);
    expect(await stream.next()).toEqual({ done: false, value: 'a' });
    expect(await stream.next()).toEqual({ done: false, value: 'b' });
    expect(await stream.next()).toEqual({ done: true, value: undefined });
    expect(observer.chunks).toEqual(['a', 'b']);
    expect(observer.ends).toEqual([complete()]);
  });

  it('does not complete a pending SDK next when return cancels its reader', async () => {
    const cancellation = deferred<void>();
    const stream = makeStream({ cancel: () => cancellation.promise });
    const observer = observation(stream);
    const pending = stream.next();
    const result = stream.return!();
    expect(await pending).toEqual({ done: true, value: undefined });
    expect(observer.ends).toEqual([]);
    cancellation.resolve();
    await result;
    expect(observer.ends).toEqual([cancelled()]);
  });

  it('preserves SDK throw rejection and reports failure once', async () => {
    const error = new Error('stop');
    const stream = makeStream({
      start(controller) {
        controller.enqueue('a');
      },
    });
    const observer = observation(stream);
    await stream.next();
    await expect(stream.throw!(error)).rejects.toBe(error);
    expect(observer.chunks).toEqual(['a']);
    expect(observer.ends).toEqual([failed(error)]);
  });

  it('observes SDK next source errors once', async () => {
    const error = new Error('source failed');
    const stream = makeStream({
      start(controller) {
        controller.error(error);
      },
    });
    const observer = observation(stream);
    await expect(stream.next()).rejects.toBe(error);
    expect(observer.ends).toEqual([failed(error)]);
  });

  it('observes SDK inherited reader and values consumption', async () => {
    for (const mode of ['reader', 'values'] as const) {
      const stream = makeStream({
        start(controller) {
          controller.enqueue('a');
          controller.close();
        },
      });
      const observer = observation(stream);
      if (mode === 'reader') {
        expect(await drain(stream)).toEqual(['a']);
      } else {
        // Native values() is inherited, but absent from TypeScript's DOM type.
        const values: unknown = Reflect.get(stream, 'values');
        expect(typeof values).toBe('function');
        if (typeof values !== 'function') throw new Error('values unavailable');
        const iterator: AsyncIterator<string> = Reflect.apply(
          values,
          stream,
          []
        );
        expect(await iterator.next()).toEqual({ done: false, value: 'a' });
        expect(await iterator.next()).toEqual({ done: true, value: undefined });
      }
      expect(observer.chunks).toEqual(['a']);
      expect(observer.ends).toEqual([complete()]);
    }
  });

  it('observes native SDK pipeTo, pipeThrough and tee consumption', async () => {
    for (const method of ['pipeTo', 'pipeThrough', 'tee'] as const) {
      const stream = makeStream({
        start(controller) {
          controller.enqueue('a');
          controller.close();
        },
      });
      const observer = observation(stream);
      if (method === 'pipeTo') {
        await stream.pipeTo(new globalThis.WritableStream<string>());
      } else if (method === 'pipeThrough') {
        expect(
          await drain(
            stream.pipeThrough(new globalThis.TransformStream<string, string>())
          )
        ).toEqual(['a']);
      } else {
        const [first, second] = stream.tee();
        await Promise.all([drain(first), drain(second)]);
      }
      expect(observer.chunks).toEqual([]);
      expect(observer.ends).toEqual([
        method === 'pipeThrough' ? cancelled(false) : complete(false),
      ]);
    }
  });
});
