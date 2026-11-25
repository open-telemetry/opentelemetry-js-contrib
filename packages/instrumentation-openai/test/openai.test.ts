/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * These tests verify telemetry created against actual API responses
 * which can be difficult to mock for LLMs. The responses are recorded
 * automatically using nock's nock-back feature. Responses are recorded
 * to the mock-responses directory with the name of the test - by default
 * if a response is available for the current test it is used, and
 * otherwise a real request is made and the response is recorded.
 * To re-record all responses, set the NOCK_BACK_MODE environment variable
 * to 'update' - when recording responses, OPENAI_API_KEY must be set to
 * a valid API key. To record for new tests while
 * keeping existing recordings, set NOCK_BACK_MODE to 'record'.
 */

import {
  contentCaptureInstrumentation,
  instrumentation,
  meterProvider,
  metricExporter,
} from './load-instrumentation';
import {
  context,
  trace,
  SpanStatusCode,
  type Attributes,
} from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { expect } from 'expect';
import * as nock from 'nock';
import { type Definition, back as nockBack } from 'nock';
import { OpenAI } from 'openai';
import * as path from 'node:path';

// Remove any data from recorded responses that could have sensitive data
// and that we don't need for testing.
const sanitizeRecordings = (scopes: Definition[]) => {
  for (const scope of scopes) {
    // Type definition seems to be incorrect of headers.
    const headers: Record<string, string> = (scope as any).rawHeaders;
    delete headers['set-cookie'];
    delete headers['openai-organization'];
    delete headers['openai-project'];
  }
  return scopes;
};

function assertSpanScope(span: ReadableSpan, expectedName: string): void {
  expect(span.name).toBe(expectedName);
  expect(span.instrumentationScope.schemaUrl).toBe(
    'https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev'
  );
}

interface AssertInferenceMetricsOptions {
  requestModel: string;
  responseModel?: string;
  serverAddress?: string;
  serverPort?: number;
  inputTokens?: number;
  outputTokens?: number;
  errorType?: string;
  isStreaming?: boolean;
}

async function assertInferenceMetrics(
  options: AssertInferenceMetricsOptions
): Promise<void> {
  await meterProvider.forceFlush();
  const [resourceMetrics] = metricExporter.getMetrics();
  expect(resourceMetrics.scopeMetrics.length).toBe(1);
  const scopeMetrics = resourceMetrics.scopeMetrics[0];
  expect(scopeMetrics.scope.schemaUrl).toBe(
    'https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev'
  );

  const legacyTokenUsage = scopeMetrics.metrics.filter(
    m => m.descriptor.name === 'gen_ai.client.token.usage'
  );
  expect(legacyTokenUsage).toHaveLength(0);

  const baseAttrs: Attributes = {
    'gen_ai.provider.name': 'openai',
    'gen_ai.operation.name': 'chat',
    'gen_ai.request.model': options.requestModel,
    [ATTR_SERVER_ADDRESS]: options.serverAddress ?? 'api.openai.com',
    [ATTR_SERVER_PORT]: options.serverPort ?? 443,
  };
  if (options.responseModel) {
    baseAttrs['gen_ai.response.model'] = options.responseModel;
  }

  const durationAttrs: Attributes = { ...baseAttrs };
  if (options.errorType) {
    durationAttrs[ATTR_ERROR_TYPE] = options.errorType;
  }

  const operationDuration = scopeMetrics.metrics.filter(
    m => m.descriptor.name === 'gen_ai.client.operation.duration'
  );
  expect(operationDuration.length).toBe(1);
  expect(operationDuration[0].descriptor).toMatchObject({
    name: 'gen_ai.client.operation.duration',
    type: 'HISTOGRAM',
    description: 'Duration of GenAI client operation',
    unit: 's',
  });
  expect(operationDuration[0].dataPoints).toEqual([
    expect.objectContaining({
      value: expect.objectContaining({
        sum: expect.any(Number),
      }),
      attributes: durationAttrs,
    }),
  ]);
  expect(
    (operationDuration[0].dataPoints[0].value as { sum: number }).sum
  ).toBeGreaterThan(0);

  const opInputTokens = scopeMetrics.metrics.filter(
    m => m.descriptor.name === 'gen_ai.client.inference.operation.input_tokens'
  );
  expect(opInputTokens.length).toBe(1);
  expect(opInputTokens[0].descriptor).toMatchObject({
    name: 'gen_ai.client.inference.operation.input_tokens',
    type: 'HISTOGRAM',
    unit: '{token}',
  });
  expect(opInputTokens[0].dataPoints).toEqual([
    expect.objectContaining({
      value: expect.objectContaining({
        sum: options.inputTokens ?? 0,
      }),
      attributes: baseAttrs,
    }),
  ]);

  const opOutputTokens = scopeMetrics.metrics.filter(
    m => m.descriptor.name === 'gen_ai.client.inference.operation.output_tokens'
  );
  expect(opOutputTokens.length).toBe(1);
  expect(opOutputTokens[0].descriptor).toMatchObject({
    name: 'gen_ai.client.inference.operation.output_tokens',
    type: 'HISTOGRAM',
    unit: '{token}',
  });
  expect(opOutputTokens[0].dataPoints).toEqual([
    expect.objectContaining({
      value: expect.objectContaining({
        sum: options.outputTokens ?? 0,
      }),
      attributes: baseAttrs,
    }),
  ]);

  const modalityUnknownAttrs: Attributes = {
    ...baseAttrs,
    'gen_ai.token.modality': 'unknown',
  };

  for (const [metricName, expectedVal] of [
    ['gen_ai.client.inference.usage.input_tokens', options.inputTokens ?? 0],
    ['gen_ai.client.inference.usage.output_tokens', options.outputTokens ?? 0],
    ['gen_ai.client.inference.usage.cache_read.input_tokens', 0],
    ['gen_ai.client.inference.usage.cache_write.input_tokens', 0],
    ['gen_ai.client.inference.usage.reasoning.output_tokens', 0],
  ] as const) {
    const counter = scopeMetrics.metrics.filter(
      m => m.descriptor.name === metricName
    );
    expect(counter.length).toBe(1);
    expect(counter[0].descriptor).toMatchObject({
      name: metricName,
      unit: '{token}',
    });
    expect(counter[0].dataPoints).toEqual([
      expect.objectContaining({
        value: expectedVal,
        attributes: modalityUnknownAttrs,
      }),
    ]);
  }

  if (options.isStreaming && !options.errorType) {
    const ttfc = scopeMetrics.metrics.filter(
      m => m.descriptor.name === 'gen_ai.client.operation.time_to_first_chunk'
    );
    expect(ttfc.length).toBe(1);
    expect(ttfc[0].descriptor).toMatchObject({
      name: 'gen_ai.client.operation.time_to_first_chunk',
      type: 'HISTOGRAM',
      unit: 's',
    });
    expect(ttfc[0].dataPoints).toEqual([
      expect.objectContaining({
        value: expect.objectContaining({
          count: 1,
          sum: expect.any(Number),
        }),
        attributes: baseAttrs,
      }),
    ]);

    const tpoc = scopeMetrics.metrics.filter(
      m => m.descriptor.name === 'gen_ai.client.operation.time_per_output_chunk'
    );
    expect(tpoc.length).toBe(1);
    expect(tpoc[0].descriptor).toMatchObject({
      name: 'gen_ai.client.operation.time_per_output_chunk',
      type: 'HISTOGRAM',
      unit: 's',
    });
    expect(tpoc[0].dataPoints.length).toBe(1);
  }
}

