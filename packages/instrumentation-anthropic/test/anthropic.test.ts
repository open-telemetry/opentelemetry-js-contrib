/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  instrumentation,
  meterProvider,
  metricExporter,
} from './load-instrumentation';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import Anthropic from '@anthropic-ai/sdk';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { expect } from 'expect';
import { type Definition, back as nockBack } from 'nock';
import * as nock from 'nock';
import * as path from 'node:path';
import { AnthropicInstrumentation } from '../src';
import {
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
} from '../src/semconv';

const model = 'claude-haiku-4-5-20251001';
const input = 'Reply with exactly two words: Hello telemetry';

function sanitizeRecordings(scopes: Definition[]): Definition[] {
  for (const scope of scopes) {
    const requestHeaders = scope.reqheaders as
      | Record<string, string>
      | undefined;
    if (requestHeaders) {
      delete requestHeaders['x-api-key'];
      delete requestHeaders.authorization;
    }

    // Nock's type definition does not include the recorded raw headers.
    const responseHeaders: Record<string, string> = (scope as any).rawHeaders;
    if (responseHeaders) {
      delete responseHeaders['set-cookie'];
      delete responseHeaders['anthropic-organization-id'];
      delete responseHeaders['request-id'];
      delete responseHeaders['x-request-id'];
    }
  }
  return scopes;
}

function createRecordingClient(): Anthropic {
  const apiKey =
    nockBack.currentMode === 'dryrun'
      ? 'testing'
      : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is required when recording Anthropic fixtures'
    );
  }
  return new Anthropic({ apiKey, maxRetries: 0 });
}

