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
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
} from '../../src';
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
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const meter = ctx.meterProvider.getMeter('test-meter');
    const handler = new TelemetryHandler({
      tracer,
      meter,
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
      cacheCreationTokens: 8,
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
      span.attributes[ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS],
      8
    );
    assert.ok(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES]);
    assert.ok(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
    assert.strictEqual(span.status.code, SpanStatusCode.OK);
  });

  it('should handle failure properly', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });

    const invocation = handler.startInference({
      providerName: 'anthropic',
      requestModel: 'claude-3-5-sonnet',
    });

    const testError = new Error('Rate limit exceeded');
    invocation.fail(testError);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.status.message, 'Rate limit exceeded');
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');
    assert.strictEqual(span.events.length, 1);
    assert.strictEqual(span.events[0].name, 'exception');
  });

  it('should respect content capture mode when disabled vs enabled', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handlerNone = new TelemetryHandler({
      tracer,
      contentCaptureMode: 'none',
    });

    const invNone = handlerNone.startInference({
      providerName: 'openai',
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
      tracer,
      contentCaptureMode: 'span_only',
    });

    const invSpan = handlerSpan.startInference({
      providerName: 'openai',
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
    assert.strictEqual(spansSpan[0].events.length, 0);

    ctx.reset();

    const handlerEvent = new TelemetryHandler({
      tracer,
      contentCaptureMode: 'event_only',
    });

    const invEvent = handlerEvent.startInference({
      providerName: 'openai',
      systemInstructions: 'You are a helpful assistant',
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is the weather?' }],
        },
      ],
    });

    invEvent.addOutputMessages([
      {
        role: 'assistant',
        parts: [{ type: 'text', content: 'It is sunny.' }],
        finish_reason: 'stop',
      },
    ]);
    invEvent.stop();

    const spansEvent = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spansEvent.length, 1);
    assert.strictEqual(
      spansEvent[0].attributes[ATTR_GEN_AI_INPUT_MESSAGES],
      undefined
    );
    assert.strictEqual(
      spansEvent[0].attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
      undefined
    );
    assert.strictEqual(
      spansEvent[0].attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS],
      undefined
    );
    assert.strictEqual(spansEvent[0].events.length, 1);
    assert.strictEqual(
      spansEvent[0].events[0].name,
      EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS
    );
    assert.ok(spansEvent[0].events[0].attributes?.[ATTR_GEN_AI_INPUT_MESSAGES]);
    assert.ok(
      spansEvent[0].events[0].attributes?.[ATTR_GEN_AI_OUTPUT_MESSAGES]
    );
    assert.strictEqual(
      spansEvent[0].events[0].attributes?.[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS],
      'You are a helpful assistant'
    );

    ctx.reset();

    const handlerAll = new TelemetryHandler({
      tracer,
      contentCaptureMode: 'span_and_event',
    });

    const invAll = handlerAll.startInference({
      providerName: 'openai',
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Hello' }],
        },
      ],
    });
    invAll.stop();

    const spansAll = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spansAll.length, 1);
    assert.ok(spansAll[0].attributes[ATTR_GEN_AI_INPUT_MESSAGES]);
    assert.strictEqual(spansAll[0].events.length, 1);
    assert.strictEqual(
      spansAll[0].events[0].name,
      EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS
    );
  });

  it('should handle comprehensive request options and system instructions', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({
      tracer,
      contentCaptureMode: 'span_and_event',
    });

    const inv = handler.startInference({
      providerName: 'anthropic',
      operationName: 'chat',
      requestModel: 'claude-3-5-sonnet',
      conversationId: 'conv-123',
      serverAddress: 'api.anthropic.com',
      serverPort: 443,
      systemInstructions: 'Be concise.',
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
        encodingFormats: ['text'],
      },
    });

    inv.setAttribute('custom.key', 'custom.val');
    inv.setAttributes({ 'another.key': 'val2' });
    inv.recordStreamChunk('chunk');
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
});