async function assertEmbeddingMetrics(options: {
  requestModel: string;
  responseModel?: string;
  serverAddress?: string;
  serverPort?: number;
  errorType?: string;
}): Promise<void> {
  await meterProvider.forceFlush();
  const [resourceMetrics] = metricExporter.getMetrics();
  expect(resourceMetrics.scopeMetrics.length).toBe(1);
  const scopeMetrics = resourceMetrics.scopeMetrics[0];
  expect(scopeMetrics.scope.schemaUrl).toBe(
    'https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev'
  );
  expect(scopeMetrics.metrics.length).toBe(1);

  const attrs: Attributes = {
    'gen_ai.provider.name': 'openai',
    'gen_ai.operation.name': 'embeddings',
    'gen_ai.request.model': options.requestModel,
    [ATTR_SERVER_ADDRESS]: options.serverAddress ?? 'api.openai.com',
    [ATTR_SERVER_PORT]: options.serverPort ?? 443,
  };
  if (options.responseModel) {
    attrs['gen_ai.response.model'] = options.responseModel;
  }
  if (options.errorType) {
    attrs[ATTR_ERROR_TYPE] = options.errorType;
  }

  const operationDuration = scopeMetrics.metrics[0];
  expect(operationDuration.descriptor).toMatchObject({
    name: 'gen_ai.client.operation.duration',
    type: 'HISTOGRAM',
    description: 'Duration of GenAI client operation',
    unit: 's',
  });
  expect(operationDuration.dataPoints).toEqual([
    expect.objectContaining({
      value: expect.objectContaining({
        sum: expect.any(Number),
      }),
      attributes: attrs,
    }),
  ]);
  expect(
    (operationDuration.dataPoints[0].value as { sum: number }).sum
  ).toBeGreaterThan(0);
}

describe('OpenAI capture and context', function () {
  const endpoint = 'https://example.test';
  const client = new OpenAI({
    apiKey: 'test',
    baseURL: endpoint,
    maxRetries: 0,
  });
  const envName = 'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT';
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env[envName];
    delete process.env[envName];
    instrumentation.enable();
  });

  afterEach(async () => {
    instrumentation.disable();
    instrumentation.setConfig({});
    if (previous === undefined) delete process.env[envName];
    else process.env[envName] = previous;
    nock.cleanAll();
    resetMemoryExporter();
    await meterProvider.forceFlush();
    metricExporter.reset();
  });

  function chat() {
    nock(endpoint)
      .post('/chat/completions')
      .reply(200, {
        model: 'test',
        choices: [
          {
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
          },
        ],
      });
    return client.chat.completions.create({
      model: 'test',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.test/picture?sig=private' },
            },
          ],
        },
      ],
    });
  }

  it('honors environment precedence without enabling capture for legacy booleans', async () => {
    process.env[envName] = 'true';
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    await chat();
    expect(
      getTestSpans()[0].attributes['gen_ai.input.messages']
    ).toBeUndefined();

    process.env[envName] = 'span_only';
    instrumentation.setConfig({ captureMessageContent: 'none' });
    await chat();
    const attrs = getTestSpans()[1].attributes;
    expect(attrs['gen_ai.provider.name']).toBe('openai');
    expect(attrs['server.address']).toBe('example.test');
    expect(JSON.parse(String(attrs['gen_ai.input.messages']))).toEqual([
      {
        role: 'user',
        parts: [
          {
            type: 'uri',
            modality: 'image',
            uri: 'https://example.test/picture',
          },
        ],
      },
    ]);
  });

  it('preserves the active parent and skips suppressed requests', async () => {
    await context.with(suppressTracing(context.active()), async () => {
      await chat();
    });
    expect(getTestSpans()).toHaveLength(0);
    const parent = trace.getTracer('test').startSpan('parent');
    try {
      await context.with(trace.setSpan(context.active(), parent), async () => {
        await chat();
      });
      expect(getTestSpans()[0].parentSpanContext?.spanId).toBe(
        parent.spanContext().spanId
      );
    } finally {
      parent.end();
    }
  });

  it('finishes a partially consumed stream once and preserves streamed function arguments', async () => {
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    const frame = (delta: object) =>
      `data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`;
    nock(endpoint)
      .post('/chat/completions')
      .reply(
        200,
        frame({ function_call: { name: 'lookup', arguments: '{"id":' } }) +
          frame({ function_call: { arguments: '42}' } }) +
          'data: [DONE]\n\n',
        { 'content-type': 'text/event-stream' }
      );
    const stream = await client.chat.completions.create({
      model: 'test',
      messages: [],
      stream: true,
    });
    let count = 0;
    for await (const chunk of stream) {
      expect(chunk.choices).toHaveLength(1);
      expect(getTestSpans()).toHaveLength(0);
      if (++count === 2) break;
    }
    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(
      JSON.parse(String(spans[0].attributes['gen_ai.output.messages']))[0].parts
    ).toEqual([{ type: 'tool_call', name: 'lookup', arguments: { id: 42 } }]);
  });
});

