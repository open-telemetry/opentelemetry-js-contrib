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
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_STATUS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_REQUEST_STREAM_CURSOR,
  GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE,
  GEN_AI_RESPONSE_STATUS_VALUE_COMPLETED,
} from '../../src/semconv';
import type { CompletionResult } from '../../src/types';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('FetchResponseInvocation', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  it('should create and populate fetch_response span with attributes and hooks', async () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const meter = ctx.meterProvider.getMeter('test-meter');
    let hookCalledWith: CompletionResult | undefined;

    const handler = new TelemetryHandler({
      tracer,
      meter,
      contentCaptureMode: 'span_only',
      completionHooks: [
        {
          onCompletion: result => {
            hookCalledWith = result;
          },
        },
      ],
    });

    const inv = handler.startFetchResponse({
      providerName: 'openai',
      responseId: 'batch_req_abc123',
      requestStream: false,
      serverAddress: 'api.openai.com',
      serverPort: 443,
    });

    inv.setResponseModel('gpt-4o');
    inv.setResponseStatus(GEN_AI_RESPONSE_STATUS_VALUE_COMPLETED);
    inv.setFinishReasons(['stop']);
    inv.setStreamCursor('cursor_xyz');
    inv.setTimeToFirstChunk(0.42);
    inv.setSystemInstructions([
      { type: 'text', content: 'You are a helpful assistant.' },
    ]);
    inv.addOutputMessages([
      {
        role: 'assistant',
        parts: [
          { type: 'text', content: 'Batch task completed successfully.' },
        ],
        finish_reason: 'stop',
      },
    ]);
    inv.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.name, 'fetch_response');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_PROVIDER_NAME], 'openai');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_ID],
      'batch_req_abc123'
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_STREAM], false);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_REQUEST_STREAM_CURSOR],
      'cursor_xyz'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK],
      0.42
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_RESPONSE_MODEL], 'gpt-4o');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_STATUS],
      'completed'
    );
    assert.deepStrictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
      ['stop']
    );
    assert.strictEqual(span.attributes[ATTR_SERVER_ADDRESS], 'api.openai.com');
    assert.strictEqual(span.attributes[ATTR_SERVER_PORT], 443);
    assert.ok(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
    assert.ok(span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]);
    assert.strictEqual(span.status.code, SpanStatusCode.OK);

    // Verify getters
    assert.strictEqual(inv.getResponseModel(), 'gpt-4o');
    assert.strictEqual(inv.getResponseStatus(), 'completed');
    assert.strictEqual(inv.getStreamCursor(), 'cursor_xyz');

    // Verify hook execution
    await new Promise(r => setTimeout(r, 10));
    assert.ok(hookCalledWith);
    assert.strictEqual(hookCalledWith.responseId, 'batch_req_abc123');
    assert.strictEqual(hookCalledWith.responseModel, 'gpt-4o');
    assert.strictEqual(hookCalledWith.responseStatus, 'completed');
  });

  it('should handle fetch_response failure and trigger completion hook with error', async () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    let hookCalledWith: CompletionResult | undefined;

    const handler = new TelemetryHandler({
      tracer,
      completionHooks: [
        {
          onCompletion: result => {
            hookCalledWith = result;
          },
        },
      ],
    });

    const inv = handler.startFetchResponse({
      providerName: 'anthropic',
      responseId: 'msgbatch_999',
    });

    inv.fail(new Error('Batch expired'));

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.status.message, 'Batch expired');
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');

    await new Promise(r => setTimeout(r, 10));
    assert.ok(hookCalledWith);
    assert.ok(hookCalledWith.error instanceof Error);
  });
});
