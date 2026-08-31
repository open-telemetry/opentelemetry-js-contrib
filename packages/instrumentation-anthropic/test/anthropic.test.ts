/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import Anthropic from '@anthropic-ai/sdk';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { expect } from 'expect';
import { type Definition, back as nockBack } from 'nock';
import * as nock from 'nock';
import * as path from 'node:path';
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

  beforeEach(() => {
    resetMemoryExporter();
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
    });
    expectResponseAttributes(spans[0], response);
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

  it('creates a span for messages.stream', async () => {
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
  });
});
