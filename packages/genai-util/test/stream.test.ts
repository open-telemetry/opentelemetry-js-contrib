/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { TelemetryHandler } from '../src/handler';
import { AsyncStreamWrapper, wrapAsyncStream } from '../src/stream';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
} from '../src/semconv';

class TestMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

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

class CustomStreamSubclass<TChunk> extends AsyncStreamWrapper<TChunk> {
  public processedChunks: TChunk[] = [];
  public endCalled = false;
  public errorCalledWith: unknown = null;

  protected override async _processChunk(chunk: TChunk): Promise<void> {
    this.processedChunks.push(chunk);
  }

  protected override async _onStreamEnd(): Promise<void> {
    this.endCalled = true;
    await super._onStreamEnd();
  }

  protected override async _onStreamError(error: unknown): Promise<void> {
    this.errorCalledWith = error;
    await super._onStreamError(error);
  }
}

describe('AsyncStreamWrapper & wrapAsyncStream', () => {
  let tracerProvider: BasicTracerProvider;
  let memoryExporter: InMemorySpanExporter;
  let meterProvider: MeterProvider;
  let metricReader: TestMetricReader;

  beforeEach(() => {
    memoryExporter = new InMemorySpanExporter();
    tracerProvider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
    });

    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
  });

  afterEach(async () => {
    await tracerProvider.shutdown();
    await meterProvider.shutdown();
  });

  it('should wrap async iterable and track chunks, stream attribute, and completion', async () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    const meter = meterProvider.getMeter('test-meter');
    const handler = new TelemetryHandler({ tracer, meter });

    const invocation = handler.startInference({
      providerName: 'openai',
      requestModel: 'gpt-4o',
      serverAddress: 'api.openai.com',
      serverPort: 443,
    });

    const processed: string[] = [];
    let endHookCalled = false;

    const rawStream = createAsyncChunkGenerator(['Hello', ' ', 'world', '!']);
    const wrappedStream = wrapAsyncStream(rawStream, {
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

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.status.code, SpanStatusCode.OK);
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

  it('should handle stream error and fail the invocation with exception event', async () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });

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
    const wrappedStream = wrapAsyncStream(rawStream, {
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

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.status.message, 'Network stream interrupted');
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');
    assert.strictEqual(span.events.length, 1);
    assert.strictEqual(span.events[0].name, 'exception');
  });

  it('should transparently proxy properties and methods on SDK stream objects', async () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });
    const invocation = handler.startInference({ providerName: 'openai' });

    const sdkStream = new FakeSDKStream(['a', 'b']);
    const wrapped = handler.wrapAsyncStream(sdkStream, invocation);

    // Test property access
    assert.strictEqual(wrapped.customProp, 'custom_value');
    assert.strictEqual(wrapped.customMethod(), 'method_custom_value');
    assert.strictEqual('customProp' in wrapped, true);

    // Test close delegation
    await wrapped.close();
    assert.strictEqual(sdkStream.closed, true);

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
  });

  it('should support early break (return) in for await loop', async () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });
    const invocation = handler.startInference({ providerName: 'openai' });

    const rawStream = createAsyncChunkGenerator(['1', '2', '3', '4']);
    const wrapped = wrapAsyncStream(rawStream, invocation);

    const received: string[] = [];
    for await (const chunk of wrapped) {
      received.push(chunk);
      if (chunk === '2') {
        break; // triggers iterator.return()
      }
    }

    assert.deepStrictEqual(received, ['1', '2']);

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
  });

  it('should support subclassing AsyncStreamWrapper with custom hooks', async () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });
    const invocation = handler.startInference({ providerName: 'openai' });

    const rawStream = createAsyncChunkGenerator(['x', 'y', 'z']);
    const customWrapper = new CustomStreamSubclass(rawStream, invocation);

    const received: string[] = [];
    for await (const chunk of customWrapper) {
      received.push(chunk);
    }

    assert.deepStrictEqual(received, ['x', 'y', 'z']);
    assert.deepStrictEqual(customWrapper.processedChunks, ['x', 'y', 'z']);
    assert.strictEqual(customWrapper.endCalled, true);

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
  });

  it('should work with AgentInvocation for remote and local streaming agents', async () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    const meter = meterProvider.getMeter('test-meter');
    const handler = new TelemetryHandler({ tracer, meter });

    const agentInv = handler.startRemoteAgent({
      providerName: 'openai',
      agentName: 'Streaming Agent',
      serverAddress: 'api.openai.com',
      serverPort: 443,
    });

    const rawStream = createAsyncChunkGenerator([
      'agent-step-1',
      'agent-step-2',
    ]);
    const wrapped = handler.wrapAsyncStream(rawStream, {
      invocation: agentInv,
    });

    for await (const chunk of wrapped) {
      assert.ok(chunk);
    }

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.kind, SpanKind.CLIENT);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_STREAM], true);
    assert.strictEqual(
      typeof span.attributes[ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK],
      'number'
    );
    assert.strictEqual(span.status.code, SpanStatusCode.OK);
  });

  it('should handle close() error and fail invocation', async () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });
    const invocation = handler.startInference({ providerName: 'openai' });

    const sdkStream = new FakeSDKStream(
      [],
      undefined,
      new Error('Close failed')
    );
    const wrapped = wrapAsyncStream(sdkStream, invocation);

    // Test proxy property set trap
    wrapped.customProp = 'updated_val';
    assert.strictEqual(sdkStream.customProp, 'updated_val');

    await assert.rejects(
      async () => {
        await wrapped.close();
      },
      (err: Error) => err.message === 'Close failed'
    );

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
  });

  it('should support iterator throw() method and handle double finalization gracefully', async () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });
    const invocation = handler.startInference({ providerName: 'openai' });

    const rawStream = createAsyncChunkGenerator(['a', 'b']);
    const wrapped = wrapAsyncStream(rawStream, invocation);

    const iter = wrapped[Symbol.asyncIterator]();
    const item1 = await iter.next();
    assert.strictEqual(item1.value, 'a');

    await assert.rejects(async () => {
      await iter.throw?.(new Error('Manual iterator error'));
    });

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
  });
});
