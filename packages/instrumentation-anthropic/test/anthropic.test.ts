/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import {
  getTestSpans,
  resetMemoryExporter,
  runTestFixture,
  TestCollector,
} from '@opentelemetry/contrib-test-utils';
import Anthropic from '@anthropic-ai/sdk';
import { context, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { expect } from 'expect';
import { type Definition, back as nockBack } from 'nock';
import * as nock from 'nock';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

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
      delete responseHeaders['anthropic-workspace-id'];
      delete responseHeaders['cf-ray'];
      delete responseHeaders.traceresponse;
      delete responseHeaders['request-id'];
      delete responseHeaders['x-request-id'];
    }
  }
  return scopes;
}

function createRecordingClient(): Anthropic {
  const apiKey =
    nockBack.currentMode === 'record' || nockBack.currentMode === 'update'
      ? process.env.ANTHROPIC_API_KEY
      : 'testing';
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is required when recording Anthropic fixtures'
    );
  }
  return new Anthropic({ apiKey, maxRetries: 0 });
}

const mockClient = new Anthropic({ apiKey: 'testing', maxRetries: 0 });

describe('Anthropic instrumentation', function () {
  this.timeout(30000);
  nockBack.fixtures = path.join(__dirname, 'mock-responses');
  // An explicitly requested mode wins, so `NOCK_BACK_MODE=update` can refresh
  // existing recordings. Otherwise: `record` to capture missing ones when an
  // API key is available, and `lockdown` in CI, since the default `dryrun`
  // calls `enableNetConnect()` and would let a stale fixture silently reach
  // the real API.
  const requestedMode = process.env.NOCK_BACK_MODE as
    | Parameters<typeof nockBack.setMode>[0]
    | undefined;
  nockBack.setMode(
    requestedMode ?? (process.env.ANTHROPIC_API_KEY ? 'record' : 'lockdown')
  );

  beforeEach(() => {
    resetMemoryExporter();
    instrumentation.enable();
  });

  afterEach(() => {
    instrumentation.disable();
    nock.cleanAll();
  });

  it('creates a span for messages.create', async () => {
    const { nockDone } = await nockBack('anthropic-messages-create.json', {
      afterRecord: sanitizeRecordings,
    });
    try {
      const response = await createRecordingClient().messages.create({
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
    expect(spans[0].attributes).toEqual({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'anthropic',
      'gen_ai.request.model': model,
    });
  });

  it('creates a span for messages.create with streaming', async () => {
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
      }
      expect(eventCount).toBeGreaterThan(0);
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe(`chat ${model}`);
    expect(spans[0].kind).toBe(SpanKind.CLIENT);
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
      const response = await stream.finalMessage();
      expect(response.id).toMatch(/^msg_/);
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe(`chat ${model}`);
    expect(spans[0].kind).toBe(SpanKind.CLIENT);
  });

  it('leaves the response body readable for asResponse', async () => {
    const body = {
      id: 'msg_01234567890',
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'text', text: 'Hello telemetry' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 3 },
    };
    nock('https://api.anthropic.com').post('/v1/messages').reply(200, body);

    const response = await mockClient.messages
      .create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: input }],
      })
      .asResponse();

    // The instrumentation must not have consumed the body already.
    expect(response.bodyUsed).toBe(false);
    expect(await response.json()).toEqual(body);

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe(`chat ${model}`);
    expect(spans[0].status.code).not.toBe(SpanStatusCode.ERROR);
  });

  it('records errors raised while reading the response body', async () => {
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, '{"id": "msg_01234', {
        'content-type': 'application/json',
      });

    await expect(
      mockClient.messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: input }],
      })
    ).rejects.toThrow();

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].attributes['error.type']).toBeDefined();
  });

  it('keeps the span open until the response body has been read', async () => {
    const bodyDelayMs = 200;
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .delayBody(bodyDelayMs)
      .reply(200, {
        id: 'msg_01234567890',
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text: 'Hello telemetry' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 3 },
      });

    await mockClient.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: input }],
    });

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    const [seconds, nanos] = spans[0].duration;
    const durationMs = seconds * 1000 + nanos / 1e6;
    // The span must cover the body read, not just time-to-headers.
    expect(durationMs).toBeGreaterThanOrEqual(bodyDelayMs * 0.8);
  });

  it('records body errors when the caller consumes the promise late', async () => {
    nock('https://api.anthropic.com')
      .post('/v1/messages')
      .reply(200, '{"id": "msg_01234', {
        'content-type': 'application/json',
      });

    const pending = mockClient.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: input }],
    });
    // The response (and its headers) arrive before the caller subscribes.
    await new Promise(resolve => setTimeout(resolve, 150));
    await expect(pending).rejects.toThrow();

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].attributes['error.type']).toBeDefined();
  });

  it('ends the span when a stream is abandoned without iterating', async () => {
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
      stream.controller.abort();
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].attributes['error.type']).toBe('APIUserAbortError');
  });

  it('records an aborted stream as an error', async () => {
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
        if (event) stream.controller.abort();
      }
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].attributes['error.type']).toBe('APIUserAbortError');
  });

  it('defers to the SDK when called without params', () => {
    // The SDK raises its own error; the patch must not fail ahead of it or
    // leave a span behind.
    let error: Error | undefined;
    try {
      (mockClient.messages.create as unknown as () => Promise<unknown>)();
    } catch (err) {
      error = err as Error;
    }
    expect(error).toBeDefined();
    expect(error?.stack).toContain('@anthropic-ai/sdk');
    expect(getTestSpans()).toHaveLength(0);
  });

  const providerCases = [
    {
      title: 'Bedrock',
      baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com',
      expected: 'aws.bedrock',
    },
    {
      title: 'regional Vertex',
      baseURL: 'https://us-east5-aiplatform.googleapis.com/v1',
      expected: 'gcp.vertex_ai',
    },
    {
      title: 'global Vertex',
      baseURL: 'https://aiplatform.googleapis.com/v1',
      expected: 'gcp.vertex_ai',
    },
  ];

  providerCases.forEach(({ title, baseURL, expected }) => {
    it(`derives gen_ai.provider.name for ${title} endpoints`, async () => {
      nock(new URL(baseURL).origin)
        .post(/.*/)
        .reply(200, {
          id: 'msg_01234567890',
          type: 'message',
          role: 'assistant',
          model,
          content: [{ type: 'text', text: 'Hello telemetry' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 3 },
        });

      const client = new Anthropic({
        apiKey: 'testing',
        maxRetries: 0,
        baseURL,
      });
      await client.messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: input }],
      });

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].attributes['gen_ai.provider.name']).toBe(expected);
    });
  });

  it('instruments clients built from the SDK subpath export', () => {
    // Bedrock and Vertex clients import SDK subpaths rather than the package
    // root, so the patch must not depend on the root being loaded. This runs
    // in a child process because this file has already imported the root.
    const output = execFileSync(
      process.execPath,
      [path.join(__dirname, 'fixtures', 'subpath-import.js')],
      { encoding: 'utf8' }
    );
    expect(JSON.parse(output)).toEqual({ wrapped: true });
  });

  it('instruments the SDK when imported as native ESM', async () => {
    // Native ESM resolves the SDK's `.mjs` build, which a `.js`-only hook does
    // not match.
    await runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/use-anthropic.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        NODE_NO_WARNINGS: '1',
      },
      checkResult: err => {
        expect(err).toBeFalsy();
      },
      checkCollector: (collector: TestCollector) => {
        const spans = collector.sortedSpans;
        expect(spans).toHaveLength(1);
        expect(spans[0].name).toBe(`chat ${model}`);
        expect(
          spans[0].attributes.find(a => a.key === 'gen_ai.provider.name')?.value
            .stringValue
        ).toBe('anthropic');
      },
    });
  });

  it('ends the span when a streaming response is read via asResponse', async () => {
    const { nockDone } = await nockBack(
      'anthropic-messages-create-streaming.json',
      { afterRecord: sanitizeRecordings }
    );
    try {
      const response = await createRecordingClient()
        .messages.create({
          model,
          max_tokens: 16,
          messages: [{ role: 'user', content: input }],
          stream: true,
        })
        .asResponse();

      // The caller consumes the raw response, so the stream iterator that
      // normally ends the span never runs.
      expect(response.bodyUsed).toBe(false);
      expect(await response.text()).toContain('event:');
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe(`chat ${model}`);
    expect(spans[0].status.code).not.toBe(SpanStatusCode.ERROR);
  });

  it('leaves the SDK untouched when tracing is suppressed', async () => {
    const { nockDone } = await nockBack('anthropic-messages-create.json', {
      afterRecord: sanitizeRecordings,
    });
    try {
      const client = createRecordingClient();
      const pending = context.with(suppressTracing(context.active()), () =>
        client.messages.create({
          model,
          max_tokens: 16,
          messages: [{ role: 'user', content: input }],
        })
      );

      // The promise must be handed back exactly as the SDK built it, with no
      // observers installed on its consumption methods.
      const wrapped = pending as unknown as Record<
        string,
        { __wrapped?: true }
      >;
      expect(wrapped.parse.__wrapped).toBeUndefined();
      expect(wrapped.asResponse.__wrapped).toBeUndefined();

      const response = await pending;
      expect(response.id).toMatch(/^msg_/);
    } finally {
      nockDone();
    }

    expect(getTestSpans()).toHaveLength(0);
  });

  it('records an SSE error rather than the abort the SDK raises for it', async () => {
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_01234567890","type":"message","role":"assistant","model":"' +
        model +
        '","content":[],"stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}',
      '',
      'event: error',
      'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      '',
      '',
    ].join('\n');
    nock('https://api.anthropic.com').post('/v1/messages').reply(200, sse, {
      'content-type': 'text/event-stream',
    });

    const stream = await mockClient.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: input }],
      stream: true,
    });

    let caught: Error | undefined;
    try {
      for await (const event of stream) {
        void event;
      }
    } catch (err) {
      caught = err as Error;
    }

    // The SDK aborts its own controller before rejecting, which must not be
    // mistaken for a user abort.
    expect(caught).toBeDefined();
    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].attributes['error.type']).not.toBe('APIUserAbortError');
    expect(spans[0].events.map(event => event.name)).toContain('exception');
  });

  it('ends the span when a suspended iterator is cancelled', async () => {
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

      // Read one event and abandon the iterator while it is parked at `yield`,
      // without resuming it or letting `for await` close it.
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();
      stream.controller.abort();
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].attributes['error.type']).toBe('APIUserAbortError');
  });

  it('does not mark an early break as an error', async () => {
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
        void event;
        break;
      }
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).not.toBe(SpanStatusCode.ERROR);
    expect(spans[0].attributes['error.type']).toBeUndefined();
  });

  it('ends the span when an abort delivers a buffered event', async () => {
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

      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();

      // Abort while `next()` is outstanding: it can still resolve with an
      // already-buffered event rather than completing the stream.
      const pending = iterator.next();
      stream.controller.abort();
      const delivered = await pending;
      expect(delivered.done).toBe(false);

      // The caller stops reading here, so nothing else will close the stream.
    } finally {
      nockDone();
    }

    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].attributes['error.type']).toBe('APIUserAbortError');
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