describe('OpenAI', function () {
  this.timeout(10000); // Increase timeout for LLM tests

  nockBack.fixtures = path.join(__dirname, 'mock-responses');
  let apiKey: string | undefined;
  if (nockBack.currentMode === 'dryrun') {
    apiKey = 'testing';
  }

  let nockDone: () => void;
  beforeEach(async function () {
    const filename = `${this.currentTest
      ?.fullTitle()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}.json`;
    const { nockDone: nd } = await nockBack(filename, {
      afterRecord: sanitizeRecordings,
    });
    nockDone = nd;
  });

  afterEach(async function () {
    nockDone();

    await meterProvider.forceFlush();
    metricExporter.reset();
  });

  const client = new OpenAI({ apiKey });
  // Responses API was added in openai v4.87.0
  const describeResponses = client.responses ? describe : describe.skip;
  const model = 'gpt-4o-mini';
  const input = 'Answer in up to 3 words: Which ocean contains Bouvet Island?';

  describe('chat completions', function () {
    this.beforeEach(() => {
      instrumentation.enable();
    });
    this.afterEach(() => {
      instrumentation.disable();
    });

    it('adds genai conventions', async () => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: input,
        },
      ];
      const chatCompletion = await client.chat.completions.create({
        model,
        messages,
      });
      expect(chatCompletion.choices[0].message.content).toEqual(
        'Atlantic Ocean.'
      );
      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 3,
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 3,
      });
    });

    it('records all the client options', async () => {
      const messages = [
        {
          role: 'user',
          content: input,
        },
      ] satisfies OpenAI.Chat.Completions.ChatCompletionMessageParam[];
      const chatCompletion = await client.chat.completions.create({
        model,
        messages,
        frequency_penalty: 0.0,
        max_tokens: 100,
        presence_penalty: 0.0,
        temperature: 1.0,
        top_p: 1.0,
        stop: 'foo',
        seed: 100,
        response_format: {
          type: 'text',
        },
      });
      expect(chatCompletion.choices[0].message.content).toEqual(
        'Southern Ocean.'
      );
      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.output.type': 'text',
        'gen_ai.request.frequency_penalty': 0.0,
        'gen_ai.request.max_tokens': 100,
        'gen_ai.request.presence_penalty': 0.0,
        'gen_ai.request.temperature': 1.0,
        'gen_ai.request.top_p': 1.0,
        'gen_ai.request.stop_sequences': ['foo'],
        'gen_ai.request.seed': 100,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 3,
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 3,
      });
    });

    it('records multiple choices', async () => {
      const messages = [
        {
          role: 'user',
          content: input,
        },
      ] satisfies OpenAI.Chat.Completions.ChatCompletionMessageParam[];
      const chatCompletion = await client.chat.completions.create({
        model,
        messages,
        n: 2,
      });
      expect(chatCompletion.choices[0].message.content).toEqual(
        'Atlantic Ocean.'
      );
      expect(chatCompletion.choices[1].message.content).toEqual(
        'Southern Ocean.'
      );
      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.choice.count': 2,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop', 'stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 6,
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 6,
      });
    });

    it('records tool calls', async () => {
      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            strict: true,
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
              required: ['location'],
              additionalProperties: false,
            },
          },
        },
      ];

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant providing weather updates.',
        },
        {
          role: 'user',
          content: 'What is the weather in New York City and London?',
        },
      ];
      const chatCompletion = await client.chat.completions.create({
        model,
        messages,
        tools,
      });
      expect(chatCompletion.choices[0].message.content).toBeNull();

      const toolCalls = chatCompletion.choices[0].message.tool_calls!;
      expect(toolCalls.length).toBe(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['tool_call'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.usage.input_tokens': 57,
        'gen_ai.usage.output_tokens': 46,
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 57,
        outputTokens: 46,
      });

      metricExporter.reset();
      resetMemoryExporter();

      messages.push({
        role: 'assistant',
        tool_calls: toolCalls,
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCalls[0].id,
        content: '25 degrees and sunny',
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCalls[1].id,
        content: '15 degrees and raining',
      });

      const chatCompletion1 = await client.chat.completions.create({
        model,
        messages,
        tools,
      });

      expect(chatCompletion1.choices[0].message.content).toBe(
        'The weather in New York City is 25 degrees and sunny, while in London, it is 15 degrees and raining.'
      );

      const spans1 = getTestSpans();
      expect(spans1.length).toBe(1);
      assertSpanScope(spans1[0], `chat ${model}`);
      expect(spans1[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.usage.input_tokens': 125,
        'gen_ai.usage.output_tokens': 26,
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 125,
        outputTokens: 26,
      });
    });

    it('handles connection errors without crashing', async () => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: input,
        },
      ];
      await expect(
        new OpenAI({
          baseURL: 'http://localhost:9999/v5',
          apiKey,
          maxRetries: 0,
        }).chat.completions.create({
          model,
          messages,
        })
      ).rejects.toThrow(OpenAI.APIConnectionError);
      await Promise.resolve();

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].status).toEqual({ code: SpanStatusCode.ERROR });
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        [ATTR_SERVER_ADDRESS]: 'localhost',
        [ATTR_SERVER_PORT]: 9999,
        [ATTR_ERROR_TYPE]: 'APIConnectionError',
        'gen_ai.response.finish_reasons': ['error'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        serverAddress: 'localhost',
        serverPort: 9999,
        errorType: 'APIConnectionError',
      });
    });
  });

  describe('chat completions with content capture', function () {
    this.beforeEach(() => {
      contentCaptureInstrumentation.enable();
    });
    this.afterEach(() => {
      contentCaptureInstrumentation.disable();
    });

    it('adds genai conventions', async () => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: input,
        },
      ];
      const chatCompletion = await client.chat.completions.create({
        model,
        messages,
      });
      expect(chatCompletion.choices[0].message.content).toEqual(
        'South Atlantic Ocean.'
      );
      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 4,
        'gen_ai.input.messages': expect.any(String),
        'gen_ai.output.messages': expect.any(String),
      });
      expect(
        JSON.parse(spans[0].attributes['gen_ai.input.messages'] as string)
      ).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: input }],
        },
      ]);
      expect(
        JSON.parse(spans[0].attributes['gen_ai.output.messages'] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'South Atlantic Ocean.' }],
          finish_reason: 'stop',
        },
      ]);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 4,
      });
    });

    it('records multiple choices', async () => {
      const messages = [
        {
          role: 'user',
          content: input,
        },
      ] satisfies OpenAI.Chat.Completions.ChatCompletionMessageParam[];
      const chatCompletion = await client.chat.completions.create({
        model,
        messages,
        n: 2,
      });
      expect(chatCompletion.choices[0].message.content).toEqual(
        'South Atlantic Ocean.'
      );
      expect(chatCompletion.choices[1].message.content).toEqual(
        'Southern Ocean'
      );
      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.choice.count': 2,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop', 'stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 6,
        'gen_ai.input.messages': expect.any(String),
        'gen_ai.output.messages': expect.any(String),
      });
      expect(
        JSON.parse(spans[0].attributes['gen_ai.output.messages'] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'South Atlantic Ocean.' }],
          finish_reason: 'stop',
        },
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Southern Ocean' }],
          finish_reason: 'stop',
        },
      ]);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 6,
      });
    });

    it('records tool calls', async () => {
      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            strict: true,
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
              required: ['location'],
              additionalProperties: false,
            },
          },
        },
      ];

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant providing weather updates.',
        },
        {
          role: 'user',
          content: 'What is the weather in New York City and London?',
        },
      ];
      const chatCompletion = await client.chat.completions.create({
        model,
        messages,
        tools,
      });
      expect(chatCompletion.choices[0].message.content).toBeNull();

      const toolCalls = chatCompletion.choices[0].message.tool_calls!;
      expect(toolCalls.length).toBe(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['tool_call'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.usage.input_tokens': 57,
        'gen_ai.usage.output_tokens': 46,
        'gen_ai.input.messages': expect.any(String),
        'gen_ai.output.messages': expect.any(String),
      });
      expect(
        JSON.parse(spans[0].attributes['gen_ai.output.messages'] as string)
      ).toEqual([
        {
          role: 'assistant',
          finish_reason: 'tool_call',
          parts: [
            {
              type: 'tool_call',
              id: toolCalls[0].id,
              name: 'get_weather',
              arguments: { location: 'New York City' },
            },
            {
              type: 'tool_call',
              id: toolCalls[1].id,
              name: 'get_weather',
              arguments: { location: 'London' },
            },
          ],
        },
      ]);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 57,
        outputTokens: 46,
      });

      metricExporter.reset();
      resetMemoryExporter();

      messages.push({
        role: 'assistant',
        tool_calls: toolCalls,
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCalls[0].id,
        content: '25 degrees and sunny',
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCalls[1].id,
        content: '15 degrees and raining',
      });

      const chatCompletion1 = await client.chat.completions.create({
        model,
        messages,
        tools,
      });

      expect(chatCompletion1.choices[0].message.content).toBe(
        'The weather is currently 25 degrees and sunny in New York City, while in London, it is 15 degrees and raining.'
      );

      const spans1 = getTestSpans();
      expect(spans1.length).toBe(1);
      assertSpanScope(spans1[0], `chat ${model}`);
      expect(spans1[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.usage.input_tokens': 125,
        'gen_ai.usage.output_tokens': 27,
        'gen_ai.input.messages': expect.any(String),
        'gen_ai.output.messages': expect.any(String),
      });
      expect(
        JSON.parse(spans1[0].attributes['gen_ai.input.messages'] as string)
      ).toEqual([
        {
          role: 'system',
          parts: [
            {
              type: 'text',
              content: 'You are a helpful assistant providing weather updates.',
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              type: 'text',
              content: 'What is the weather in New York City and London?',
            },
          ],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: toolCalls[0].id,
              name: 'get_weather',
              arguments: { location: 'New York City' },
            },
            {
              type: 'tool_call',
              id: toolCalls[1].id,
              name: 'get_weather',
              arguments: { location: 'London' },
            },
          ],
        },
        {
          role: 'tool',
          parts: [
            {
              type: 'tool_call_response',
              id: toolCalls[0].id,
              response: '25 degrees and sunny',
            },
          ],
        },
        {
          role: 'tool',
          parts: [
            {
              type: 'tool_call_response',
              id: toolCalls[1].id,
              response: '15 degrees and raining',
            },
          ],
        },
      ]);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 125,
        outputTokens: 27,
      });
    });
  });

  describe('streaming chat completions', function () {
    this.beforeEach(() => {
      instrumentation.enable();
    });
    this.afterEach(() => {
      instrumentation.disable();
    });

    it('adds genai conventions', async () => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: input,
        },
      ];
      const stream = await client.chat.completions.create({
        model,
        messages,
        stream: true,
      });
      let content = '';
      for await (const part of stream) {
        content += part.choices[0].delta.content || '';
      }
      expect(content).toEqual('Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        isStreaming: true,
      });
    });

    it('copes with chunks missing a choices array', async () => {
      // Regression test for #3554. Some OpenAI-compatible backends (e.g.
      // Gemini 2.5 via a gateway) stream a chunk that omits the `choices`
      // array entirely. The stream iterator must not throw on such a chunk.
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: input,
        },
      ];
      const stream = await client.chat.completions.create({
        model,
        messages,
        stream: true,
      });
      let content = '';
      for await (const part of stream) {
        content += part.choices?.[0]?.delta?.content || '';
      }
      expect(content).toEqual('Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toMatchObject({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
      });
    });

    it('copes with .withResponse() usage', async () => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: input,
        },
      ];
      const retval = await client.chat.completions
        .create({
          model,
          messages,
          stream: true,
        })
        .withResponse();
      let content = '';
      expect(retval.response).toBeTruthy();
      for await (const part of retval.data) {
        content += part.choices[0].delta.content || '';
      }
      expect(content).toEqual('Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
    });

    it('records usage', async () => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: input,
        },
      ];
      const stream = await client.chat.completions.create({
        model,
        messages,
        stream: true,
        stream_options: {
          include_usage: true,
        },
      });
      let content = '';
      for await (const part of stream) {
        if (part.choices[0]) {
          content += part.choices[0].delta.content || '';
        }
      }
      expect(content).toEqual('South Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 4,
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 4,
        isStreaming: true,
      });
    });

    it('records multiple choices', async () => {
      const messages = [
        {
          role: 'user',
          content: input,
        },
      ] satisfies OpenAI.Chat.Completions.ChatCompletionMessageParam[];
      const stream = await client.chat.completions.create({
        model,
        messages,
        n: 2,
        stream: true,
      });
      const choices: string[] = [];
      for await (const part of stream) {
        const idx = part.choices[0].index;
        if (!choices[idx]) {
          choices[idx] = '';
        }
        choices[idx] += part.choices[0].delta.content || '';
      }
      expect(choices[0]).toEqual('Atlantic Ocean.');
      expect(choices[1]).toEqual('Southern Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.choice.count': 2,
        'gen_ai.request.stream': true,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop', 'stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        isStreaming: true,
      });
    });

    it('records tool calls', async () => {
      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            strict: true,
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
              required: ['location'],
              additionalProperties: false,
            },
          },
        },
      ];

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant providing weather updates.',
        },
        {
          role: 'user',
          content: 'What is the weather in New York City and London?',
        },
      ];
      const stream = await client.chat.completions.create({
        model,
        messages,
        tools,
        stream: true,
      });

      const toolCalls: any[] = [];
      for await (const part of stream) {
        const delta = part.choices[0].delta;
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.id) {
              toolCalls[toolCall.index] = toolCall;
            } else {
              toolCalls[toolCall.index] = {
                ...toolCalls[toolCall.index],
                function: {
                  ...toolCalls[toolCall.index].function,
                  arguments:
                    (toolCalls[toolCall.index].function?.arguments ?? '') +
                    (toolCall.function?.arguments ?? ''),
                },
              };
            }
          }
        }
      }
      expect(toolCalls.length).toBe(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['tool_call'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        isStreaming: true,
      });

      metricExporter.reset();
      resetMemoryExporter();

      messages.push({
        role: 'assistant',
        tool_calls: toolCalls,
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCalls[0].id,
        content: '25 degrees and sunny',
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCalls[1].id,
        content: '15 degrees and raining',
      });

      const chatCompletion1 = await client.chat.completions.create({
        model,
        messages,
        tools,
        stream: true,
      });

      let content = '';
      for await (const part of chatCompletion1) {
        content += part.choices[0].delta.content || '';
      }

      expect(content).toBe(
        'The weather in New York City is 25 degrees and sunny, while in London, it is 15 degrees and raining.'
      );

      const spans1 = getTestSpans();
      expect(spans1.length).toBe(1);
      assertSpanScope(spans1[0], `chat ${model}`);
      expect(spans1[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        isStreaming: true,
      });
    });

    it('does not misbehave with double iteration', async () => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: input,
        },
      ];
      const stream = await client.chat.completions.create({
        model,
        messages,
        stream: true,
      });
      let content = '';
      for await (const part of stream) {
        content += part.choices[0].delta.content || '';
      }
      await expect(async () => {
        for await (const part of stream) {
          content += part.choices[0].delta.content || '';
        }
      }).rejects.toThrow();
      expect(content).toEqual('South Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        isStreaming: true,
      });
    });

    it('does not prevent usage of tee', async () => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: input,
        },
      ];
      const stream = await client.chat.completions.create({
        model,
        messages,
        stream: true,
      });
      let content0 = '';
      const [left, right] = stream.tee();
      for await (const part of left) {
        content0 += part.choices[0].delta.content || '';
      }
      let content1 = '';
      for await (const part of right) {
        content1 += part.choices[0].delta.content || '';
      }
      expect(content0).toEqual('Atlantic Ocean.');
      expect(content1).toEqual('Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        isStreaming: true,
      });
    });
  });

  describe('streaming chat completions with content capture', function () {
    this.beforeEach(() => {
      contentCaptureInstrumentation.enable();
    });
    this.afterEach(() => {
      contentCaptureInstrumentation.disable();
    });

    it('adds genai conventions', async () => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: input,
        },
      ];
      const stream = await client.chat.completions.create({
        model,
        messages,
        stream: true,
      });
      let content = '';
      for await (const part of stream) {
        content += part.choices[0].delta.content || '';
      }
      expect(content).toEqual('Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
        'gen_ai.input.messages': expect.any(String),
        'gen_ai.output.messages': expect.any(String),
      });
      expect(
        JSON.parse(spans[0].attributes['gen_ai.input.messages'] as string)
      ).toEqual([{ role: 'user', parts: [{ type: 'text', content: input }] }]);
      expect(
        JSON.parse(spans[0].attributes['gen_ai.output.messages'] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Atlantic Ocean.' }],
          finish_reason: 'stop',
        },
      ]);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        isStreaming: true,
      });
    });

    it('records multiple choices', async () => {
      const messages = [
        {
          role: 'user',
          content: input,
        },
      ] satisfies OpenAI.Chat.Completions.ChatCompletionMessageParam[];
      const stream = await client.chat.completions.create({
        model,
        messages,
        n: 2,
        stream: true,
      });
      const choices: string[] = [];
      for await (const part of stream) {
        const idx = part.choices[0].index;
        if (!choices[idx]) {
          choices[idx] = '';
        }
        choices[idx] += part.choices[0].delta.content || '';
      }
      expect(choices[0]).toEqual('Southern Ocean.');
      expect(choices[1]).toEqual('Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.choice.count': 2,
        'gen_ai.request.stream': true,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop', 'stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
        'gen_ai.input.messages': expect.any(String),
        'gen_ai.output.messages': expect.any(String),
      });
      expect(
        JSON.parse(spans[0].attributes['gen_ai.output.messages'] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Southern Ocean.' }],
          finish_reason: 'stop',
        },
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Atlantic Ocean.' }],
          finish_reason: 'stop',
        },
      ]);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        isStreaming: true,
      });
    });

    it('records tool calls', async () => {
      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            strict: true,
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
              required: ['location'],
              additionalProperties: false,
            },
          },
        },
      ];

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant providing weather updates.',
        },
        {
          role: 'user',
          content: 'What is the weather in New York City and London?',
        },
      ];
      const stream = await client.chat.completions.create({
        model,
        messages,
        tools,
        stream: true,
      });

      const toolCalls: any[] = [];
      for await (const part of stream) {
        const delta = part.choices[0].delta;
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.id) {
              toolCalls[toolCall.index] = toolCall;
            } else {
              toolCalls[toolCall.index] = {
                ...toolCalls[toolCall.index],
                function: {
                  ...toolCalls[toolCall.index].function,
                  arguments:
                    (toolCalls[toolCall.index].function?.arguments ?? '') +
                    (toolCall.function?.arguments ?? ''),
                },
              };
            }
          }
        }
      }
      expect(toolCalls.length).toBe(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['tool_call'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
        'gen_ai.input.messages': expect.any(String),
        'gen_ai.output.messages': expect.any(String),
      });
      expect(
        JSON.parse(spans[0].attributes['gen_ai.output.messages'] as string)
      ).toEqual([
        {
          role: 'assistant',
          finish_reason: 'tool_call',
          parts: [
            {
              type: 'tool_call',
              id: toolCalls[0].id,
              name: 'get_weather',
              arguments: { location: 'New York City' },
            },
            {
              type: 'tool_call',
              id: toolCalls[1].id,
              name: 'get_weather',
              arguments: { location: 'London' },
            },
          ],
        },
      ]);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        isStreaming: true,
      });

      metricExporter.reset();
      resetMemoryExporter();

      messages.push({
        role: 'assistant',
        tool_calls: toolCalls,
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCalls[0].id,
        content: '25 degrees and sunny',
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCalls[1].id,
        content: '15 degrees and raining',
      });

      const chatCompletion1 = await client.chat.completions.create({
        model,
        messages,
        tools,
        stream: true,
      });

      let content = '';
      for await (const part of chatCompletion1) {
        content += part.choices[0].delta.content || '';
      }

      expect(content).toBe(
        'The weather is currently 25 degrees and sunny in New York City, while in London, it is 15 degrees and raining.'
      );

      const spans1 = getTestSpans();
      expect(spans1.length).toBe(1);
      assertSpanScope(spans1[0], `chat ${model}`);
      expect(spans1[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.response.id': expect.stringMatching(/^chatcmpl-/),
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
        'gen_ai.input.messages': expect.any(String),
        'gen_ai.output.messages': expect.any(String),
      });
      expect(
        JSON.parse(spans1[0].attributes['gen_ai.output.messages'] as string)
      ).toEqual([
        {
          role: 'assistant',
          finish_reason: 'stop',
          parts: [
            {
              type: 'text',
              content:
                'The weather is currently 25 degrees and sunny in New York City, while in London, it is 15 degrees and raining.',
            },
          ],
        },
      ]);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        isStreaming: true,
      });
    });
  });

  describe('embeddings', function () {
    this.beforeEach(() => {
      instrumentation.enable();
    });
    this.afterEach(() => {
      instrumentation.disable();
    });

    it('adds genai conventions', async () => {
      const embedding = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: ['One fish', 'two fish', 'red fish', 'blue fish'],
        encoding_format: 'float',
      });
      expect(embedding.data.length).toBe(4);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], 'embeddings text-embedding-3-small');
      expect(spans[0].attributes).toEqual({
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'embeddings',
        'gen_ai.request.model': 'text-embedding-3-small',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.response.model': 'text-embedding-3-small',
        'gen_ai.request.encoding_formats': ['float'],
        'gen_ai.embeddings.dimension.count': 1536,
        'gen_ai.usage.input_tokens': 8,
      });

      await assertEmbeddingMetrics({
        requestModel: 'text-embedding-3-small',
        responseModel: 'text-embedding-3-small',
      });
    });
  });

  describeResponses('responses', function () {
    this.beforeEach(() => {
      instrumentation.enable();
    });
    this.afterEach(() => {
      instrumentation.disable();
    });

    it('adds genai conventions', async () => {
      const response = await client.responses.create({
        model,
        input,
      });

      expect(response.output_text).toEqual('Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 3,
        'gen_ai.response.finish_reasons': ['stop'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 3,
      });
    });

    it('records all the client options', async () => {
      const response = await client.responses.create({
        model,
        input,
        max_output_tokens: 100,
        temperature: 1.0,
        top_p: 1.0,
      });

      expect(response.output_text).toEqual('Southern Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.max_tokens': 100,
        'gen_ai.request.temperature': 1.0,
        'gen_ai.request.top_p': 1.0,
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 3,
        'gen_ai.response.finish_reasons': ['stop'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 3,
      });
    });

    it('records function calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get the current weather in a given location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city, e.g. San Francisco',
              },
            },
            required: ['location'],
          },
          strict: true,
        },
        {
          type: 'function',
          name: 'send_email',
          description: 'Send an email',
          parameters: {
            type: 'object',
            properties: {
              to: {
                type: 'string',
                description: 'The email address of the recipient',
              },
              body: {
                type: 'string',
                description: 'The body of the email',
              },
            },
            required: ['to', 'body'],
          },
          strict: true,
        },
      ];

      const inputMsgs: OpenAI.Responses.ResponseInput = [
        {
          role: 'system',
          content: 'You are a helpful assistant providing weather updates.',
        },
        {
          role: 'user',
          content: 'What is the weather in Paris and Bogotá?',
        },
      ];
      const response = await client.responses.create({
        model,
        input: inputMsgs,
        tools,
        parallel_tool_calls: true,
      });

      expect(response.output_text).toBe('');
      expect(response.output).toHaveLength(3);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 291,
        'gen_ai.usage.output_tokens': 23,
        'gen_ai.response.finish_reasons': ['tool_call'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 291,
        outputTokens: 23,
      });
    });

    it('records custom tool calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'custom',
          name: 'code_exec',
          description: 'Executes arbitrary Python code.',
        },
      ];

      const response = await client.responses.create({
        model,
        input: 'Use the code_exec tool to print hello world to the console.',
        tools,
      });

      expect(response.output_text).toBe('');
      expect(response.output).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4.1-2025-04-14',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 291,
        'gen_ai.usage.output_tokens': 23,
        'gen_ai.response.finish_reasons': ['tool_call'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4.1-2025-04-14',
        inputTokens: 291,
        outputTokens: 23,
      });
    });

    it('records file search calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'file_search',
          vector_store_ids: ['<vector_store_id>'],
          max_num_results: 2,
        },
      ];

      const response = await client.responses.create({
        model,
        input: 'What is deep research by OpenAI?',
        tools,
        include: ['file_search_call.results'],
      });

      expect(response.output_text).toEqual(
        expect.stringContaining('Deep research')
      );
      expect(response.output).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4.1-2025-04-14',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 291,
        'gen_ai.usage.output_tokens': 23,
        'gen_ai.response.finish_reasons': ['stop'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4.1-2025-04-14',
        inputTokens: 291,
        outputTokens: 23,
      });
    });

    it('records web search calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'web_search',
        },
      ];

      const response = await client.responses.create({
        model,
        input: 'What was a positive news story from today?',
        tools,
        include: ['web_search_call.action.sources'],
      });

      expect(response.output_text).toContain('On March 6, 2025, several news');
      expect(response.output).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4.1-2025-04-14',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 291,
        'gen_ai.usage.output_tokens': 23,
        'gen_ai.response.finish_reasons': ['stop'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4.1-2025-04-14',
        inputTokens: 291,
        outputTokens: 23,
      });
    });

    it('records computer use calls', async () => {
      const computerModel = 'computer-use-preview';
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'computer_use_preview',
          display_width: 1024,
          display_height: 768,
          environment: 'browser',
        },
      ];

      const response = await client.responses.create({
        model: computerModel,
        tools,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Check the latest OpenAI news on bing.com.',
              },
            ],
          },
        ],
        reasoning: { summary: 'concise' },
        truncation: 'auto',
      });

      expect(response.output_text).toBe('');
      expect(response.output).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${computerModel}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': computerModel,
        'gen_ai.response.model': 'computer-use-preview-2025-04-14',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 291,
        'gen_ai.usage.output_tokens': 23,
        'gen_ai.response.finish_reasons': ['tool_call'],
      });

      await assertInferenceMetrics({
        requestModel: computerModel,
        responseModel: 'computer-use-preview-2025-04-14',
        inputTokens: 291,
        outputTokens: 23,
      });
    });

    it('records code interpreter calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'code_interpreter',
          container: 'cfile_682e0e8a43c88191a7978f477a09bdf5',
        },
      ];

      const response = await client.responses.create({
        model,
        tools,
        instructions: null,
        input:
          'Plot and analyse the histogram of the RGB channels for the uploaded image.',
      });

      expect(response.output_text).toContain(
        'Here is the histogram of the RGB channels'
      );
      expect(response.output).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4.1-2025-04-14',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 291,
        'gen_ai.usage.output_tokens': 23,
        'gen_ai.response.finish_reasons': ['stop'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4.1-2025-04-14',
        inputTokens: 291,
        outputTokens: 23,
      });
    });

    it('records image generation call', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'image_generation',
        },
      ];

      const response = await client.responses.create({
        model,
        tools,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Now make it look realistic',
              },
            ],
          },
          // @ts-expect-error: types don't match documentation
          {
            type: 'image_generation_call',
            id: 'ig_123',
          },
        ],
      });

      expect(response.output_text).toBe('');
      expect(response.output).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4.1-2025-04-14',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 291,
        'gen_ai.usage.output_tokens': 23,
        'gen_ai.response.finish_reasons': ['stop'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4.1-2025-04-14',
        inputTokens: 291,
        outputTokens: 23,
      });
    });

    it('records mcp calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'mcp',
          server_label: 'dmcp',
          server_description:
            'A Dungeons and Dragons MCP server to assist with dice rolling.',
          server_url: 'https://dmcp-server.deno.dev/sse',
          require_approval: 'never',
          allowed_tools: ['roll'],
        },
      ];

      const response = await client.responses.create({
        model,
        tools,
        input: [
          {
            role: 'user',
            content: 'Roll 2d4+1',
          },
          {
            id: 'mcpl_68a6102a4968819c8177b05584dd627b0679e572a900e618',
            type: 'mcp_list_tools',
            server_label: 'dmcp',
            tools: [
              {
                annotations: null,
                description: 'Given a string of text describing a dice roll...',
                input_schema: {
                  $schema: 'https://json-schema.org/draft/2020-12/schema',
                  type: 'object',
                  properties: {
                    diceRollExpression: {
                      type: 'string',
                    },
                  },
                  required: ['diceRollExpression'],
                  additionalProperties: false,
                },
                name: 'roll',
              },
            ],
          },
          {
            id: 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339',
            type: 'mcp_approval_request',
            arguments: '{"diceRollExpression":"2d4 + 1"}',
            name: 'roll',
            server_label: 'dmcp',
          },
          {
            type: 'mcp_approval_response',
            approve: true,
            approval_request_id:
              'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339',
          },
        ],
      });

      expect(response.output_text).toBe('');
      expect(response.output).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4.1-2025-04-14',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 291,
        'gen_ai.usage.output_tokens': 23,
        'gen_ai.response.finish_reasons': ['stop'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4.1-2025-04-14',
        inputTokens: 291,
        outputTokens: 23,
      });
    });

    it('records code interpreter calls with outputs', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'code_interpreter',
          container: 'cfile_682e0e8a43c88191a7978f477a09bdf5',
        },
      ];

      const response = await client.responses.create({
        model,
        tools,
        instructions: null,
        input:
          'Plot and analyse the histogram of the RGB channels for the uploaded image.',
      });

      expect(response.output).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4.1-2025-04-14',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 291,
        'gen_ai.usage.output_tokens': 23,
        'gen_ai.response.finish_reasons': ['stop'],
      });
    });

    it('records local shell calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'local_shell' as any,
        },
      ];

      const response = await client.responses.create({
        model,
        tools,
        input: 'List the files in the current directory',
      });

      expect(response.output).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4.1-2025-04-14',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 291,
        'gen_ai.usage.output_tokens': 23,
        'gen_ai.response.finish_reasons': ['tool_call'],
      });
    });

    it('records mcp list tools and approval', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'mcp',
          server_label: 'dmcp',
          server_description:
            'A Dungeons and Dragons MCP server to assist with dice rolling.',
          server_url: 'https://dmcp-server.deno.dev/sse',
          require_approval: 'always',
          allowed_tools: ['roll'],
        },
      ];

      const response = await client.responses.create({
        model,
        tools,
        input: 'Roll 2d4+1',
      });

      expect(response.output).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4.1-2025-04-14',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 291,
        'gen_ai.usage.output_tokens': 23,
        'gen_ai.response.finish_reasons': ['tool_call'],
      });
    });

    it('records system instructions', async () => {
      const response = await client.responses.create({
        model,
        input: 'Which ocean contains Bouvet Island?',
        instructions: 'Answer in up to 3 words.',
      });

      expect(response.output_text).toEqual('Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      // With default captureMessageContent ('none'), system instructions must NOT be leaked onto spans.
      expect(spans[0].attributes['gen_ai.system_instructions']).toBeUndefined();
    });

    it('handles connection errors without crashing', async () => {
      await expect(
        new OpenAI({
          baseURL: 'http://localhost:9999/v5',
          apiKey,
          maxRetries: 0,
        }).responses.create({
          model,
          input,
        })
      ).rejects.toThrow(OpenAI.APIConnectionError);
      await Promise.resolve();

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].status).toEqual({ code: SpanStatusCode.ERROR });
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'localhost',
        [ATTR_SERVER_PORT]: 9999,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        [ATTR_ERROR_TYPE]: 'APIConnectionError',
        'gen_ai.response.finish_reasons': ['error'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        serverAddress: 'localhost',
        serverPort: 9999,
        errorType: 'APIConnectionError',
      });
    });

    it('records function call outputs', async () => {
      const response = await client.responses.create({
        model,
        input: [
          {
            role: 'user',
            content: 'What is the weather in Paris?',
          },
          {
            type: 'function_call',
            id: 'fc_12345xyz',
            call_id: 'call_12345xyz',
            name: 'get_weather',
            arguments: '{"location":"Paris, France"}',
          },
          {
            type: 'function_call_output',
            call_id: 'call_12345xyz',
            output: '{"temperature":22,"condition":"sunny"}',
          },
        ] as OpenAI.Responses.ResponseInput,
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the current weather in a given location',
            parameters: {
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
            },
            strict: true,
          },
        ],
      });

      expect(response.output_text).toEqual(
        'The weather in Paris is 22°C and sunny.'
      );

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes['gen_ai.input.messages']).toBeUndefined();
      expect(spans[0].attributes['gen_ai.response.status']).toBe('completed');
      expect(spans[0].attributes['gen_ai.response.finish_reasons']).toEqual([
        'stop',
      ]);
    });

    it('records multimodal input', async () => {
      const response = await client.responses.create({
        model,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'What is in this image?',
              },
              {
                type: 'input_image',
                image_url: 'https://example.com/image.png',
              },
            ],
          },
        ] as OpenAI.Responses.ResponseInput,
      });

      expect(response.output_text).toEqual('A cat.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes['gen_ai.input.messages']).toBeUndefined();
      expect(spans[0].attributes['gen_ai.response.status']).toBe('completed');
      expect(spans[0].attributes['gen_ai.response.finish_reasons']).toEqual([
        'stop',
      ]);
    });
  });

  describeResponses('responses with content capture', function () {
    this.beforeEach(() => {
      contentCaptureInstrumentation.enable();
    });
    this.afterEach(() => {
      contentCaptureInstrumentation.disable();
    });

    it('adds genai conventions', async () => {
      const response = await client.responses.create({
        model,
        input,
      });

      expect(response.output_text).toEqual('Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 3,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.input.messages': expect.any(String),
        'gen_ai.output.messages': expect.any(String),
      });
      expect(
        JSON.parse(spans[0].attributes['gen_ai.input.messages'] as string)
      ).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: input }],
        },
      ]);
      expect(
        JSON.parse(spans[0].attributes['gen_ai.output.messages'] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Atlantic Ocean.' }],
          finish_reason: 'stop',
        },
      ]);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 3,
      });
    });
  });

  describeResponses('streaming responses', function () {
    this.beforeEach(() => {
      instrumentation.enable();
    });
    this.afterEach(() => {
      instrumentation.disable();
    });

    it('adds genai conventions', async () => {
      const stream = client.responses.stream({
        model,
        input,
      });
      let content = '';
      for await (const part of stream) {
        content += part.type === 'response.output_text.delta' ? part.delta : '';
      }
      expect(content).toEqual('Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 3,
        'gen_ai.response.finish_reasons': ['stop'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 3,
        isStreaming: true,
      });
    });

    it('records usage', async () => {
      const stream = client.responses.stream({
        model,
        input,
      });
      let content = '';
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          content += event.delta;
        }
      }
      expect(content).toEqual('South Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes['gen_ai.usage.input_tokens']).toEqual(22);
      expect(spans[0].attributes['gen_ai.usage.output_tokens']).toEqual(4);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 4,
        isStreaming: true,
      });
    });

    it('does not misbehave with double iteration', async () => {
      const stream = await client.responses.create({
        model,
        input,
        stream: true,
      });
      let content = '';
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          content += event.delta;
        }
      }
      await expect(async () => {
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') {
            content += event.delta;
          }
        }
      }).rejects.toThrow();
      expect(content).toEqual('South Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 4,
        'gen_ai.response.finish_reasons': ['stop'],
      });

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 4,
        isStreaming: true,
      });
    });
  });

  describeResponses('streaming responses with content capture', function () {
    this.beforeEach(() => {
      contentCaptureInstrumentation.enable();
    });
    this.afterEach(() => {
      contentCaptureInstrumentation.disable();
    });

    it('adds genai conventions', async () => {
      const stream = client.responses.stream({
        model,
        input,
      });
      let content = '';
      for await (const part of stream) {
        content += part.type === 'response.output_text.delta' ? part.delta : '';
      }
      expect(content).toEqual('Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.status': 'completed',
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 3,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.input.messages': expect.any(String),
        'gen_ai.output.messages': expect.any(String),
      });
      expect(
        JSON.parse(spans[0].attributes['gen_ai.input.messages'] as string)
      ).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: input }],
        },
      ]);
      expect(
        JSON.parse(spans[0].attributes['gen_ai.output.messages'] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Atlantic Ocean.' }],
          finish_reason: 'stop',
        },
      ]);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 3,
        isStreaming: true,
      });
    });

    it('does not misbehave with double iteration', async () => {
      const stream = await client.responses.create({
        model,
        input,
        stream: true,
      });
      let content = '';
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          content += event.delta;
        }
      }
      await expect(async () => {
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') {
            content += event.delta;
          }
        }
      }).rejects.toThrow();
      expect(content).toEqual('South Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpanScope(spans[0], `chat ${model}`);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        'gen_ai.provider.name': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'gen_ai.request.stream': true,
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'gen_ai.response.id': expect.stringMatching(/^resp_/),
        'gen_ai.response.time_to_first_chunk': expect.any(Number),
        'gen_ai.usage.input_tokens': 22,
        'gen_ai.usage.output_tokens': 4,
        'gen_ai.response.finish_reasons': ['stop'],
        'gen_ai.input.messages': expect.any(String),
        'gen_ai.output.messages': expect.any(String),
      });
      expect(
        JSON.parse(spans[0].attributes['gen_ai.output.messages'] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'South Atlantic Ocean.' }],
          finish_reason: 'stop',
        },
      ]);

      await assertInferenceMetrics({
        requestModel: model,
        responseModel: 'gpt-4o-mini-2024-07-18',
        inputTokens: 22,
        outputTokens: 4,
        isStreaming: true,
      });
    });
  });
});
