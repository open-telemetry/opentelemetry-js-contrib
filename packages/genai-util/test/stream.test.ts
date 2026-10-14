/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  ERROR_TYPE_VALUE_OTHER,
} from '@opentelemetry/semantic-conventions';
import { TelemetryHandler } from '../src/handler';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK,
} from '../src/semconv';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from './helpers/test-setup';

async function* createAsyncChunkGenerator<T>(chunks: T[], error?: Error) {
  for (const chunk of chunks) {
    yield chunk;
  }
  if (error) {
    throw error;
  }
}

class FakeSDKStream<T> implements AsyncIterable<T> {
  public closed = false;
  public customProp = 'custom_value';

  constructor(
    private _chunks: T[],
    private _error?: Error,
    private _closeError?: Error
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (const chunk of this._chunks) {
      yield chunk;
    }
    if (this._error) {
      throw this._error;
    }
  }

  customMethod(): string {
    return `method_${this.customProp}`;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this._closeError) {
      throw this._closeError;
    }
  }
}

describe('TelemetryHandler.wrapAsyncStream', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  it('should wrap async iterable and track chunks, stream attribute, and completion', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    const invocation = handler.startInference({
      providerName: 'openai',
      requestModel: 'gpt-4o',
      serverAddress: 'api.openai.com',
      serverPort: 443,
    });

    const processed: string[] = [];
    let endHookCalled = false;

    const rawStream = createAsyncChunkGenerator(['Hello', ' ', 'world', '!']);
    const wrappedStream = handler.wrapAsyncStream(rawStream, {
      invocation,
      onChunk: chunk => {
        processed.push(chunk);
      },
      onEnd: () => {
        endHookCalled = true;
      },
    });

    const received: string[] = [];
    for await (const chunk of wrappedStream) {
      received.push(chunk);
    }

    assert.deepStrictEqual(received, ['Hello', ' ', 'world', '!']);
    assert.deepStrictEqual(processed, ['Hello', ' ', 'world', '!']);
    assert.strictEqual(endHookCalled, true);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_CHAT
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_STREAM], true);
    assert.strictEqual(
      typeof span.attributes[ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK],
      'number'
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_PROVIDER_NAME], 'openai');
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_MODEL], 'gpt-4o');
    assert.strictEqual(span.attributes[ATTR_SERVER_ADDRESS], 'api.openai.com');
    assert.strictEqual(span.attributes[ATTR_SERVER_PORT], 443);
  });

  it('should handle stream error and fail the invocation without leaking raw error message on span status', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });

    const invocation = handler.startInference({
      providerName: 'anthropic',
      requestModel: 'claude-3-5-sonnet',
    });

    let errorHookCalledWith: unknown = null;
    const streamError = new Error('Network stream interrupted');

    const rawStream = createAsyncChunkGenerator(
      ['chunk1', 'chunk2'],
      streamError
    );
    const wrappedStream = handler.wrapAsyncStream(rawStream, {
      invocation,
      onError: err => {
        errorHookCalledWith = err;
      },
    });

    const received: string[] = [];
    await assert.rejects(
      async () => {
        for await (const chunk of wrappedStream) {
          received.push(chunk);
        }
      },
      (err: Error) => err.message === 'Network stream interrupted'
    );

    assert.deepStrictEqual(received, ['chunk1', 'chunk2']);
    assert.strictEqual(errorHookCalledWith, streamError);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.status.message, undefined);
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');
  });

  it('should handle non-Error and plain object stream errors gracefully', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });

    const thrownValues: unknown[] = [
      'string error message',
      {
        statusDescription: 'custom object error',
        errorType: 'custom_error',
      },
    ];

    for (const thrown of thrownValues) {
      const invocation = handler.startInference({ providerName: 'openai' });

      async function* throwingGen() {
        yield 'chunk';
        throw thrown;
      }

      const wrappedStream = handler.wrapAsyncStream(throwingGen(), {
        invocation,
      });

      await assert.rejects(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of wrappedStream) {
          // iterate
        }
      });

      const spans = ctx.memoryExporter.getFinishedSpans();
      const span = spans[spans.length - 1];
      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(span.status.message, undefined);
      assert.strictEqual(
        span.attributes[ATTR_ERROR_TYPE],
        ERROR_TYPE_VALUE_OTHER
      );
    }
  });

  it('should transparently proxy properties and methods on SDK stream objects', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });
    const invocation = handler.startInference({ providerName: 'openai' });

    const sdkStream = new FakeSDKStream(['a', 'b']);
    const wrapped = handler.wrapAsyncStream(sdkStream, { invocation });

    // Test property access
    assert.strictEqual(wrapped.customProp, 'custom_value');
    assert.strictEqual(wrapped.customMethod(), 'method_custom_value');
    assert.strictEqual('customProp' in wrapped, true);

    // Test close delegation
    await wrapped.close();
    assert.strictEqual(sdkStream.closed, true);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
  });

  it('should support early break (return) in for await loop', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });
    const invocation = handler.startInference({ providerName: 'openai' });

    const rawStream = createAsyncChunkGenerator(['1', '2', '3', '4']);
    const wrapped = handler.wrapAsyncStream(rawStream, { invocation });

    const received: string[] = [];
    for await (const chunk of wrapped) {
      received.push(chunk);
      if (chunk === '2') {
        break; // triggers iterator.return()
      }
    }

    assert.deepStrictEqual(received, ['1', '2']);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
  });

  it('should handle close() error and fail invocation', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });
    const invocation = handler.startInference({ providerName: 'openai' });

    const sdkStream = new FakeSDKStream(
      [],
      undefined,
      new Error('Close failed')
    );
    const wrapped = handler.wrapAsyncStream(sdkStream, { invocation });

    // Test proxy property set trap
    wrapped.customProp = 'updated_val';
    assert.strictEqual(sdkStream.customProp, 'updated_val');

    await assert.rejects(
      async () => {
        await wrapped.close();
      },
      (err: Error) => err.message === 'Close failed'
    );

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
  });

  it('should support iterator throw() method and handle double finalization gracefully', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });
    const invocation = handler.startInference({ providerName: 'openai' });

    const rawStream = createAsyncChunkGenerator(['a', 'b']);
    const wrapped = handler.wrapAsyncStream(rawStream, { invocation });

    const iter = wrapped[Symbol.asyncIterator]();
    const item1 = await iter.next();
    assert.strictEqual(item1.value, 'a');

    await assert.rejects(async () => {
      await iter.throw?.(new Error('Manual iterator error'));
    });

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
  });

  it('should support generator catching error from iterator.throw() and yielding recovery chunk', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });
    const invocation = handler.startInference({ providerName: 'openai' });

    async function* recoveringGen() {
      try {
        yield 'first';
      } catch {
        yield 'recovered';
      }
    }

    const processed: string[] = [];
    const wrapped = handler.wrapAsyncStream(recoveringGen(), {
      invocation,
      onChunk: c => {
        processed.push(c);
      },
    });

    const iter = wrapped[Symbol.asyncIterator]();
    assert.deepStrictEqual(await iter.next(), { done: false, value: 'first' });
    assert.deepStrictEqual(await iter.throw?.(new Error('Recoverable')), {
      done: false,
      value: 'recovered',
    });
    assert.deepStrictEqual(await iter.next(), {
      done: true,
      value: undefined,
    });

    assert.deepStrictEqual(processed, ['first', 'recovered']);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
  });

  it('should record time_to_first_chunk metric after onChunk so response.model is included', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    const invocation = handler.startInference({
      providerName: 'openai',
      requestModel: 'gpt-4o',
    });

    const rawStream = createAsyncChunkGenerator(['chunk-1', 'chunk-2']);
    const wrapped = handler.wrapAsyncStream(rawStream, {
      invocation,
      onChunk: () => {
        invocation.setResponseModel('gpt-4o-2024-08-06');
      },
    });

    for await (const chunk of wrapped) {
      assert.ok(chunk);
    }

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    const ttftMetric = metrics.find(
      m =>
        m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK
    );
    assert.ok(ttftMetric, 'time_to_first_chunk metric should be recorded');
    const dataPoint = ttftMetric.dataPoints[0];
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_PROVIDER_NAME],
      'openai'
    );
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      'gpt-4o'
    );
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_RESPONSE_MODEL],
      'gpt-4o-2024-08-06'
    );
  });

  it('should handle iterator without return or throw methods and double finalization', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });
    const invocation = handler.startInference({ providerName: 'openai' });

    const streamWithoutReturnOrThrow: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        let count = 0;
        return {
          async next() {
            if (count++ < 2) {
              return { done: false, value: `item-${count}` };
            }
            return { done: true, value: undefined as any };
          },
        };
      },
    };

    const wrapped = handler.wrapAsyncStream(streamWithoutReturnOrThrow, {
      invocation,
    });
    const iter = wrapped[Symbol.asyncIterator]();

    // Call return() when underlying iterator has no return()
    const ret = await iter.return?.('val');
    assert.deepStrictEqual(ret, { done: true, value: 'val' });

    // Call return() again to hit double-finalization branch
    const ret2 = await iter.return?.('val2');
    assert.deepStrictEqual(ret2, { done: true, value: 'val2' });

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
  });

  it('should fail invocation if iterator.return() throws during cleanup', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });
    const invocation = handler.startInference({ providerName: 'openai' });

    const streamWithThrowingReturn: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { done: false, value: 'item-1' };
          },
          async return() {
            throw new Error('Cleanup failed in return()');
          },
        };
      },
    };

    const wrapped = handler.wrapAsyncStream(streamWithThrowingReturn, {
      invocation,
    });
    await assert.rejects(
      async () => {
        for await (const chunk of wrapped) {
          if (chunk === 'item-1') {
            break;
          }
        }
      },
      (err: Error) => err.message === 'Cleanup failed in return()'
    );

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(spans[0].attributes[ATTR_ERROR_TYPE], 'Error');
  });

  it('should handle iterator throw method when underlying iterator has no throw and double failure finalization', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });
    const invocation = handler.startInference({ providerName: 'openai' });

    const streamWithoutThrow: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { done: false, value: 'hello' };
          },
        };
      },
    };

    const wrapped = handler.wrapAsyncStream(streamWithoutThrow, { invocation });
    const iter = wrapped[Symbol.asyncIterator]();

    // Call throw() when underlying iterator has no throw()
    await assert.rejects(async () => {
      await iter.throw?.(new Error('Manual error'));
    });

    // Call throw() again to hit double-failure finalization branch
    await assert.rejects(async () => {
      await iter.throw?.(new Error('Second error'));
    });

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
  });

  it('should support async iterator passed directly without Symbol.asyncIterator method', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });
    const invocation = handler.startInference({ providerName: 'openai' });

    let count = 0;
    const directIterator = {
      async next() {
        if (count++ < 2) {
          return { done: false, value: `item-${count}` };
        }
        return { done: true, value: undefined };
      },
    };

    const wrapped = handler.wrapAsyncStream(directIterator as any, {
      invocation,
    });
    const received: string[] = [];
    for await (const chunk of wrapped) {
      received.push(chunk as string);
    }

    assert.deepStrictEqual(received, ['item-1', 'item-2']);
    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
  });
});
