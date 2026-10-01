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
} from '@opentelemetry/semantic-conventions';
import { TelemetryHandler } from '../../src/handler';
import {
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK,
  METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK,
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
  ATTR_GEN_AI_TOKEN_TYPE,
  GEN_AI_TOKEN_TYPE_VALUE_INPUT,
  GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
} from '../../src/semconv';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('InferenceInvocation', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  it('should create and populate inference span with attributes', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
      contentCaptureMode: 'span_only',
    });

    const invocation = handler.startInference({
      providerName: 'openai',
      operationName: 'chat',
      requestModel: 'gpt-4o',
      serverAddress: 'api.openai.com',
      serverPort: 443,
      requestOptions: {
        temperature: 0.7,
      },
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Hello' }],
        },
      ],
    });

    invocation.setResponseModel('gpt-4o-2024-08-06');
    invocation.setResponseId('chatcmpl-123');
    invocation.setFinishReasons(['stop']);
    invocation.setUsage({
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 5,
      cacheReadTokens: 15,
      cacheWriteTokens: 8,
    });
    invocation.addOutputMessages([
      {
        role: 'assistant',
        parts: [{ type: 'text', content: 'Hi there!' }],
        finish_reason: 'stop',
      },
    ]);
    invocation.setTimeToFirstChunk(0.123);
    invocation.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.name, 'chat gpt-4o');
    assert.strictEqual(span.attributes[ATTR_GEN_AI_PROVIDER_NAME], 'openai');
    assert.strictEqual(span.attributes[ATTR_GEN_AI_OPERATION_NAME], 'chat');
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_MODEL], 'gpt-4o');
    assert.strictEqual(span.attributes[ATTR_SERVER_ADDRESS], 'api.openai.com');
    assert.strictEqual(span.attributes[ATTR_SERVER_PORT], 443);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE], 0.7);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK],
      0.123
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_MODEL],
      'gpt-4o-2024-08-06'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_ID],
      'chatcmpl-123'
    );
    assert.deepStrictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
      ['stop']
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 10);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 20);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS],
      5
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
      15
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS],
      8
    );
    assert.ok(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES]);
    assert.ok(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
    // `stop()` leaves the span status UNSET: only failures set an explicit status.
    assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
  });

  it('should capture diagnostic input attributes, record error metrics, and trigger completion hook when inference fails', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
      contentCaptureMode: 'span_only',
    });

    const invocation = handler.startInference({
      providerName: 'anthropic',
      operationName: 'chat',
      requestModel: 'claude-3-5-sonnet',
      systemInstructions: [
        { type: 'text', content: 'Be precise and concise.' },
      ],
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Generate code' }],
        },
      ],
    });

    const testError = {
      statusDescription: 'Rate limit exceeded',
      errorType: 'Error',
    };
    invocation.fail(testError);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.status.message, 'Rate limit exceeded');
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');

    // In span_only mode, prompt details are on span attributes and only exception event is present
    //assert.strictEqual(span.events.length, 1); // 1 exception event
    assert.ok(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES]);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS],
      JSON.stringify([{ type: 'text', content: 'Be precise and concise.' }])
    );

    // Verify metrics recorded error.type
    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    const durationMetric = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_DURATION
    );
    assert.ok(durationMetric);
    const dataPoint = durationMetric.dataPoints[0];
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_PROVIDER_NAME],
      'anthropic'
    );
    // The metric must report the same `error.type` as the span, not `_OTHER`.
    assert.strictEqual(dataPoint.attributes[ATTR_ERROR_TYPE], 'Error');
  });

  it('should respect content capture mode when disabled vs enabled', () => {
    const handlerNone = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      contentCaptureMode: 'none',
    });

    const invNone = handlerNone.startInference({
      providerName: 'openai',
      operationName: 'chat',
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is the weather?' }],
        },
      ],
    });

    invNone.addOutputMessages([
      {
        role: 'assistant',
        parts: [{ type: 'text', content: 'It is sunny.' }],
        finish_reason: 'stop',
      },
    ]);
    invNone.stop();

    const spansNone = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spansNone.length, 1);
    assert.strictEqual(
      spansNone[0].attributes[ATTR_GEN_AI_INPUT_MESSAGES],
      undefined
    );
    assert.strictEqual(
      spansNone[0].attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
      undefined
    );
    assert.strictEqual(spansNone[0].events.length, 0);

    ctx.reset();

    const handlerSpan = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      contentCaptureMode: 'span_only',
    });

    const invSpan = handlerSpan.startInference({
      providerName: 'openai',
      operationName: 'chat',
      systemInstructions: [
        { type: 'text', content: 'You are a helpful assistant' },
      ],
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is the weather?' }],
        },
      ],
    });

    invSpan.addOutputMessages([
      {
        role: 'assistant',
        parts: [{ type: 'text', content: 'It is sunny.' }],
        finish_reason: 'stop',
      },
    ]);
    invSpan.stop();

    const spansSpan = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spansSpan.length, 1);
    assert.ok(spansSpan[0].attributes[ATTR_GEN_AI_INPUT_MESSAGES]);
    assert.ok(spansSpan[0].attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
    assert.strictEqual(
      spansSpan[0].attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS],
      JSON.stringify([{ type: 'text', content: 'You are a helpful assistant' }])
    );
    assert.strictEqual(spansSpan[0].events.length, 0);
  });

  it('should serialize start-time and later content once at end', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      contentCaptureMode: 'span_only',
    });

    const first = {
      role: 'user' as const,
      parts: [{ type: 'text' as const, content: 'first' }],
    };
    const second = {
      role: 'user' as const,
      parts: [{ type: 'text' as const, content: 'second' }],
    };
    const third = {
      role: 'user' as const,
      parts: [{ type: 'text' as const, content: 'third' }],
    };
    const out1 = {
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, content: 'a' }],
      finish_reason: 'stop' as const,
    };
    const out2 = {
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, content: 'b' }],
      finish_reason: 'stop' as const,
    };

    const inv = handler.startInference({
      providerName: 'openai',
      systemInstructions: [{ type: 'text', content: 'initial' }],
      inputMessages: [first],
    });

    // Content, including content supplied at start, is not serialized until end.
    const liveAttrs = (inv as any)._span.attributes;
    assert.strictEqual(liveAttrs[ATTR_GEN_AI_INPUT_MESSAGES], undefined);
    assert.strictEqual(liveAttrs[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS], undefined);

    inv.addInputMessages([second]);
    inv.addInputMessages([third]);
    inv.addOutputMessages([out1]);
    inv.addOutputMessages([out2]);
    inv.setSystemInstructions([{ type: 'text', content: 'updated' }]);

    assert.strictEqual(liveAttrs[ATTR_GEN_AI_INPUT_MESSAGES], undefined);
    assert.strictEqual(liveAttrs[ATTR_GEN_AI_OUTPUT_MESSAGES], undefined);
    assert.strictEqual(liveAttrs[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS], undefined);

    inv.stop();

    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_INPUT_MESSAGES],
      JSON.stringify([first, second, third])
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
      JSON.stringify([out1, out2])
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS],
      JSON.stringify([{ type: 'text', content: 'updated' }])
    );
  });

  it('should handle comprehensive request options and system instructions', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      contentCaptureMode: 'span_only',
    });

    const inv = handler.startInference({
      providerName: 'anthropic',
      operationName: 'chat',
      requestModel: 'claude-3-5-sonnet',
      conversationId: 'conv-123',
      serverAddress: 'api.anthropic.com',
      serverPort: 443,
      systemInstructions: [{ type: 'text', content: 'Be concise.' }],
      requestOptions: {
        temperature: 0.5,
        topP: 0.9,
        topK: 50,
        maxTokens: 2048,
        stopSequences: ['END'],
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        choiceCount: 1,
        seed: 42,
      },
    });

    inv.setAttribute('custom.key', 'custom.val');
    inv.setAttributes({ 'another.key': 'val2' });
    inv.recordStreamChunk();
    inv.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(
      spans[0].attributes[ATTR_SERVER_ADDRESS],
      'api.anthropic.com'
    );
    assert.strictEqual(spans[0].attributes[ATTR_SERVER_PORT], 443);
    assert.strictEqual(
      spans[0].attributes[ATTR_GEN_AI_CONVERSATION_ID],
      'conv-123'
    );
    assert.strictEqual(spans[0].attributes['custom.key'], 'custom.val');
    assert.strictEqual(spans[0].attributes['another.key'], 'val2');
    assert.strictEqual(
      typeof spans[0].attributes[ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK],
      'number'
    );
  });

  it('should format span name correctly when requestModel is omitted or provided', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
    });

    // Case 1: requestModel provided
    const invWithModel = handler.startInference({
      providerName: 'openai',
      operationName: 'chat',
      requestModel: 'gpt-4o',
    });
    invWithModel.stop();

    // Case 2: requestModel omitted (defaults operationName to 'chat')
    const invWithoutModel = handler.startInference({
      providerName: 'openai',
      operationName: 'chat',
    });
    invWithoutModel.stop();

    // Case 3: custom operationName without requestModel
    const invCustomOp = handler.startInference({
      providerName: 'google',
      operationName: 'generate_content',
    });
    invCustomOp.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3);
    assert.strictEqual(spans[0].name, 'chat gpt-4o');
    assert.strictEqual(spans[1].name, 'chat');
    assert.strictEqual(spans[2].name, 'generate_content');
  });

  it('should only set stream attribute on span when stream is true and omit when false', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
    });

    const invStreaming = handler.startInference({
      providerName: 'openai',
      operationName: 'chat',
      requestOptions: { stream: true },
    });
    invStreaming.stop();

    const invNonStreaming = handler.startInference({
      providerName: 'openai',
      operationName: 'chat',
      requestOptions: { stream: false },
    });
    invNonStreaming.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);
    assert.strictEqual(spans[0].attributes[ATTR_GEN_AI_REQUEST_STREAM], true);
    assert.strictEqual(
      spans[1].attributes[ATTR_GEN_AI_REQUEST_STREAM],
      undefined
    );
  });

  it('should record time to first chunk once and time per output chunk for each later chunk', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    const invocation = handler.startInference({ providerName: 'openai' });
    invocation.recordStreamChunk();
    invocation.recordStreamChunk();
    invocation.recordStreamChunk();
    invocation.stop();
    // Chunks after the invocation has ended are ignored.
    invocation.recordStreamChunk();

    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_STREAM], true);
    assert.strictEqual(
      typeof span.attributes[ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK],
      'number'
    );

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    const histogramCount = (name: string) => {
      const metric = metrics.find(m => m.descriptor.name === name);
      return (metric?.dataPoints[0]?.value as { count: number } | undefined)
        ?.count;
    };
    assert.strictEqual(
      histogramCount(METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK),
      1
    );
    assert.strictEqual(
      histogramCount(METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK),
      2
    );
  });

  it('should record caller-supplied metric attributes on every metric, overriding semantic convention dimensions', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    const invocation = handler.startInference({
      providerName: 'openai',
      operationName: 'chat',
      requestModel: 'gpt-4o',
      metricAttributes: { [ATTR_GEN_AI_REQUEST_MODEL]: 'gpt-4o-normalized' },
    });
    invocation.setResponseModel('gpt-4o-2024-08-06');
    // Set before the first chunk: time to first chunk is recorded as the stream is
    // consumed, so attributes added later cannot reach it.
    invocation.setMetricAttributes({
      [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-normalized',
      'custom.metric.attr': 'metric-value',
    });
    invocation.recordStreamChunk();
    invocation.setUsage({ inputTokens: 10, outputTokens: 20 });
    invocation.stop();

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    assert.deepStrictEqual(
      metrics.map(m => m.descriptor.name).sort(),
      [
        METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
        METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK,
        METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
      ].sort()
    );

    // Every metric must be recorded through `_getMetricAttributes`: one that builds its
    // attributes from scratch would drop the caller's values.
    for (const metric of metrics) {
      for (const { attributes } of metric.dataPoints) {
        const name = metric.descriptor.name;
        assert.strictEqual(
          attributes['custom.metric.attr'],
          'metric-value',
          name
        );
        assert.strictEqual(
          attributes[ATTR_GEN_AI_REQUEST_MODEL],
          'gpt-4o-normalized',
          name
        );
        assert.strictEqual(
          attributes[ATTR_GEN_AI_RESPONSE_MODEL],
          'gpt-4o-normalized',
          name
        );
        // Dimensions the caller did not override keep their semantic convention value.
        assert.strictEqual(
          attributes[ATTR_GEN_AI_PROVIDER_NAME],
          'openai',
          name
        );
        assert.strictEqual(
          attributes[ATTR_GEN_AI_OPERATION_NAME],
          'chat',
          name
        );
      }
    }

    // Metric attributes must not leak onto the span, which keeps the semantic
    // convention values.
    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.attributes['custom.metric.attr'], undefined);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_MODEL], 'gpt-4o');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_MODEL],
      'gpt-4o-2024-08-06'
    );
  });

  it('should merge usage across multiple setUsage calls on span and metrics', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    const invocation = handler.startInference({
      providerName: 'anthropic',
      requestModel: 'claude',
    });

    // Streaming providers may report input and output tokens in separate events.
    invocation.setUsage({ inputTokens: 10 });
    invocation.setUsage({ outputTokens: 20, inputTokens: undefined });
    invocation.stop();

    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 10);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 20);

    const { resourceMetrics } = await ctx.metricReader.collect();
    const tokenMetric = resourceMetrics.scopeMetrics[0]?.metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_CLIENT_TOKEN_USAGE
    );
    assert.ok(tokenMetric, 'token usage metric should be recorded');

    const sumByType = new Map<unknown, number>();
    for (const dp of tokenMetric.dataPoints) {
      const value = dp.value as { sum?: number };
      sumByType.set(dp.attributes[ATTR_GEN_AI_TOKEN_TYPE], value.sum ?? 0);
    }
    assert.strictEqual(sumByType.get(GEN_AI_TOKEN_TYPE_VALUE_INPUT), 10);
    assert.strictEqual(sumByType.get(GEN_AI_TOKEN_TYPE_VALUE_OUTPUT), 20);
  });
});
