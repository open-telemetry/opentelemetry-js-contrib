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
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT,
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
    // `stop()` leaves the span status UNSET: only failures set an explicit status.
    assert.strictEqual(span.status.code, SpanStatusCode.UNSET);

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
    assert.strictEqual(dataPoint.attributes[ATTR_ERROR_TYPE], '_OTHER');

    assert.strictEqual(tokenMetric, undefined);
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

    assert.deepStrictEqual(inv1.getEncodingFormats(), ['float', 'base64']);
    assert.strictEqual(inv1.getDimensionCount(), 512);
    inv1.stop();

    // Test 2: configured via setters
    const inv2 = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-large',
    });

    inv2.setEncodingFormats(['binary']);
    inv2.setDimensionCount(1024);
    assert.deepStrictEqual(inv2.getEncodingFormats(), ['binary']);
    assert.strictEqual(inv2.getDimensionCount(), 1024);
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
});
