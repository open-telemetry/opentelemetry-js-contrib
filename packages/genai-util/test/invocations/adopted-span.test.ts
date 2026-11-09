/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { DataPointType } from '@opentelemetry/sdk-metrics';
import { TelemetryHandler } from '../../src/handler';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
} from '../../src/semconv';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('Invocations with an adopted span', () => {
  let ctx: TestTelemetryContext;
  let handler: TelemetryHandler;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
    handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '0.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  function startOuterSpan() {
    return ctx.tracerProvider
      .getTracer('outer')
      .startSpan('Outer.Operation', { kind: SpanKind.CLIENT });
  }

  it('records on the given span without ending it', () => {
    const span = startOuterSpan();
    const invocation = handler.startInference({
      providerName: 'aws.bedrock',
      requestModel: 'model-a',
      span,
    });

    assert.strictEqual(
      trace.getSpan(invocation.getContext()),
      span,
      'invocation context carries the adopted span'
    );

    invocation.setFinishReasons(['stop']);
    invocation.setUsage({ inputTokenCount: 3, outputTokenCount: 4 });
    invocation.stop();

    assert.strictEqual(invocation.isEnded(), true);
    assert.strictEqual(ctx.memoryExporter.getFinishedSpans().length, 0);

    // The caller can still add attributes before ending the span itself.
    span.setAttribute('custom.attr', 'value');
    span.end();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, 'Outer.Operation');
    assert.strictEqual(spans[0].kind, SpanKind.CLIENT);
    assert.deepStrictEqual(spans[0].attributes, {
      [ATTR_GEN_AI_PROVIDER_NAME]: 'aws.bedrock',
      [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
      [ATTR_GEN_AI_REQUEST_MODEL]: 'model-a',
      [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 3,
      'gen_ai.usage.output_tokens': 4,
      'custom.attr': 'value',
    });
  });

  it('records error state and metrics on fail', async () => {
    const span = startOuterSpan();
    const invocation = handler.startEmbedding({
      providerName: 'aws.bedrock',
      requestModel: 'embed-a',
      span,
    });
    invocation.fail({ errorType: 'ValidationException' });
    span.end();

    const [finished] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(finished.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(
      finished.attributes[ATTR_ERROR_TYPE],
      'ValidationException'
    );

    const { resourceMetrics } = await ctx.metricReader.collect();
    const duration = resourceMetrics.scopeMetrics
      .flatMap(s => s.metrics)
      .find(m => m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_DURATION);
    assert.ok(duration);
    assert.strictEqual(duration.dataPointType, DataPointType.HISTOGRAM);
    assert.strictEqual(duration.dataPoints.length, 1);
    assert.strictEqual(
      duration.dataPoints[0].attributes[ATTR_ERROR_TYPE],
      'ValidationException'
    );
  });
});
