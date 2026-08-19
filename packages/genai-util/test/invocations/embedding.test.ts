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
  TelemetryHandler,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
} from '../../src';
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

  it('should handle embedding spans', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });

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
      'embeddings'
    );
    assert.strictEqual(span.attributes[ATTR_SERVER_ADDRESS], 'api.openai.com');
    assert.strictEqual(span.attributes[ATTR_SERVER_PORT], 443);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 50);
    assert.strictEqual(span.status.code, SpanStatusCode.OK);
  });

  it('should handle embedding errors and custom attributes', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });

    const embInv = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-small',
    });
    embInv.setAttribute('custom', 'val');
    embInv.fail(new Error('Embedding service error'));

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(spans[0].attributes[ATTR_ERROR_TYPE], 'Error');
    assert.strictEqual(spans[0].attributes['custom'], 'val');
  });
});
