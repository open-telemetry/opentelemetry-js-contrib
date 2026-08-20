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
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_DATA_SOURCE_ID,
  ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT,
  ATTR_GEN_AI_RETRIEVAL_DOCUMENTS,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
  GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
} from '../../src/semconv';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('RetrievalInvocation', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  it('should create and populate retrieval span with attributes and content', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const meter = ctx.meterProvider.getMeter('test-meter');
    const handler = new TelemetryHandler({
      tracer,
      meter,
      contentCaptureMode: 'span_only',
    });

    const inv = handler.startRetrieval({
      dataSourceId: 'kb_articles_v2',
      providerName: 'pinecone',
      requestModel: 'text-embedding-3-small',
      topK: 5,
      serverAddress: 'pinecone.io',
      serverPort: 443,
      queryText: 'How do I reset my password?',
      documents: [
        { id: 'doc_1', content: 'Go to settings and click reset password.' },
        { id: 'doc_2', content: 'Contact admin if locked out.' },
      ],
    });

    inv.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.name, 'retrieval kb_articles_v2');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_DATA_SOURCE_ID],
      'kb_articles_v2'
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_PROVIDER_NAME], 'pinecone');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      'text-embedding-3-small'
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TOP_K], 5);
    assert.strictEqual(span.attributes[ATTR_SERVER_ADDRESS], 'pinecone.io');
    assert.strictEqual(span.attributes[ATTR_SERVER_PORT], 443);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT],
      'How do I reset my password?'
    );
    assert.ok(span.attributes[ATTR_GEN_AI_RETRIEVAL_DOCUMENTS]);
    assert.strictEqual(span.status.code, SpanStatusCode.OK);
  });

  it('should format default span name when dataSourceId is not provided', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });

    const inv = handler.startRetrieval({});
    inv.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, 'retrieval');
  });

  it('should record retrieval duration metrics with error type and capture query text event on failure', async () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const meter = ctx.meterProvider.getMeter('test-meter');
    const handler = new TelemetryHandler({
      tracer,
      meter,
      contentCaptureMode: 'event_only',
    });

    const inv = handler.startRetrieval({
      dataSourceId: 'kb_articles',
      providerName: 'qdrant',
      queryText: 'How to rotate API keys?',
    });
    inv.fail(new Error('Connection timed out'));

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.status.message, 'Connection timed out');
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');

    // Verify diagnostic query event was emitted despite failure
    const queryEvent = span.events.find(
      e => e.name === EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS
    );
    assert.ok(queryEvent);
    assert.strictEqual(
      queryEvent.attributes?.[ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT],
      'How to rotate API keys?'
    );

    // Verify metric duration was recorded with operation name and error type
    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    const durationMetric = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_DURATION
    );
    assert.ok(durationMetric);
    const dataPoint = durationMetric.dataPoints[0];
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL
    );
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_PROVIDER_NAME],
      'qdrant'
    );
    assert.strictEqual(dataPoint.attributes[ATTR_ERROR_TYPE], 'Error');
  });
});
