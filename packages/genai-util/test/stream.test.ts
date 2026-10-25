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
    assert.deepStrictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
      [GEN_AI_FINISH_REASON_VALUE_STOP]
    );
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

  it('should support early break (return) in for await loop, process chunk before yielding, and default finish_reasons to error', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });
    const invocation = handler.startInference({ providerName: 'openai' });

    const events: string[] = [];
    const rawStream = createAsyncChunkGenerator(['1', '2', '3', '4']);
    const wrapped = handler.wrapAsyncStream(rawStream, {
      invocation,
      onChunk: chunk => {
        events.push(`onChunk:${chunk}`);
      },
      onEnd: () => {
        events.push('onEnd');
      },
    });

    const received: string[] = [];
    for await (const chunk of wrapped) {
      events.push(`body:${chunk}`);
      received.push(chunk);
      if (chunk === '2') {
        break; // triggers iterator.return()
      }
    }

    assert.deepStrictEqual(received, ['1', '2']);
    assert.deepStrictEqual(events, [
      'onChunk:1',
      'body:1',
      'onChunk:2',
      'body:2',
      'onEnd',
    ]);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
    assert.deepStrictEqual(
      spans[0].attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
      [GEN_AI_FINISH_REASON_VALUE_ERROR]
    );
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
    assert.deepStrictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
      [GEN_AI_FINISH_REASON_VALUE_ERROR]
    );

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
    const loggedErrors: string[] = [];
    const customDiag = {
      error: (msg: string) => {
        loggedErrors.push(msg);
      },
      warn: () => {},
      info: () => {},
      debug: () => {},
      verbose: () => {},
    };
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
      diag: customDiag,
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
    assert.deepStrictEqual(loggedErrors, [
      'Error in GenAI stream onChunk hook',
      'Error in GenAI stream onChunk hook',
      'Error in GenAI stream onEnd hook',
      'Error in GenAI stream onError hook',
    ]);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
    assert.strictEqual(spans[1].status.code, SpanStatusCode.ERROR);
  });

  it('should await async hooks and capture chunk arrival time before awaiting onChunk', async () => {
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

    let onChunkFinishedHrTime: [number, number] | undefined;
    let recordedChunkTime: unknown;
    const origRecordStreamChunk = invocation.recordStreamChunk.bind(invocation);
    invocation.recordStreamChunk = chunkTime => {
      recordedChunkTime = chunkTime;
      return origRecordStreamChunk(chunkTime);
    };

    const wrapped = handler.wrapAsyncStream(
      createAsyncChunkGenerator(['chunk-1']),
      {
        invocation,
        onChunk: async () => {
          await new Promise(resolve => setTimeout(resolve, 25));
          onChunkFinishedHrTime = process.hrtime();
          invocation.setResponseModel('gpt-4o-2024-08-06');
        },
        onEnd: async () => {
          await Promise.resolve();
          invocation.setFinishReasons([GEN_AI_FINISH_REASON_VALUE_STOP]);
        },
      }
    );

    for await (const chunk of wrapped) {
      assert.strictEqual(chunk, 'chunk-1');
    }

    assert.ok(Array.isArray(recordedChunkTime));
    assert.ok(onChunkFinishedHrTime);
    // Verify TTFT on the span is smaller than the 25ms sleep inside onChunk
    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const ttft = spans[0].attributes[
      ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK
    ] as number;
    assert.strictEqual(typeof ttft, 'number');
    assert.ok(
      ttft < 0.02,
      `Expected TTFT (${ttft}s) to exclude the 25ms async onChunk delay`
    );
    assert.deepStrictEqual(
      spans[0].attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
      [GEN_AI_FINISH_REASON_VALUE_STOP]
    );
  });

  it('should preserve failure status if onEnd marks the invocation as failed (e.g. silent stream abort)', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });

    const invocation = handler.startInference({
      providerName: 'anthropic',
      requestModel: 'claude-sonnet-4-20250514',
    });

    // Simulate an SDK stream that swallows an abort and exits with { done: true }
    const wrapped = handler.wrapAsyncStream(
      createAsyncChunkGenerator(['partial']),
      {
        invocation,
        onEnd: () => {
          invocation.fail({ errorType: 'APIUserAbortError' });
        },
      }
    );

    const received: string[] = [];
    for await (const chunk of wrapped) {
      received.push(chunk);
    }

    assert.deepStrictEqual(received, ['partial']);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(
      spans[0].attributes[ATTR_ERROR_TYPE],
      'APIUserAbortError'
    );
    assert.deepStrictEqual(
      spans[0].attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
      [GEN_AI_FINISH_REASON_VALUE_ERROR]
    );
  });

  it('should record telemetry and end the span when a wrapped generator is consumed via direct .next(), .return(), or .throw() calls', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    // 1. Drain completely via direct .next() calls
    const invocation1 = handler.startInference({
      providerName: 'openai',
      requestModel: 'gpt-4o',
    });
    const chunks1: string[] = [];
    let endCalled1 = false;
    const gen1 = handler.wrapAsyncStream(
      createAsyncChunkGenerator(['a', 'b']),
      {
        invocation: invocation1,
        onChunk: c => {
          chunks1.push(c);
        },
        onEnd: () => {
          endCalled1 = true;
          invocation1.setFinishReasons([GEN_AI_FINISH_REASON_VALUE_STOP]);
        },
      }
    );

    assert.deepStrictEqual(await gen1.next(), { done: false, value: 'a' });
    assert.deepStrictEqual(await gen1.next(), { done: false, value: 'b' });
    assert.deepStrictEqual(await gen1.next(), {
      done: true,
      value: undefined,
    });
    assert.deepStrictEqual(chunks1, ['a', 'b']);
    assert.strictEqual(endCalled1, true);
    assert.strictEqual(invocation1.isEnded(), true);

    // 2. Peek first chunk via .next(), then consume remainder via `for await` without double-counting
    const invocation2 = handler.startInference({
      providerName: 'openai',
      requestModel: 'gpt-4o',
    });
    const chunks2: string[] = [];
    const gen2 = handler.wrapAsyncStream(
      createAsyncChunkGenerator(['first', 'second', 'third']),
      {
        invocation: invocation2,
        onChunk: c => {
          chunks2.push(c);
        },
      }
    );

    const peeked = await gen2.next();
    assert.deepStrictEqual(peeked, { done: false, value: 'first' });
    const rest: string[] = [];
    for await (const chunk of gen2) {
      rest.push(chunk);
    }
    assert.deepStrictEqual(rest, ['second', 'third']);
    assert.deepStrictEqual(chunks2, ['first', 'second', 'third']);
    assert.strictEqual(invocation2.isEnded(), true);

    // 3. Direct .return() and .throw() on wrapped generator
    const invocation3 = handler.startInference({ providerName: 'openai' });
    const gen3 = handler.wrapAsyncStream(
      createAsyncChunkGenerator(['x', 'y']),
      { invocation: invocation3 }
    );
    await gen3.next();
    await gen3.return(undefined);
    assert.strictEqual(invocation3.isEnded(), true);

    const invocation4 = handler.startInference({ providerName: 'openai' });
    const gen4 = handler.wrapAsyncStream(
      createAsyncChunkGenerator(['x', 'y']),
      { invocation: invocation4 }
    );
    await gen4.next();
    await assert.rejects(async () => {
      await gen4.throw(new Error('Direct generator abort'));
    });
    assert.strictEqual(invocation4.isEnded(), true);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 4);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
    assert.strictEqual(spans[1].status.code, SpanStatusCode.UNSET);
    assert.strictEqual(spans[2].status.code, SpanStatusCode.UNSET);
    assert.strictEqual(spans[3].status.code, SpanStatusCode.ERROR);
  });

  it('should wait for pending async onChunk hooks before finalizing on concurrent .next() calls', async () => {
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
    });

    const events: string[] = [];
    let accumulatedText = '';

    const gen = handler.wrapAsyncStream(
      createAsyncChunkGenerator(['Hello ', 'world']),
      {
        invocation,
        onChunk: async chunk => {
          events.push(`onChunk:start:${chunk}`);
          await new Promise(resolve => setTimeout(resolve, 15));
          accumulatedText += chunk;
          invocation.setResponseModel('gpt-4o-2024-08-06');
          events.push(`onChunk:end:${chunk}`);
        },
        onEnd: () => {
          events.push('onEnd');
          invocation.setFinishReasons([GEN_AI_FINISH_REASON_VALUE_STOP]);
          invocation.addOutputMessages([
            {
              role: 'assistant',
              parts: [{ type: 'text', content: accumulatedText }],
              finish_reason: GEN_AI_FINISH_REASON_VALUE_STOP,
            },
          ]);
        },
      }
    );

    const results = await Promise.all([gen.next(), gen.next(), gen.next()]);
    assert.deepStrictEqual(results, [
      { done: false, value: 'Hello ' },
      { done: false, value: 'world' },
      { done: true, value: undefined },
    ]);

    assert.deepStrictEqual(events, [
      'onChunk:start:Hello ',
      'onChunk:end:Hello ',
      'onChunk:start:world',
      'onChunk:end:world',
      'onEnd',
    ]);
    assert.strictEqual(invocation.isEnded(), true);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(
      spans[0].attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
      JSON.stringify([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Hello world' }],
          finish_reason: GEN_AI_FINISH_REASON_VALUE_STOP,
        },
      ])
    );

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    const ttfcMetric = metrics.find(
      m =>
        m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK
    );
    const tpocMetric = metrics.find(
      m =>
        m.descriptor.name ===
        METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK
    );
    assert.ok(ttfcMetric);
    assert.strictEqual(
      (ttfcMetric.dataPoints[0].value as { count: number }).count,
      1
    );
    assert.ok(tpocMetric);
    assert.strictEqual(
      (tpocMetric.dataPoints[0].value as { count: number }).count,
      1
    );
  });

  it('should return an iterable iterator from [Symbol.asyncIterator]() so passing the iterator to for-await works', async () => {
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

    const seen: string[] = [];
    const sdkStream = new FakeSDKStream(['chunk-1', 'chunk-2', 'chunk-3']);
    const wrapped = handler.wrapAsyncStream(sdkStream, {
      invocation,
      onChunk: c => {
        seen.push(c);
      },
      onEnd: () => {
        invocation.setFinishReasons([GEN_AI_FINISH_REASON_VALUE_STOP]);
      },
    });

    const iter = wrapped[
      Symbol.asyncIterator
    ]() as AsyncIterableIterator<string>;
    assert.strictEqual(iter[Symbol.asyncIterator](), iter);

    const first = await iter.next();
    assert.deepStrictEqual(first, { done: false, value: 'chunk-1' });

    const remaining: string[] = [];
    for await (const chunk of iter) {
      remaining.push(chunk);
    }

    assert.deepStrictEqual(remaining, ['chunk-2', 'chunk-3']);
    assert.deepStrictEqual(seen, ['chunk-1', 'chunk-2', 'chunk-3']);
    assert.strictEqual(invocation.isEnded(), true);
  });

  it('should call underlying return() cleanup when throw() is invoked on a wrapped stream without throw() (e.g. yield* over ReadableStream)', async () => {
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

    let returnCalled = false;
    const readableLikeStream: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { done: false, value: 'chunk-1' };
          },
          async return() {
            returnCalled = true;
            return { done: true, value: undefined };
          },
        };
      },
    };

    const wrapped = handler.wrapAsyncStream(readableLikeStream, {
      invocation,
    });

    async function* delegatingGenerator() {
      yield* wrapped;
    }

    const gen = delegatingGenerator();
    assert.deepStrictEqual(await gen.next(), { done: false, value: 'chunk-1' });
    await assert.rejects(
      async () => {
        await gen.throw(new Error('Consumer aborted yield*'));
      },
      (err: Error) => err.message === 'Consumer aborted yield*'
    );

    assert.strictEqual(returnCalled, true);
    assert.strictEqual(invocation.isEnded(), true);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
  });
});
