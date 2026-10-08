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
import {
  DataPointType,
  type MetricData,
  type MetricReader,
} from '@opentelemetry/sdk-metrics';
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
  METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_TOKEN_MODALITY,
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
      inputTokenCount: 10,
      outputTokenCount: 20,
      reasoningTokenCount: 5,
      cacheReadTokenCount: 15,
      cacheWriteTokenCount: 8,
      tokenUsageByModality: {
        inputTokens: { text: 10 },
        outputTokens: { text: 20 },
        reasoningTokens: { text: 5 },
        cacheReadTokens: { text: 15 },
        cacheWriteTokens: { text: 8 },
      },
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

  it('should omit message attributes when only empty message arrays are provided', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      contentCaptureMode: 'span_only',
    });

    const inv = handler.startInference({
      providerName: 'openai',
      inputMessages: [],
    });
    inv.addInputMessages([]);
    inv.addOutputMessages([]);
    inv.stop();

    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES], undefined);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES], undefined);
  });

  it('should not mutate the caller-supplied inputMessages array', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      contentCaptureMode: 'span_only',
    });

    const inputMessages = [
      {
        role: 'user' as const,
        parts: [{ type: 'text' as const, content: 'first' }],
      },
    ];
    const inv = handler.startInference({
      providerName: 'openai',
      inputMessages,
    });
    inv.addInputMessages([
      {
        role: 'user',
        parts: [{ type: 'text', content: 'second' }],
      },
    ]);
    inv.stop();

    assert.strictEqual(inputMessages.length, 1);
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
    invocation.setUsage({
      inputTokenCount: 10,
      outputTokenCount: 20,
      tokenUsageByModality: {
        inputTokens: { text: 10 },
        outputTokens: { text: 20 },
      },
    });
    invocation.stop();

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    assert.deepStrictEqual(
      metrics.map(m => m.descriptor.name).sort(),
      [
        METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
        METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK,
        METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
        METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
        METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS,
        METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS,
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
      providerName: 'gcp.gemini',
      requestModel: 'gemini-2.5-flash',
    });

    // Streaming providers may report input and output tokens in separate events.
    invocation.setUsage({
      inputTokenCount: 300,
      tokenUsageByModality: { inputTokens: { text: 100, image: 200 } },
    });
    // An explicitly undefined field must not erase the previously reported value.
    invocation.setUsage({
      outputTokenCount: 50,
      inputTokenCount: undefined,
      tokenUsageByModality: {
        outputTokens: { text: 50 },
        inputTokens: undefined,
      },
    });
    invocation.stop();

    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 300);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 50);

    const metrics = await collectMetricsByName(ctx.metricReader);
    // The usage counters are split by modality...
    assert.deepStrictEqual(
      counterValuesByModality(
        metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS)
      ),
      { text: 100, image: 200 }
    );
    assert.deepStrictEqual(
      counterValuesByModality(
        metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS)
      ),
      { text: 50 }
    );
    // ...while the operation histograms record the total once.
    assert.deepStrictEqual(
      histogramPoints(
        metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS)
      ),
      [{ count: 1, sum: 300 }]
    );
    assert.deepStrictEqual(
      histogramPoints(
        metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS)
      ),
      [{ count: 1, sum: 50 }]
    );
  });

  it('should not record error.type on token metrics when inference fails', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    const invocation = handler.startInference({
      providerName: 'openai',
      requestModel: 'gpt-4o',
    });
    // E.g. a stream that reported usage before it was interrupted.
    invocation.setUsage({
      inputTokenCount: 10,
      outputTokenCount: 5,
      tokenUsageByModality: {
        inputTokens: { text: 10 },
        outputTokens: { text: 5 },
      },
    });
    invocation.fail({
      errorType: 'Error',
      statusDescription: 'Stream aborted',
    });

    const metrics = await collectMetricsByName(ctx.metricReader);
    assert.deepStrictEqual(
      [...metrics.keys()].sort(),
      [
        METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
        METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS,
        METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS,
        METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
        METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
      ].sort()
    );
    for (const [name, metric] of metrics) {
      // Only the duration metric defines `error.type`.
      const expectedErrorType =
        name === METRIC_GEN_AI_CLIENT_OPERATION_DURATION ? 'Error' : undefined;
      for (const { attributes } of metric.dataPoints) {
        assert.strictEqual(
          attributes[ATTR_ERROR_TYPE],
          expectedErrorType,
          name
        );
      }
    }
  });

  describe('token usage finalization', () => {
    const TOKEN_METRICS = [
      METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS,
      METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS,
      METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
      METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
    ];

    const startInference = (contentCaptureMode?: 'none' | 'span_only') =>
      new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        meterProvider: ctx.meterProvider,
        contentCaptureMode,
      }).startInference({ providerName: 'openai', requestModel: 'gpt-4o' });

    const dataPointCount = (metric: MetricData | undefined) =>
      metric?.dataPoints.length ?? 0;

    it('should infer inputTokens from cache read and write tokens, per modality', async () => {
      const invocation = startInference();
      invocation.setUsage({
        cacheReadTokenCount: 100,
        cacheWriteTokenCount: 70,
        tokenUsageByModality: {
          cacheReadTokens: { text: 100 },
          cacheWriteTokens: { text: 50, image: 20 },
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 170);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
        100
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS],
        70
      );

      // Metrics are derived from the same inferred usage as the span.
      const metrics = await collectMetricsByName(ctx.metricReader);
      assert.deepStrictEqual(
        counterValuesByModality(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS)
        ),
        { text: 150, image: 20 }
      );
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS)
        ),
        [{ count: 1, sum: 170 }]
      );
    });

    it('should infer outputTokens from reasoning tokens', async () => {
      const invocation = startInference();
      invocation.setUsage({
        reasoningTokenCount: 45,
        tokenUsageByModality: {
          reasoningTokens: { text: 45 },
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 45);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS],
        45
      );

      const metrics = await collectMetricsByName(ctx.metricReader);
      assert.deepStrictEqual(
        counterValuesByModality(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS)
        ),
        { text: 45 }
      );
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS)
        ),
        [{ count: 1, sum: 45 }]
      );
    });

    it('should attribute missing modality to unknown when only scalar counts are reported', async () => {
      const invocation = startInference();
      invocation.setUsage({
        inputTokenCount: 100,
        outputTokenCount: 50,
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 100);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 50);

      const metrics = await collectMetricsByName(ctx.metricReader);
      assert.deepStrictEqual(
        counterValuesByModality(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS)
        ),
        { unknown: 100 }
      );
      assert.deepStrictEqual(
        counterValuesByModality(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS)
        ),
        { unknown: 50 }
      );
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS)
        ),
        [{ count: 1, sum: 100 }]
      );
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS)
        ),
        [{ count: 1, sum: 50 }]
      );
    });

    it('should attribute difference to unknown when partial modality breakdown is reported', async () => {
      const invocation = startInference();
      invocation.setUsage({
        inputTokenCount: 100,
        outputTokenCount: 80,
        tokenUsageByModality: {
          inputTokens: { image: 30 },
          outputTokens: { text: 50 },
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 100);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 80);

      const metrics = await collectMetricsByName(ctx.metricReader);
      assert.deepStrictEqual(
        counterValuesByModality(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS)
        ),
        { image: 30, unknown: 70 }
      );
      assert.deepStrictEqual(
        counterValuesByModality(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS)
        ),
        { text: 50, unknown: 30 }
      );
    });

    it('should not modify reported inputTokens and outputTokens', async () => {
      const invocation = startInference();
      invocation.setUsage({
        inputTokenCount: 500,
        outputTokenCount: 250,
        cacheReadTokenCount: 100,
        cacheWriteTokenCount: 50,
        reasoningTokenCount: 30,
        tokenUsageByModality: {
          inputTokens: { text: 500 },
          outputTokens: { text: 250 },
          cacheReadTokens: { text: 100 },
          cacheWriteTokens: { text: 50 },
          reasoningTokens: { text: 30 },
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 500);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 250);

      const metrics = await collectMetricsByName(ctx.metricReader);
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS)
        ),
        [{ count: 1, sum: 500 }]
      );
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS)
        ),
        [{ count: 1, sum: 250 }]
      );
    });

    it('should not let a later cache or reasoning-only update overwrite reported tokens', async () => {
      const invocation = startInference();
      invocation.setUsage({
        inputTokenCount: 10,
        outputTokenCount: 20,
        tokenUsageByModality: {
          inputTokens: { text: 10 },
          outputTokens: { text: 20 },
        },
      });
      invocation.setUsage({
        cacheReadTokenCount: 5,
        reasoningTokenCount: 3,
        tokenUsageByModality: {
          cacheReadTokens: { text: 5 },
          reasoningTokens: { text: 3 },
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 10);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 20);

      const metrics = await collectMetricsByName(ctx.metricReader);
      assert.deepStrictEqual(
        counterValuesByModality(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS)
        ),
        { text: 10 }
      );
      assert.deepStrictEqual(
        counterValuesByModality(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS)
        ),
        { text: 20 }
      );
    });

    it('should not record undefined token counts on the span or the metrics', async () => {
      const invocation = startInference();
      invocation.setUsage({
        inputTokenCount: undefined,
        outputTokenCount: undefined,
        tokenUsageByModality: {
          inputTokens: {},
          outputTokens: { text: undefined },
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.ok(!(ATTR_GEN_AI_USAGE_INPUT_TOKENS in span.attributes));
      assert.ok(!(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS in span.attributes));

      const metrics = await collectMetricsByName(ctx.metricReader);
      for (const name of TOKEN_METRICS) {
        assert.strictEqual(dataPointCount(metrics.get(name)), 0, name);
      }
    });

    it('should record an explicit 0 on the span but not on the metrics', async () => {
      const invocation = startInference();
      invocation.setUsage({
        inputTokenCount: 0,
        outputTokenCount: 0,
        tokenUsageByModality: {
          inputTokens: { text: 0 },
          outputTokens: { text: 0 },
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 0);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 0);

      const metrics = await collectMetricsByName(ctx.metricReader);
      for (const name of TOKEN_METRICS) {
        assert.strictEqual(dataPointCount(metrics.get(name)), 0, name);
      }
    });

    it('should not infer a 0 that was not reported', () => {
      const invocation = startInference();
      invocation.setUsage({
        cacheReadTokenCount: 0,
        reasoningTokenCount: 0,
        tokenUsageByModality: {
          cacheReadTokens: { text: 0 },
          reasoningTokens: { text: 0 },
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      // The explicitly reported zeros are kept...
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
        0
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS],
        0
      );
      // ...but no input / output value is inferred from them.
      assert.ok(!(ATTR_GEN_AI_USAGE_INPUT_TOKENS in span.attributes));
      assert.ok(!(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS in span.attributes));
    });

    it('should ignore negative token counts on the span', () => {
      const invocation = startInference();
      invocation.setUsage({
        inputTokenCount: -5,
        outputTokenCount: 10,
        tokenUsageByModality: {
          inputTokens: { text: -5 },
          outputTokens: { text: 10, image: -3 },
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.ok(!(ATTR_GEN_AI_USAGE_INPUT_TOKENS in span.attributes));
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 10);
    });

    it('should not mutate the caller-supplied usage object', () => {
      const invocation = startInference();
      const usage = {
        cacheReadTokenCount: 5,
        reasoningTokenCount: 3,
        tokenUsageByModality: {
          cacheReadTokens: { text: 5 },
          reasoningTokens: { text: 3 },
        },
      };
      invocation.setUsage(usage);
      invocation.stop();

      assert.deepStrictEqual(usage, {
        cacheReadTokenCount: 5,
        reasoningTokenCount: 3,
        tokenUsageByModality: {
          cacheReadTokens: { text: 5 },
          reasoningTokens: { text: 3 },
        },
      });
    });

    it('should set usage attributes on failure even when content capture is disabled', async () => {
      const invocation = startInference('none');
      invocation.setUsage({
        cacheReadTokenCount: 8,
        reasoningTokenCount: 4,
        tokenUsageByModality: {
          cacheReadTokens: { text: 8 },
          reasoningTokens: { text: 4 },
        },
      });
      invocation.fail({ errorType: 'Error' });

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 8);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 4);

      const metrics = await collectMetricsByName(ctx.metricReader);
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS)
        ),
        [{ count: 1, sum: 8 }]
      );
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS)
        ),
        [{ count: 1, sum: 4 }]
      );
    });
  });
});

/** Collect the metrics recorded so far, keyed by instrument name. */
async function collectMetricsByName(
  metricReader: MetricReader
): Promise<Map<string, MetricData>> {
  const { resourceMetrics } = await metricReader.collect();
  return new Map(
    resourceMetrics.scopeMetrics
      .flatMap(sm => sm.metrics)
      .map(metric => [metric.descriptor.name, metric])
  );
}

/** Return the count and sum of each data point of a histogram metric. */
function histogramPoints(
  metric: MetricData | undefined
): Array<{ count: number; sum?: number }> {
  assert.ok(metric?.dataPointType === DataPointType.HISTOGRAM);
  return metric.dataPoints.map(({ value }) => ({
    count: value.count,
    sum: value.sum,
  }));
}

/** Return the value of each data point of a counter, keyed by token modality. */
function counterValuesByModality(
  metric: MetricData | undefined
): Record<string, number> {
  assert.ok(metric?.dataPointType === DataPointType.SUM);
  return Object.fromEntries(
    metric.dataPoints.map(({ attributes, value }) => [
      String(attributes[ATTR_GEN_AI_TOKEN_MODALITY]),
      value,
    ])
  );
}
