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
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_FINISH_REASON_VALUE_ERROR,
  GEN_AI_FINISH_REASON_VALUE_STOP,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK,
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
    private _error?: Error
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

  it('should wrap async iterable, track chunks, and flush telemetry set in onEnd before stopping the invocation', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
      contentCaptureMode: 'span_only',
    });

    const invocation = handler.startInference({
      providerName: 'openai',
      requestModel: 'gpt-4o',
      serverAddress: 'api.openai.com',
      serverPort: 443,
    });

    const processed: string[] = [];

    const rawStream = createAsyncChunkGenerator(['Hello', ' ', 'world', '!']);
    const wrappedStream = handler.wrapAsyncStream(rawStream, {
      invocation,
      onChunk: chunk => {
        processed.push(chunk);
      },
      onEnd: () => {
        invocation.addOutputMessages([
          {
            role: 'assistant',
            parts: [{ type: 'text', content: processed.join('') }],
            finish_reason: GEN_AI_FINISH_REASON_VALUE_STOP,
          },
        ]);
        invocation.setFinishReasons([GEN_AI_FINISH_REASON_VALUE_STOP]);
        invocation.setUsage({ inputTokenCount: 10, outputTokenCount: 4 });
      },
    });

    const received: string[] = [];
    for await (const chunk of wrappedStream) {
      received.push(chunk);
    }

    assert.deepStrictEqual(received, ['Hello', ' ', 'world', '!']);
    assert.deepStrictEqual(processed, ['Hello', ' ', 'world', '!']);

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
    assert.deepStrictEqual(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS], [
      GEN_AI_FINISH_REASON_VALUE_STOP,
    ]);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 10);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 4);
    assert.deepStrictEqual(
      JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string),
      [
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Hello world!' }],
          finish_reason: GEN_AI_FINISH_REASON_VALUE_STOP,
        },
      ]
    );
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

  it('should wrap SDK stream objects in-place while preserving identity and members', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });
    const invocation = handler.startInference({ providerName: 'openai' });

    const sdkStream = new FakeSDKStream(['a', 'b']);
    const wrapped = handler.wrapAsyncStream(sdkStream, { invocation });

    // Preserves object identity and prototype (for APIPromise in-place wrapping)
    assert.strictEqual(wrapped, sdkStream);
    assert.strictEqual(wrapped instanceof FakeSDKStream, true);

    // Preserves SDK properties and methods
    assert.strictEqual(wrapped.customProp, 'custom_value');
    assert.strictEqual(wrapped.customMethod(), 'method_custom_value');
    assert.strictEqual('customProp' in wrapped, true);

    wrapped.customProp = 'updated_val';
    assert.strictEqual(sdkStream.customProp, 'updated_val');
    assert.strictEqual(wrapped.customMethod(), 'method_updated_val');

    await wrapped.close();
    assert.strictEqual(sdkStream.closed, true);

    // Iterating the original reference directly still triggers telemetry
    const received: string[] = [];
    for await (const chunk of sdkStream) {
      received.push(chunk);
    }
    assert.deepStrictEqual(received, ['a', 'b']);

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

  it('should record time_to_first_chunk and time_per_output_chunk metrics after onChunk so response.model is included', async () => {
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

    const rawStream = createAsyncChunkGenerator([
      'chunk-1',
      'chunk-2',
      'chunk-3',
    ]);
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
    const ttftPoint = ttftMetric.dataPoints[0];
    assert.strictEqual((ttftPoint.value as { count: number }).count, 1);
    assert.strictEqual(
      ttftPoint.attributes[ATTR_GEN_AI_PROVIDER_NAME],
      'openai'
    );
    assert.strictEqual(
      ttftPoint.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      'gpt-4o'
    );
    assert.strictEqual(
      ttftPoint.attributes[ATTR_GEN_AI_RESPONSE_MODEL],
      'gpt-4o-2024-08-06'
    );

    const tpocMetric = metrics.find(
      m =>
        m.descriptor.name ===
        METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK
    );
    assert.ok(tpocMetric, 'time_per_output_chunk metric should be recorded');
    const tpocPoint = tpocMetric.dataPoints[0];
    assert.strictEqual((tpocPoint.value as { count: number }).count, 2);
    assert.strictEqual(
      tpocPoint.attributes[ATTR_GEN_AI_PROVIDER_NAME],
      'openai'
    );
    assert.strictEqual(
      tpocPoint.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      'gpt-4o'
    );
    assert.strictEqual(
      tpocPoint.attributes[ATTR_GEN_AI_RESPONSE_MODEL],
      'gpt-4o-2024-08-06'
    );
  });

  it('should handle empty stream (0 chunks) by setting stream attribute, omitting chunk timing, and finalizing', async () => {
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

    let chunkCalled = false;
    let endCalled = false;
    const wrapped = handler.wrapAsyncStream(createAsyncChunkGenerator([]), {
      invocation,
      onChunk: () => {
        chunkCalled = true;
      },
      onEnd: () => {
        endCalled = true;
      },
    });

    for await (const _chunk of wrapped) {
      assert.fail('should not yield any chunks');
    }

    assert.strictEqual(chunkCalled, false);
    assert.strictEqual(endCalled, true);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];
    assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_STREAM], true);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK],
      undefined
    );
    assert.deepStrictEqual(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS], [
      GEN_AI_FINISH_REASON_VALUE_ERROR,
    ]);

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    assert.strictEqual(
      metrics.find(
        m =>
          m.descriptor.name ===
          METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK
      ),
      undefined
    );
    assert.strictEqual(
      metrics.find(
        m =>
          m.descriptor.name ===
          METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK
      ),
      undefined
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

  it('should isolate errors thrown in onChunk, onEnd, and onError hooks without leaking spans', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });

    // 1. Throwing onChunk and onEnd on a successful stream
    const invocation1 = handler.startInference({ providerName: 'openai' });
    const wrappedSuccess = handler.wrapAsyncStream(
      createAsyncChunkGenerator(['a', 'b']),
      {
        invocation: invocation1,
        onChunk: () => {
          throw new Error('onChunk bug');
        },
        onEnd: () => {
          throw new Error('onEnd bug');
        },
      }
    );

    const received: string[] = [];
    for await (const chunk of wrappedSuccess) {
      received.push(chunk);
    }
    assert.deepStrictEqual(received, ['a', 'b']);
    assert.strictEqual(invocation1.isEnded(), true);

    // 2. Throwing onError on a failing stream preserves original stream error and ends span
    const invocation2 = handler.startInference({ providerName: 'openai' });
    const wrappedFailure = handler.wrapAsyncStream(
      createAsyncChunkGenerator(['x'], new Error('Original stream error')),
      {
        invocation: invocation2,
        onError: () => {
          throw new Error('onError bug');
        },
      }
    );

    await assert.rejects(
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of wrappedFailure) {
          // iterate
        }
      },
      (err: Error) => err.message === 'Original stream error'
    );
    assert.strictEqual(invocation2.isEnded(), true);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
    assert.strictEqual(spans[1].status.code, SpanStatusCode.ERROR);
  });
});
