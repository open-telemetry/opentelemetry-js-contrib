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
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
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
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const meter = ctx.meterProvider.getMeter('test-meter');
    const handler = new TelemetryHandler({ tracer, meter });

    const invocation = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-small',
      serverAddress: 'api.openai.com',
      serverPort: 443,
    });

    invocation.setResponseModel('text-embedding-3-small');
    invocation.setUsage({ inputTokens: 50 });
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
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 50);
    assert.strictEqual(span.status.code, SpanStatusCode.OK);

    assert.strictEqual(invocation.getResponseModel(), 'text-embedding-3-small');

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    const durationMetric = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_DURATION
    );
    const tokenMetric = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_CLIENT_TOKEN_USAGE
    );
    assert.ok(durationMetric);
    assert.ok(tokenMetric);
  });

  it('should record operation duration with error type and suppress token metrics on failure', async () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const meter = ctx.meterProvider.getMeter('test-meter');
    const handler = new TelemetryHandler({ tracer, meter });

    const embInv = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-small',
      serverAddress: 'api.openai.com',
      serverPort: 443,
    });
    embInv.setUsage({ inputTokens: 100 });
    embInv.fail(new Error('Embedding rate limit exceeded'));

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
    const tokenMetric = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_CLIENT_TOKEN_USAGE
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
    assert.strictEqual(dataPoint.attributes[ATTR_ERROR_TYPE], 'Error');

    assert.strictEqual(tokenMetric, undefined);
  });
});
