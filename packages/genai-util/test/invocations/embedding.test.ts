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
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
} from '../../src/semconv';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('EmbeddingInvocation', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  it('should handle embedding spans and record success metrics', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    const invocation = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-small',
      serverAddress: 'api.openai.com',
      serverPort: 443,
    });

    invocation.setResponseModel('text-embedding-3-small');
    invocation.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.name, 'embeddings text-embedding-3-small');
    assert.strictEqual(span.attributes[ATTR_GEN_AI_PROVIDER_NAME], 'openai');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS
    );
    assert.strictEqual(span.attributes[ATTR_SERVER_ADDRESS], 'api.openai.com');
    assert.strictEqual(span.attributes[ATTR_SERVER_PORT], 443);
    // `stop()` leaves the span status UNSET: only failures set an explicit status.
    assert.strictEqual(span.status.code, SpanStatusCode.UNSET);

    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_MODEL],
      'text-embedding-3-small'
    );

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    const durationMetric = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_DURATION
    );
    assert.ok(durationMetric);
  });

  it('should mark span as error and record operation duration with error type on failure', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    const embInv = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-small',
      serverAddress: 'api.openai.com',
      serverPort: 443,
    });
    embInv.fail({
      exception: new Error('Embedding rate limit exceeded'),
      statusDescription: 'Embedding rate limit exceeded',
    });

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(
      spans[0].status.message,
      'Embedding rate limit exceeded'
    );
    assert.strictEqual(spans[0].attributes[ATTR_ERROR_TYPE], 'Error');

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    const durationMetric = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_DURATION
    );

    assert.ok(durationMetric);
    const dataPoint = durationMetric.dataPoints[0];
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_PROVIDER_NAME],
      'openai'
    );
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS
    );
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      'text-embedding-3-small'
    );
    // The metric must report the same `error.type` as the span, not `_OTHER`.
    assert.strictEqual(dataPoint.attributes[ATTR_ERROR_TYPE], 'Error');
  });

  it('should format span name correctly when requestModel is omitted or provided', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
    });

    // Case 1: requestModel provided (default operationName 'embeddings')
    const invWithModel = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-small',
    });
    invWithModel.stop();

    // Case 2: requestModel omitted (defaults operationName to 'embeddings')
    const invWithoutModel = handler.startEmbedding({
      providerName: 'openai',
    });
    invWithoutModel.stop();

    // Case 3: custom operationName with requestModel
    const invCustomOpWithModel = handler.startEmbedding({
      providerName: 'google',
      operationName: 'generate_content',
      requestModel: 'text-embedding-004',
    });
    invCustomOpWithModel.stop();

    // Case 4: custom operationName without requestModel
    const invCustomOp = handler.startEmbedding({
      providerName: 'google',
      operationName: 'generate_content',
    });
    invCustomOp.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 4);
    assert.strictEqual(spans[0].name, 'embeddings text-embedding-3-small');
    assert.strictEqual(spans[1].name, 'embeddings');
    assert.strictEqual(spans[2].name, 'generate_content text-embedding-004');
    assert.strictEqual(spans[3].name, 'generate_content');
  });

  it('should support encodingFormats and dimensionCount via options and methods', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
    });

    // Test 1: configured via options
    const inv1 = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-small',
      encodingFormats: ['float', 'base64'],
      dimensionCount: 512,
    });

    inv1.stop();

    // Test 2: configured via setters
    const inv2 = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-large',
    });

    inv2.setEncodingFormats(['binary']);
    inv2.setDimensionCount(1024);
    inv2.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);

    // Verify span 1
    assert.deepStrictEqual(
      spans[0].attributes[ATTR_GEN_AI_REQUEST_ENCODING_FORMATS],
      ['float', 'base64']
    );
    assert.strictEqual(
      spans[0].attributes[ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT],
      512
    );

    // Verify span 2
    assert.deepStrictEqual(
      spans[1].attributes[ATTR_GEN_AI_REQUEST_ENCODING_FORMATS],
      ['binary']
    );
    assert.strictEqual(
      spans[1].attributes[ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT],
      1024
    );
  });

  it('should record caller-supplied metric attributes on every metric, overriding semantic convention dimensions', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    const invocation = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-small',
      metricAttributes: { [ATTR_GEN_AI_REQUEST_MODEL]: 'normalized' },
    });
    invocation.setMetricAttribute('custom.metric.attr', 'metric-value');
    invocation.stop();

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    assert.deepStrictEqual(
      metrics.map(m => m.descriptor.name).sort(),
      [METRIC_GEN_AI_CLIENT_OPERATION_DURATION].sort()
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
          'normalized',
          name
        );
        // Dimensions the caller did not override keep their semantic convention value.
        assert.strictEqual(
          attributes[ATTR_GEN_AI_OPERATION_NAME],
          GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
          name
        );
      }
    }

    // Metric attributes must not leak onto the span, which keeps the semantic
    // convention values.
    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.attributes['custom.metric.attr'], undefined);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      'text-embedding-3-small'
    );
  });

  describe('token usage', () => {
    it('should record gen_ai.usage.input_tokens on the span', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      const invocation = handler.startEmbedding({
        providerName: 'openai',
        requestModel: 'text-embedding-3-small',
      });

      invocation.setUsage({ inputTokenCount: 120 });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 120);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS],
        undefined
      );
    });

    it('should merge multiple setUsage calls', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      const invocation = handler.startEmbedding({
        providerName: 'openai',
      });

      invocation.setUsage({ inputTokenCount: 50 });
      invocation.setUsage({ inputTokenCount: 100 });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 100);
    });

    it('should infer inputTokens from cache read and cache write tokens', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      const invocation = handler.startEmbedding({
        providerName: 'openai',
      });

      invocation.setUsage({
        cacheReadTokenCount: 30,
        cacheWriteTokenCount: 20,
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 50);
    });

    it('should record explicit 0 on the span but ignore negative counts', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      const invZero = handler.startEmbedding({ providerName: 'openai' });
      invZero.setUsage({ inputTokenCount: 0 });
      invZero.stop();

      const invNegative = handler.startEmbedding({ providerName: 'openai' });
      invNegative.setUsage({ inputTokenCount: -5 });
      invNegative.stop();

      const spans = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(
        spans[0].attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS],
        0
      );
      assert.strictEqual(
        spans[1].attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS],
        undefined
      );
    });

    it('should not record token metrics for embedding invocations', async () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        meterProvider: ctx.meterProvider,
      });

      const invocation = handler.startEmbedding({
        providerName: 'openai',
      });
      invocation.setUsage({ inputTokenCount: 100 });
      invocation.stop();

      const { resourceMetrics } = await ctx.metricReader.collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      assert.deepStrictEqual(
        metrics.map(m => m.descriptor.name),
        [METRIC_GEN_AI_CLIENT_OPERATION_DURATION]
      );
    });
  });
});