function expectedInputTokens(usage: Anthropic.Messages.Usage): number {
  return (
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}

function mockMessage(id: string): void {
  nock('https://api.anthropic.com')
    .post('/v1/messages')
    .reply(200, {
      id,
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'text', text: 'Hello telemetry' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 12,
        output_tokens: 4,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    });
}

function expectResponseAttributes(
  span: ReturnType<typeof getTestSpans>[number],
  response: Anthropic.Messages.Message
): void {
  expect(span.attributes).toMatchObject({
    [ATTR_GEN_AI_RESPONSE_ID]: response.id,
    [ATTR_GEN_AI_RESPONSE_MODEL]: response.model,
    [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
    [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: expectedInputTokens(response.usage),
    [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: response.usage.output_tokens,
    [ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]:
      response.usage.cache_creation_input_tokens,
    [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]:
      response.usage.cache_read_input_tokens,
  });
}

const mockClient = new Anthropic({ apiKey: 'testing', maxRetries: 0 });

describe('Anthropic instrumentation', function () {
  this.timeout(30000);
  nockBack.fixtures = path.join(__dirname, 'mock-responses');

  beforeEach(async () => {
    resetMemoryExporter();
    await meterProvider.forceFlush();
    metricExporter.reset();
    instrumentation.setConfig({ captureMessageContent: false });
    instrumentation.enable();
  });

  afterEach(() => {
    instrumentation.disable();
    nock.cleanAll();
  });

  it('creates a span for messages.create', async () => {
    let response: Anthropic.Messages.Message;
    const { nockDone } = await nockBack('anthropic-messages-create.json', {
      afterRecord: sanitizeRecordings,
    });
    try {
      response = await createRecordingClient().messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: input }],
      });
      expect(response.id).toMatch(/^msg_/);
      expect(response.content.length).toBeGreaterThan(0);
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe(`chat ${model}`);
    expect(spans[0].kind).toBe(SpanKind.CLIENT);
    expect(spans[0].attributes).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'anthropic',
      'gen_ai.request.model': model,
      'server.address': 'api.anthropic.com',
    });
    expectResponseAttributes(spans[0], response);
    expect(spans[0].attributes['gen_ai.input.messages']).toBeUndefined();
    expect(spans[0].attributes['gen_ai.output.messages']).toBeUndefined();

    await meterProvider.forceFlush();
    const metrics = metricExporter.getMetrics()[0].scopeMetrics[0].metrics;
    const duration = metrics.find(
      metric => metric.descriptor.name === 'gen_ai.client.operation.duration'
    );
    expect(duration?.dataPoints).toEqual([
      expect.objectContaining({
        value: expect.objectContaining({ sum: expect.any(Number) }),
        attributes: {
          'gen_ai.operation.name': 'chat',
          'gen_ai.provider.name': 'anthropic',
          'gen_ai.request.model': model,
          'gen_ai.response.model': response.model,
          'server.address': 'api.anthropic.com',
        },
      }),
    ]);
    const tokenUsage = metrics.find(
      metric => metric.descriptor.name === 'gen_ai.client.token.usage'
    );
    expect(tokenUsage?.dataPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expectedInputTokens(response.usage),
          }),
          attributes: expect.objectContaining({
            'gen_ai.token.type': 'input',
            'gen_ai.response.model': response.model,
          }),
        }),
        expect.objectContaining({
          value: expect.objectContaining({
            sum: response.usage.output_tokens,
          }),
          attributes: expect.objectContaining({
            'gen_ai.token.type': 'output',
            'gen_ai.response.model': response.model,
          }),
        }),
      ])
    );
  });

  it('preserves APIPromise.asResponse without consuming the body', async () => {
    mockMessage('msg_raw_response');

    const apiPromise = mockClient.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: input }],
    });
    const response = await apiPromise.asResponse();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'msg_raw_response' });
    expect(getTestSpans()).toHaveLength(1);
  });

  it('preserves APIPromise.withResponse telemetry', async () => {
    mockMessage('msg_with_response');

    const { data, response } = await mockClient.messages
      .create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: input }],
      })
      .withResponse();

    expect(response.status).toBe(200);
    expect(data.id).toBe('msg_with_response');
    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].attributes[ATTR_GEN_AI_RESPONSE_ID]).toBe(data.id);
  });

  it('instruments messages.parse when the SDK provides it', async function () {
    const messages = mockClient.messages as typeof mockClient.messages & {
      parse?: (
        params: Anthropic.Messages.MessageCreateParamsNonStreaming
      ) => Promise<Anthropic.Messages.Message>;
    };
    if (!messages.parse) this.skip();
    mockMessage('msg_parsed');

    const response = await messages.parse({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: input }],
    });

    expect(response.id).toBe('msg_parsed');
    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].attributes[ATTR_GEN_AI_RESPONSE_ID]).toBe(
      response.id
    );
  });

  it('does not create spans when tracing is suppressed', async () => {
    mockMessage('msg_suppressed');

    await context.with(suppressTracing(context.active()), () =>
      mockClient.messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: input }],
      })
    );

    expect(getTestSpans()).toHaveLength(0);
  });

  it('uses the active span as parent', async () => {
    mockMessage('msg_child');
    const tracer = trace.getTracer('anthropic-parent-test');
    let parentSpanId: string | undefined;

    await tracer.startActiveSpan('parent', async parent => {
      parentSpanId = parent.spanContext().spanId;
      await mockClient.messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: input }],
      });
      parent.end();
    });

    const child = getTestSpans().find(span => span.name === `chat ${model}`);
    expect(child?.parentSpanContext?.spanId).toBe(parentSpanId);
  });

  it('captures messages, system instructions, tool calls, and thinking when enabled', async () => {
    instrumentation.disable();
    instrumentation.setConfig({ captureMessageContent: true });
    instrumentation.enable();
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, {
        id: 'msg_content_capture',
        type: 'message',
        role: 'assistant',
        model,
        content: [
          { type: 'thinking', thinking: 'Check the tool.', signature: 'sig' },
          { type: 'text', text: 'Calling weather.' },
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'get_weather',
            input: { city: 'Paris' },
          },
        ],
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 12,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      });

    await mockClient.messages.create({
      model,
      max_tokens: 64,
      system: 'You are a weather assistant.',
      messages: [
        { role: 'user', content: 'What is the weather in Paris?' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_previous',
              name: 'get_weather',
              input: { city: 'London' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_previous',
              content: 'Rainy',
            },
          ],
        },
      ],
    });

    const attributes = getTestSpans()[0].attributes;
    expect(
      JSON.parse(String(attributes['gen_ai.system_instructions']))
    ).toEqual([{ type: 'text', content: 'You are a weather assistant.' }]);
    expect(JSON.parse(String(attributes['gen_ai.input.messages']))).toEqual([
      {
        role: 'user',
        parts: [{ type: 'text', content: 'What is the weather in Paris?' }],
      },
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool_call',
            id: 'toolu_previous',
            name: 'get_weather',
            arguments: { city: 'London' },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            type: 'tool_call_response',
            id: 'toolu_previous',
            response: 'Rainy',
          },
        ],
      },
    ]);
    expect(JSON.parse(String(attributes['gen_ai.output.messages']))).toEqual([
      {
        role: 'assistant',
        finish_reason: 'tool_calls',
        parts: [
          { type: 'reasoning', content: 'Check the tool.' },
          { type: 'text', content: 'Calling weather.' },
          {
            type: 'tool_call',
            id: 'toolu_123',
            name: 'get_weather',
            arguments: { city: 'Paris' },
          },
        ],
      },
    ]);
  });

  it('honors the content capture environment variable', () => {
    const original =
      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
    process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'true';
    try {
      expect(
        new AnthropicInstrumentation().getConfig().captureMessageContent
      ).toBe(true);
    } finally {
      if (original === undefined) {
        delete process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
      } else {
        process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT =
          original;
      }
    }
  });

  it('records request parameters and custom server attributes', async () => {
    const baseURL = 'https://anthropic.example:8443';
    nock(baseURL)
      .post('/v1/messages')
      .reply(200, {
        id: 'msg_request_attributes',
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text: 'Hello telemetry' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 12,
          output_tokens: 4,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      });

    const client = new Anthropic({
      apiKey: 'testing',
      baseURL,
      maxRetries: 0,
    });
    await client.messages.create({
      model,
      max_tokens: 128,
      messages: [{ role: 'user', content: 'Hi' }],
      temperature: 0.2,
      top_k: 20,
      top_p: 0.8,
      stop_sequences: ['DONE'],
    });

    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].attributes).toMatchObject({
      'gen_ai.request.max_tokens': 128,
      'gen_ai.request.temperature': 0.2,
      'gen_ai.request.top_k': 20,
      'gen_ai.request.top_p': 0.8,
      'gen_ai.request.stop_sequences': ['DONE'],
      'server.address': 'anthropic.example',
      'server.port': 8443,
    });
  });

  it('creates a span for messages.create with streaming', async () => {
    let startMessage: Anthropic.Messages.Message | undefined;
    let delta: Anthropic.Messages.RawMessageDeltaEvent | undefined;
    const { nockDone } = await nockBack(
      'anthropic-messages-create-streaming.json',
      { afterRecord: sanitizeRecordings }
    );
    try {
      const stream = await createRecordingClient().messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: input }],
        stream: true,
      });

      expect(getTestSpans()).toHaveLength(0);
      let eventCount = 0;
      for await (const event of stream) {
        if (event) eventCount++;
        if (event.type === 'message_start') startMessage = event.message;
        if (event.type === 'message_delta') delta = event;
      }
      expect(eventCount).toBeGreaterThan(0);
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe(`chat ${model}`);
    expect(spans[0].kind).toBe(SpanKind.CLIENT);
    expect(startMessage).toBeDefined();
    expect(delta).toBeDefined();
    expect(spans[0].attributes).toMatchObject({
      [ATTR_GEN_AI_RESPONSE_ID]: startMessage?.id,
      [ATTR_GEN_AI_RESPONSE_MODEL]: startMessage?.model,
      [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: startMessage
        ? expectedInputTokens(startMessage.usage)
        : undefined,
      [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: delta?.usage.output_tokens,
    });
  });

  it('ends the streaming span when using tee', async () => {
    const { nockDone } = await nockBack(
      'anthropic-messages-create-streaming.json',
      { afterRecord: sanitizeRecordings }
    );
    try {
      const stream = await createRecordingClient().messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: input }],
        stream: true,
      });

      const [left, right] = stream.tee();
      const leftEvents = [];
      for await (const event of left) {
        leftEvents.push(event);
      }
      const rightEvents = [];
      for await (const event of right) {
        rightEvents.push(event);
      }

      expect(leftEvents.length).toBeGreaterThan(0);
      expect(rightEvents).toEqual(leftEvents);
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe(`chat ${model}`);
    expect(spans[0].kind).toBe(SpanKind.CLIENT);
  });

  it('ends the streaming span when iteration closes early', async () => {
    const { nockDone } = await nockBack(
      'anthropic-messages-create-streaming.json',
      { afterRecord: sanitizeRecordings }
    );
    try {
      const stream = await createRecordingClient().messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: input }],
        stream: true,
      });

      for await (const event of stream) {
        expect(event.type).toBe('message_start');
        break;
      }
    } finally {
      nockDone();
    }

    expect(getTestSpans()).toHaveLength(1);
  });

  it('records errors raised while consuming a stream', async () => {
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(
        200,
        'event: error\ndata: {"type":"error","error":{"type":"api_error","message":"stream failed"}}\n\n',
        { 'content-type': 'text/event-stream' }
      );

    const stream = await mockClient.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: input }],
      stream: true,
    });
    await expect(
      (async () => {
        for await (const event of stream) {
          void event;
        }
      })()
    ).rejects.toThrow('stream failed');

    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(getTestSpans()[0].attributes['error.type']).toBe('APIError');
  });

  it('creates a span for messages.stream', async () => {
    instrumentation.disable();
    instrumentation.setConfig({ captureMessageContent: true });
    instrumentation.enable();
    let response: Anthropic.Messages.Message;
    const { nockDone } = await nockBack('anthropic-messages-stream.json', {
      afterRecord: sanitizeRecordings,
    });
    try {
      const stream = createRecordingClient().messages.stream({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: input }],
      });

      expect(getTestSpans()).toHaveLength(0);
      response = await stream.finalMessage();
      expect(response.id).toMatch(/^msg_/);
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe(`chat ${model}`);
    expect(spans[0].kind).toBe(SpanKind.CLIENT);
    expectResponseAttributes(spans[0], response);
    expect(
      JSON.parse(String(spans[0].attributes['gen_ai.input.messages']))
    ).toEqual([
      {
        role: 'user',
        parts: [{ type: 'text', content: input }],
      },
    ]);
    expect(
      JSON.parse(String(spans[0].attributes['gen_ai.output.messages']))
    ).toEqual([
      {
        role: 'assistant',
        finish_reason: 'stop',
        parts: response.content.map(block => ({
          type: 'text',
          content: block.type === 'text' ? block.text : undefined,
        })),
      },
    ]);
  });

  it('records messages.create errors', async () => {
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(429, {
        type: 'error',
        error: { type: 'rate_limit_error', message: 'slow down' },
      });

    await expect(
      mockClient.messages.create({
        model,
        max_tokens: 64,
        messages: [{ role: 'user', content: 'Hi' }],
      })
    ).rejects.toThrow('slow down');

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].attributes['error.type']).toBe('RateLimitError');

    await meterProvider.forceFlush();
    const metrics = metricExporter.getMetrics()[0].scopeMetrics[0].metrics;
    const duration = metrics.find(
      metric => metric.descriptor.name === 'gen_ai.client.operation.duration'
    );
    expect(duration?.dataPoints[0].attributes).toMatchObject({
      'error.type': 'RateLimitError',
      'gen_ai.provider.name': 'anthropic',
    });
    expect(
      metrics.find(
        metric => metric.descriptor.name === 'gen_ai.client.token.usage'
      )
    ).toBeUndefined();
  });
});
