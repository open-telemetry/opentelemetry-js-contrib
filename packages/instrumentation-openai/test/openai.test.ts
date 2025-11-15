/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
  loggerProvider,
  logsExporter,
  meterProvider,
  metricExporter,
} from './load-instrumentation';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { expect } from 'expect';
import { type Definition, back as nockBack } from 'nock';
import { OpenAI } from 'openai';
import * as path from 'node:path';

import {
  ATTR_EVENT_NAME,
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_TOKEN_TYPE,
  EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_TOKEN_TYPE_VALUE_INPUT,
  GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
} from '../src/semconv';

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
      .replace(/\s/g, '-')}.json`;
    const { nockDone: nd } = await nockBack(filename, {
      afterRecord: sanitizeRecordings,
    });
    nockDone = nd;
  });

  afterEach(async function () {
    nockDone();

    await loggerProvider.forceFlush();
    logsExporter.reset();

    await meterProvider.forceFlush();
    metricExporter.reset();
  });

  const client = new OpenAI({ apiKey });
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 3,
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 22,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 3,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {},
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY]: 0.0,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 100,
        [ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY]: 0.0,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 1.0,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1.0,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['foo'],
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 3,
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 22,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 3,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {},
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop', 'stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 6,
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 22,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 6,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(3);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {},
      });
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[2].body).toEqual({
        finish_reason: 'stop',
        index: 1,
        message: {},
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_calls'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 57,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 46,
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 57,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 46,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(3);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.system.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[2].body).toEqual({
        finish_reason: 'tool_calls',
        index: 0,
        message: {
          tool_calls: [
            {
              type: 'function',
              id: toolCalls[0].id,
              function: {
                name: 'get_weather',
              },
            },
            {
              type: 'function',
              id: toolCalls[1].id,
              function: {
                name: 'get_weather',
              },
            },
          ],
        },
      });

      metricExporter.reset();
      logsExporter.reset();
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
      expect(spans1[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 125,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 26,
      });

      await meterProvider.forceFlush();
      const [resourceMetrics1] = metricExporter.getMetrics();
      expect(resourceMetrics1.scopeMetrics.length).toBe(1);
      const scopeMetrics1 = resourceMetrics1.scopeMetrics[0];
      const tokenUsage1 = scopeMetrics1.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage1.length).toBe(1);
      expect(tokenUsage1[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage1[0].dataPoints.length).toBe(2);
      expect(tokenUsage1[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 125,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 26,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
        ])
      );

      const operationDuration1 = scopeMetrics1.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration1.length).toBe(1);
      expect(operationDuration1[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration1[0].dataPoints.length).toBe(1);
      expect(operationDuration1[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration1[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx1 = spans1[0].spanContext();

      await loggerProvider.forceFlush();
      const logs1 = logsExporter.getFinishedLogRecords();
      expect(logs1.length).toBe(6);
      expect(logs1[0].spanContext).toEqual(spanCtx1);
      expect(logs1[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.system.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[0].body).toEqual({});
      expect(logs1[1].spanContext).toEqual(spanCtx1);
      expect(logs1[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[1].body).toEqual({});
      expect(logs1[2].spanContext).toEqual(spanCtx1);
      expect(logs1[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.assistant.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[2].body).toEqual({
        tool_calls: [
          {
            type: 'function',
            id: toolCalls[0].id,
            function: {
              name: 'get_weather',
            },
          },
          {
            type: 'function',
            id: toolCalls[1].id,
            function: {
              name: 'get_weather',
            },
          },
        ],
      });
      expect(logs1[3].spanContext).toEqual(spanCtx1);
      expect(logs1[3].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.tool.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[3].body).toEqual({
        id: toolCalls[0].id,
      });
      expect(logs1[4].spanContext).toEqual(spanCtx1);
      expect(logs1[4].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.tool.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[4].body).toEqual({
        id: toolCalls[1].id,
      });
      expect(logs1[5].spanContext).toEqual(spanCtx1);
      expect(logs1[5].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[5].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {},
      });
    });

    it('handles connection errors without crashing', async () => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: input,
        },
      ];
      expect(
        new OpenAI({
          baseURL: 'http://localhost:9999/v5',
          apiKey,
        }).chat.completions.create({
          model,
          messages,
        })
      ).rejects.toThrow(OpenAI.APIConnectionError);

      // TODO: Figure out why it takes so long to get this span. trace.getTracerProvider()._delegate.forceFlush() didn't help.
      await new Promise(resolve => setTimeout(resolve, 2000));

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'localhost',
        [ATTR_SERVER_PORT]: 9999,
        [ATTR_ERROR_TYPE]: 'APIConnectionError',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );
      expect(tokenUsage).toHaveLength(0);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_SERVER_ADDRESS]: 'localhost',
            [ATTR_SERVER_PORT]: 9999,
            [ATTR_ERROR_TYPE]: 'APIConnectionError',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({});
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 4,
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 22,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 4,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({
        content: input,
      });
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {
          content: 'South Atlantic Ocean.',
        },
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop', 'stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 6,
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 22,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 6,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(3);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({
        content: input,
      });
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {
          content: 'South Atlantic Ocean.',
        },
      });
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[2].body).toEqual({
        finish_reason: 'stop',
        index: 1,
        message: {
          content: 'Southern Ocean',
        },
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_calls'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 57,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 46,
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 57,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 46,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(3);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.system.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({
        content: 'You are a helpful assistant providing weather updates.',
      });
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        content: 'What is the weather in New York City and London?',
      });
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[2].body).toEqual({
        finish_reason: 'tool_calls',
        index: 0,
        message: {
          tool_calls: [
            {
              type: 'function',
              id: toolCalls[0].id,
              function: {
                name: 'get_weather',
                arguments: '{"location": "New York City"}',
              },
            },
            {
              type: 'function',
              id: toolCalls[1].id,
              function: {
                name: 'get_weather',
                arguments: '{"location": "London"}',
              },
            },
          ],
        },
      });

      metricExporter.reset();
      logsExporter.reset();
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
      expect(spans1[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 125,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 27,
      });

      await meterProvider.forceFlush();
      const [resourceMetrics1] = metricExporter.getMetrics();
      expect(resourceMetrics1.scopeMetrics.length).toBe(1);
      const scopeMetrics1 = resourceMetrics1.scopeMetrics[0];
      const tokenUsage1 = scopeMetrics1.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage1.length).toBe(1);
      expect(tokenUsage1[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage1[0].dataPoints.length).toBe(2);
      expect(tokenUsage1[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 125,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 27,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
        ])
      );

      const operationDuration1 = scopeMetrics1.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration1.length).toBe(1);
      expect(operationDuration1[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration1[0].dataPoints.length).toBe(1);
      expect(operationDuration1[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration1[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx1 = spans1[0].spanContext();

      await loggerProvider.forceFlush();
      const logs1 = logsExporter.getFinishedLogRecords();
      expect(logs1.length).toBe(6);
      expect(logs1[0].spanContext).toEqual(spanCtx1);
      expect(logs1[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.system.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[0].body).toEqual({
        content: 'You are a helpful assistant providing weather updates.',
      });
      expect(logs1[1].spanContext).toEqual(spanCtx1);
      expect(logs1[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[1].body).toEqual({
        content: 'What is the weather in New York City and London?',
      });
      expect(logs1[2].spanContext).toEqual(spanCtx1);
      expect(logs1[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.assistant.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[2].body).toEqual({
        tool_calls: [
          {
            type: 'function',
            id: toolCalls[0].id,
            function: {
              name: 'get_weather',
              arguments: '{"location": "New York City"}',
            },
          },
          {
            type: 'function',
            id: toolCalls[1].id,
            function: {
              name: 'get_weather',
              arguments: '{"location": "London"}',
            },
          },
        ],
      });
      expect(logs1[3].spanContext).toEqual(spanCtx1);
      expect(logs1[3].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.tool.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[3].body).toEqual({
        id: toolCalls[0].id,
        content: '25 degrees and sunny',
      });
      expect(logs1[4].spanContext).toEqual(spanCtx1);
      expect(logs1[4].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.tool.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[4].body).toEqual({
        id: toolCalls[1].id,
        content: '15 degrees and raining',
      });
      expect(logs1[5].spanContext).toEqual(spanCtx1);
      expect(logs1[5].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[5].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {
          content:
            'The weather is currently 25 degrees and sunny in New York City, while in London, it is 15 degrees and raining.',
        },
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(0);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {},
      });
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 4,
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 22,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 4,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {},
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop', 'stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(0);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(3);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {},
      });
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[2].body).toEqual({
        finish_reason: 'stop',
        index: 1,
        message: {},
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_calls'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(0);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(3);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.system.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[2].body).toEqual({
        finish_reason: 'tool_calls',
        index: 0,
        message: {
          tool_calls: [
            {
              type: 'function',
              id: toolCalls[0].id,
              function: {
                name: 'get_weather',
              },
            },
            {
              type: 'function',
              id: toolCalls[1].id,
              function: {
                name: 'get_weather',
              },
            },
          ],
        },
      });

      metricExporter.reset();
      logsExporter.reset();
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
      expect(spans1[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics1] = metricExporter.getMetrics();
      expect(resourceMetrics1.scopeMetrics.length).toBe(1);
      const scopeMetrics1 = resourceMetrics1.scopeMetrics[0];
      const tokenUsage1 = scopeMetrics1.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage1.length).toBe(0);

      const operationDuration1 = scopeMetrics1.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration1.length).toBe(1);
      expect(operationDuration1[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration1[0].dataPoints.length).toBe(1);
      expect(operationDuration1[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration1[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx1 = spans1[0].spanContext();

      await loggerProvider.forceFlush();
      const logs1 = logsExporter.getFinishedLogRecords();
      expect(logs1.length).toBe(6);
      expect(logs1[0].spanContext).toEqual(spanCtx1);
      expect(logs1[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.system.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[0].body).toEqual({});
      expect(logs1[1].spanContext).toEqual(spanCtx1);
      expect(logs1[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[1].body).toEqual({});
      expect(logs1[2].spanContext).toEqual(spanCtx1);
      expect(logs1[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.assistant.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[2].body).toEqual({
        tool_calls: [
          {
            type: 'function',
            id: toolCalls[0].id,
            function: {
              name: 'get_weather',
            },
          },
          {
            type: 'function',
            id: toolCalls[1].id,
            function: {
              name: 'get_weather',
            },
          },
        ],
      });
      expect(logs1[3].spanContext).toEqual(spanCtx1);
      expect(logs1[3].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.tool.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[3].body).toEqual({
        id: toolCalls[0].id,
      });
      expect(logs1[4].spanContext).toEqual(spanCtx1);
      expect(logs1[4].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.tool.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[4].body).toEqual({
        id: toolCalls[1].id,
      });
      expect(logs1[5].spanContext).toEqual(spanCtx1);
      expect(logs1[5].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[5].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {},
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
      expect(async () => {
        for await (const part of stream) {
          content += part.choices[0].delta.content || '';
        }
      }).rejects.toThrow();
      expect(content).toEqual('South Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(0);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {},
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(0);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({});
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {},
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(0);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({
        content: input,
      });
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {
          content: 'Atlantic Ocean.',
        },
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop', 'stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(0);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(3);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({
        content: input,
      });
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {
          content: 'Southern Ocean.',
        },
      });
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[2].body).toEqual({
        finish_reason: 'stop',
        index: 1,
        message: {
          content: 'Atlantic Ocean.',
        },
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_calls'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(0);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(3);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.system.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[0].body).toEqual({
        content: 'You are a helpful assistant providing weather updates.',
      });
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[1].body).toEqual({
        content: 'What is the weather in New York City and London?',
      });
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs[2].body).toEqual({
        finish_reason: 'tool_calls',
        index: 0,
        message: {
          tool_calls: [
            {
              type: 'function',
              id: toolCalls[0].id,
              function: {
                name: 'get_weather',
                arguments: '{"location": "New York City"}',
              },
            },
            {
              type: 'function',
              id: toolCalls[1].id,
              function: {
                name: 'get_weather',
                arguments: '{"location": "London"}',
              },
            },
          ],
        },
      });

      metricExporter.reset();
      logsExporter.reset();
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
      expect(spans1[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^chatcmpl-/),
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics1] = metricExporter.getMetrics();
      expect(resourceMetrics1.scopeMetrics.length).toBe(1);
      const scopeMetrics1 = resourceMetrics1.scopeMetrics[0];
      const tokenUsage1 = scopeMetrics1.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage1.length).toBe(0);

      const operationDuration1 = scopeMetrics1.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration1.length).toBe(1);
      expect(operationDuration1[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration1[0].dataPoints.length).toBe(1);
      expect(operationDuration1[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration1[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx1 = spans1[0].spanContext();

      await loggerProvider.forceFlush();
      const logs1 = logsExporter.getFinishedLogRecords();
      expect(logs1.length).toBe(6);
      expect(logs1[0].spanContext).toEqual(spanCtx1);
      expect(logs1[0].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.system.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[0].body).toEqual({
        content: 'You are a helpful assistant providing weather updates.',
      });
      expect(logs1[1].spanContext).toEqual(spanCtx1);
      expect(logs1[1].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.user.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[1].body).toEqual({
        content: 'What is the weather in New York City and London?',
      });
      expect(logs1[2].spanContext).toEqual(spanCtx1);
      expect(logs1[2].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.assistant.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[2].body).toEqual({
        tool_calls: [
          {
            type: 'function',
            id: toolCalls[0].id,
            function: {
              name: 'get_weather',
              arguments: '{"location": "New York City"}',
            },
          },
          {
            type: 'function',
            id: toolCalls[1].id,
            function: {
              name: 'get_weather',
              arguments: '{"location": "London"}',
            },
          },
        ],
      });
      expect(logs1[3].spanContext).toEqual(spanCtx1);
      expect(logs1[3].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.tool.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[3].body).toEqual({
        id: toolCalls[0].id,
        content: '25 degrees and sunny',
      });
      expect(logs1[4].spanContext).toEqual(spanCtx1);
      expect(logs1[4].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.tool.message',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[4].body).toEqual({
        id: toolCalls[1].id,
        content: '15 degrees and raining',
      });
      expect(logs1[5].spanContext).toEqual(spanCtx1);
      expect(logs1[5].attributes).toEqual({
        [ATTR_EVENT_NAME]: 'gen_ai.choice',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
      });
      expect(logs1[5].body).toEqual({
        finish_reason: 'stop',
        index: 0,
        message: {
          content:
            'The weather is currently 25 degrees and sunny in New York City, while in London, it is 15 degrees and raining.',
        },
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
      expect(spans[0].attributes).toEqual({
        [ATTR_GEN_AI_OPERATION_NAME]: 'embeddings',
        [ATTR_GEN_AI_REQUEST_MODEL]: 'text-embedding-3-small',
        [ATTR_GEN_AI_SYSTEM]: 'openai',
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'text-embedding-3-small',
        [ATTR_GEN_AI_REQUEST_ENCODING_FORMATS]: ['float'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(1);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 8,
            }),
            attributes: {
              [ATTR_GEN_AI_SYSTEM]: 'openai',
              [ATTR_GEN_AI_OPERATION_NAME]: 'embeddings',
              [ATTR_GEN_AI_REQUEST_MODEL]: 'text-embedding-3-small',
              [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'text-embedding-3-small',
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_GEN_AI_SYSTEM]: 'openai',
            [ATTR_GEN_AI_OPERATION_NAME]: 'embeddings',
            [ATTR_GEN_AI_REQUEST_MODEL]: 'text-embedding-3-small',
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'text-embedding-3-small',
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);
    });
  });

  describe('responses', function () {
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 3,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 22,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 3,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        }
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: undefined }],
          finish_reason: 'stop'
        }
      ]);
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 100,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 1.0,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1.0,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 3,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 22,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 3,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        }
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: undefined }],
          finish_reason: 'stop'
        }
      ]);
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

      const input: OpenAI.Responses.ResponseInput = [
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
        input,
        tools,
        parallel_tool_calls: true,
      });

      expect(response.output_text).toBe('');
      expect(response.output).toHaveLength(3);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'system',
          parts: [{ type: 'text', content: undefined }],
        },
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              'id': 'fc_12345xyz',
              'call_id': 'call_12345xyz',
              'type': 'tool_call',
              'name': 'get_weather',
              'arguments': undefined
            },
            {
              'id': 'fc_67890abc',
              'call_id': 'call_67890abc',
              'type': 'tool_call',
              'name': 'get_weather',
              'arguments': undefined
            },
            {
              'id': 'fc_99999def',
              'call_id': 'call_99999def',
              'type': 'tool_call',
              'name': 'send_email',
              'arguments': undefined
            }
          ],
          finish_reason: 'tool_call',
        },
      ]);
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ctc_6890e975e86c819c9338825b3e1994810694874912ae0ea6',
              name: 'code_exec',
              arguments: undefined,
              call_id: 'call_aGiFQkRWSWAIsMQ19fKqxUgb',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'fs_67c09ccea8c48191ade9367e3ba71515',
              name: 'file_search_call',
              arguments: undefined,
            },
            {
              type: 'tool_call_response',
              id: 'fs_67c09ccea8c48191ade9367e3ba71515',
              response: undefined,
            },
            {
              type: 'text',
              content: undefined,
            },
          ],
          finish_reason: 'stop',
        },
      ]);
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
        include: ['web_search_call.action.sources']
      });

      expect(response.output_text).toContain('On March 6, 2025, several news');
      expect(response.output).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toMatchObject({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
      });
      expect(spans[0].attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual(['stop']);

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ws_67c9fa0502748190b7dd390736892e100be649c1a5ff9609',
              name: 'web_search_call',
              arguments: undefined,
            },
            {
              type: 'text',
              content: undefined,
            },
          ],
          finish_reason: 'stop',
        },
      ]);
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: undefined,
            },
            {
              type: 'tool_call',
              id: 'cu_67cc...',
              name: 'computer_call',
              arguments: undefined,
              call_id: 'call_zw3...',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
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
        input: 'Plot and analyse the histogram of the RGB channels for the uploaded image.',
      });

      expect(response.output_text).toContain('Here is the histogram of the RGB channels');
      expect(response.output).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: undefined,
            },
          ],
          finish_reason: 'stop',
        },
      ]);
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ig_123',
              name: 'image_generation_call',
            },
            {
              type: 'tool_call_response',
              id: 'ig_123',
              response: undefined,
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ig_124',
              name: 'image_generation_call',
            },
            {
              type: 'tool_call_response',
              id: 'ig_124',
              response: undefined,
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });

    it('records mcp calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'mcp',
          server_label: 'dmcp',
          server_description: 'A Dungeons and Dragons MCP server to assist with dice rolling.',
          server_url: 'https://dmcp-server.deno.dev/sse',
          require_approval: 'never',
          allowed_tools: ['roll'],
        },
      ];

      const response = await client.responses.create({
        model,
        tools,
        input:
          [
            {
              'role': 'user',
              'content': 'Roll 2d4+1'
            },
            {
              'id': 'mcpl_68a6102a4968819c8177b05584dd627b0679e572a900e618',
              'type': 'mcp_list_tools',
              'server_label': 'dmcp',
              'tools': [
                {
                  'annotations': null,
                  'description': 'Given a string of text describing a dice roll...',
                  'input_schema': {
                    '$schema': 'https://json-schema.org/draft/2020-12/schema',
                    'type': 'object',
                    'properties': {
                      'diceRollExpression': {
                        'type': 'string'
                      }
                    },
                    'required': ['diceRollExpression'],
                    'additionalProperties': false
                  },
                  'name': 'roll'
                }
              ]
            },
            {
              'id': 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339',
              'type': 'mcp_approval_request',
              'arguments': '{"diceRollExpression":"2d4 + 1"}',
              'name': 'roll',
              'server_label': 'dmcp'
            },
            {
              'type': 'mcp_approval_response',
              'approve': true,
              'approval_request_id': 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339'
            }
          ],
      });

      expect(response.output_text).toBe('');
      expect(response.output).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call_response',
              id: 'mcpl_68a6102a4968819c8177b05584dd627b0679e572a900e618',
              response: undefined,
              server: 'dmcp',
            },
          ],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339',
              name: 'mcp_approval_request',
              arguments: undefined,
              server: 'dmcp',
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              type: 'tool_call_response',
              response: undefined,
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'mcp_68a6102d8948819c9b1490d36d5ffa4a0679e572a900e618',
              name: 'roll',
              arguments: undefined,
              server: 'dmcp',
            },
            {
              type: 'tool_call_response',
              id: 'mcp_68a6102d8948819c9b1490d36d5ffa4a0679e572a900e618',
              response: undefined,
              server: 'dmcp',
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });

    it('handles connection errors without crashing', async () => {
      expect(
        new OpenAI({
          baseURL: 'http://localhost:9999/v5',
          apiKey,
        }).responses.create({
          model,
          input,
        })
      ).rejects.toThrow(OpenAI.APIConnectionError);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'localhost',
        [ATTR_SERVER_PORT]: 9999,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_ERROR_TYPE]: 'APIConnectionError',
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );
      expect(tokenUsage).toHaveLength(0);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'localhost',
            [ATTR_SERVER_PORT]: 9999,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_ERROR_TYPE]: 'APIConnectionError',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);
    });
  });

  describe('responses with content capture', function () {
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 3,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 22,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 3,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Answer in up to 3 words: Which ocean contains Bouvet Island?' }],
        }
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Atlantic Ocean.' }],
          finish_reason: 'stop'
        }

      ])
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

      const input: OpenAI.Responses.ResponseInput = [
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
        input,
        tools,
        parallel_tool_calls: true,
      });

      expect(response.output_text).toBe('');
      expect(response.output).toHaveLength(3);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
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
              content: 'What is the weather in Paris and Bogotá?',
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              'id': 'fc_12345xyz',
              'call_id': 'call_12345xyz',
              'type': 'tool_call',
              'name': 'get_weather',
              'arguments': '{"location":"Paris, France"}'
            },
            {
              'id': 'fc_67890abc',
              'call_id': 'call_67890abc',
              'type': 'tool_call',
              'name': 'get_weather',
              'arguments': '{"location":"Bogotá, Colombia"}'
            },
            {
              'id': 'fc_99999def',
              'call_id': 'call_99999def',
              'type': 'tool_call',
              'name': 'send_email',
              'arguments': '{"to":"bob@email.com","body":"Hi bob"}'
            }
          ],
          finish_reason: 'tool_call',
        },
      ]);
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [
            {
              type: 'text',
              content: 'Use the code_exec tool to print hello world to the console.',
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ctc_6890e975e86c819c9338825b3e1994810694874912ae0ea6',
              name: 'code_exec',
              arguments: 'print("hello world")',
              call_id: 'call_aGiFQkRWSWAIsMQ19fKqxUgb',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [
            {
              type: 'text',
              content: 'What is deep research by OpenAI?',
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'fs_67c09ccea8c48191ade9367e3ba71515',
              name: 'file_search_call',
              arguments: ['What is deep research?'],
            },
            {
              type: 'tool_call_response',
              id: 'fs_67c09ccea8c48191ade9367e3ba71515',
              response: expect.objectContaining({
                id: 'file-2dtbBZdjtDKS8eqWxqbgDi',
                filename: 'deep_research_blog.pdf',
                score: 0.95,
                text: expect.stringContaining('Lorem ipsum dolor'),
              }),
            },
            {
              type: 'text',
              content: expect.stringContaining('Deep research'),
            },
          ],
          finish_reason: 'stop',
        },
      ]);
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
        include: ['web_search_call.action.sources']
      });

      expect(response.output_text).toContain('On March 6, 2025, several news');
      expect(response.output).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop']
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [
            {
              type: 'text',
              content: 'What was a positive news story from today?',
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ws_67c9fa0502748190b7dd390736892e100be649c1a5ff9609',
              name: 'web_search_call',
              arguments: 'search',
            },
            {
              type: 'text',
              content: expect.stringContaining('On March 6, 2025'),
            },
          ],
          finish_reason: 'stop',
        },
      ]);
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [
            {
              type: 'text',
              content: 'Check the latest OpenAI news on bing.com.',
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: 'Clicking on the browser address bar.',
            },
            {
              type: 'tool_call',
              id: 'cu_67cc...',
              name: 'computer_call',
              arguments: {
                type: 'click',
                button: 'left',
                x: 156,
                y: 50,
              },
              call_id: 'call_zw3...',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
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
        input: 'Plot and analyse the histogram of the RGB channels for the uploaded image.',
      });

      expect(response.output_text).toContain('Here is the histogram of the RGB channels');
      expect(response.output).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [
            {
              type: 'text',
              content: 'Plot and analyse the histogram of the RGB channels for the uploaded image.',
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: expect.stringContaining('Here is the histogram of the RGB channels for the uploaded image'),
            },
          ],
          finish_reason: 'stop',
        },
      ]);
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [
            {
              type: 'text',
              content: 'Now make it look realistic',
            },
          ],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ig_123',
              name: 'image_generation_call',
            },
            {
              type: 'tool_call_response',
              id: 'ig_123',
              response: undefined,
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ig_124',
              name: 'image_generation_call',
            },
            {
              type: 'tool_call_response',
              id: 'ig_124',
              response: '...',
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });

    it('records mcp calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'mcp',
          server_label: 'dmcp',
          server_description: 'A Dungeons and Dragons MCP server to assist with dice rolling.',
          server_url: 'https://dmcp-server.deno.dev/sse',
          require_approval: 'never',
          allowed_tools: ['roll'],
        },
      ];

      const response = await client.responses.create({
        model,
        tools,
        input:
          [
            {
              'role': 'user',
              'content': 'Roll 2d4+1'
            },
            {
              'id': 'mcpl_68a6102a4968819c8177b05584dd627b0679e572a900e618',
              'type': 'mcp_list_tools',
              'server_label': 'dmcp',
              'tools': [
                {
                  'annotations': null,
                  'description': 'Given a string of text describing a dice roll...',
                  'input_schema': {
                    '$schema': 'https://json-schema.org/draft/2020-12/schema',
                    'type': 'object',
                    'properties': {
                      'diceRollExpression': {
                        'type': 'string'
                      }
                    },
                    'required': ['diceRollExpression'],
                    'additionalProperties': false
                  },
                  'name': 'roll'
                }
              ]
            },
            {
              'id': 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339',
              'type': 'mcp_approval_request',
              'arguments': '{"diceRollExpression":"2d4 + 1"}',
              'name': 'roll',
              'server_label': 'dmcp'
            },
            {
              'type': 'mcp_approval_response',
              'approve': true,
              'approval_request_id': 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339'
            }
          ],
      });

      expect(response.output_text).toBe('');
      expect(response.output).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [
            {
              type: 'text',
              content: 'Roll 2d4+1',
            },
          ],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call_response',
              id: 'mcpl_68a6102a4968819c8177b05584dd627b0679e572a900e618',
              response: expect.arrayContaining([
                expect.objectContaining({
                  name: 'roll',
                  description: 'Given a string of text describing a dice roll...',
                }),
              ]),
              server: 'dmcp',
            },
          ],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339',
              name: 'mcp_approval_request: roll',
              arguments: '{"diceRollExpression":"2d4 + 1"}',
              server: 'dmcp',
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              type: 'tool_call_response',
              response: true,
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'mcp_68a6102d8948819c9b1490d36d5ffa4a0679e572a900e618',
              name: 'roll',
              arguments: 'roll({"diceRollExpression":"2d4 + 1"})',
              server: 'dmcp',
            },
            {
              type: 'tool_call_response',
              id: 'mcp_68a6102d8948819c9b1490d36d5ffa4a0679e572a900e618',
              response: '4',
              server: 'dmcp',
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });
  });

  describe('streaming responses', function () {
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 3,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 22,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 3,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        }
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: undefined }],
          finish_reason: 'stop'
        }
      ]);
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

      const input: OpenAI.Responses.ResponseInput = [
        {
          role: 'system',
          content: 'You are a helpful assistant providing weather updates.',
        },
        {
          role: 'user',
          content: 'What is the weather in Paris and Bogotá?',
        },
      ];
      const stream = client.responses.stream({
        model,
        input,
        tools,
        parallel_tool_calls: true,
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(3);
      expect(doneEvents).toHaveLength(3);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'system',
          parts: [{ type: 'text', content: undefined }],
        },
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'fc_12345xyz',
              name: 'get_weather',
              arguments: undefined,
              call_id: 'call_12345xyz',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[2].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[2].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'fc_67890abc',
              name: 'get_weather',
              arguments: undefined,
              call_id: 'call_67890abc',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
      expect(logs[3].spanContext).toEqual(spanCtx);
      expect(logs[3].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[3].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[3].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'fc_99999def',
              name: 'send_email',
              arguments: undefined,
              call_id: 'call_99999def',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
    });

    it('records custom tool calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'custom',
          name: 'code_exec',
          description: 'Executes arbitrary Python code.',
        },
      ];

      const stream = client.responses.stream({
        model,
        input: 'Use the code_exec tool to print hello world to the console.',
        tools,
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(2);
      expect(doneEvents).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [],
          finish_reason: 'stop',
        },
      ]);
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[2].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[2].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ctc_6890e975e86c819c9338825b3e1994810694874912ae0ea6',
              name: 'code_exec',
              arguments: undefined,
              call_id: 'call_aGiFQkRWSWAIsMQ19fKqxUgb',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
    });

    it('records file search calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'file_search',
          vector_store_ids: ['<vector_store_id>'],
          max_num_results: 2,
        },
      ];

      const stream = client.responses.stream({
        model,
        input: 'What is deep research by OpenAI?',
        tools,
        include: ['file_search_call.results'],
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(2);
      expect(doneEvents).toHaveLength(2);

      const messageEvent = doneEvents.find(event => event.item.type === 'message');
      expect(messageEvent).toBeDefined();
      expect(messageEvent?.item.content[0].text).toEqual(
        expect.stringContaining('Deep research')
      );

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'fs_67c09ccea8c48191ade9367e3ba71515',
              name: 'file_search_call',
              arguments: undefined,
            },
            {
              type: 'tool_call_response',
              id: 'fs_67c09ccea8c48191ade9367e3ba71515',
              response: undefined,
            },
          ],
          finish_reason: 'stop',
        },
      ]);
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[2].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[2].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: undefined,
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });

    it('records web search calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'web_search',
        },
      ];

      const stream = client.responses.stream({
        model,
        input: 'What was a positive news story from today?',
        tools,
        include: ['web_search_call.action.sources'],
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(2);
      expect(doneEvents).toHaveLength(2);

      const messageEvent = doneEvents.find(event => event.item.type === 'message');
      expect(messageEvent).toBeDefined();
      expect(messageEvent?.item.content[0].text).toContain('On March 6, 2025, several news');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toMatchObject({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
      });
      expect(spans[0].attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual(['stop']);

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ws_67c9fa0502748190b7dd390736892e100be649c1a5ff9609',
              name: 'web_search_call',
              arguments: undefined,
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[2].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[2].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: undefined,
            },
          ],
          finish_reason: 'stop',
        },
      ]);
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

      const stream = client.responses.stream({
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

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(2);
      expect(doneEvents).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: undefined,
            },
          ],
          finish_reason: 'stop',
        },
      ]);
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[2].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[2].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'cu_67cc...',
              name: 'computer_call',
              arguments: undefined,
              call_id: 'call_zw3...',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
    });

    it('records code interpreter calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'code_interpreter',
          container: 'cfile_682e0e8a43c88191a7978f477a09bdf5',
        },
      ];

      const stream = client.responses.stream({
        model,
        tools,
        instructions: null,
        input: 'Plot and analyse the histogram of the RGB channels for the uploaded image.',
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(1);
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0].item.content[0].text).toContain('Here is the histogram of the RGB channels');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: undefined,
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });

    it('records image generation call', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'image_generation',
        },
      ];

      const stream = client.responses.stream({
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

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(1);
      expect(doneEvents).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [
            {
              type: 'text',
              content: undefined,
            },
          ],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ig_123',
              name: 'image_generation_call',
              arguments: undefined,
            },
            {
              type: 'tool_call_response',
              id: 'ig_123',
              response: undefined,
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ig_124',
              name: 'image_generation_call',
            },
            {
              type: 'tool_call_response',
              id: 'ig_124',
              response: undefined,
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });

    it('records mcp calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'mcp',
          server_label: 'dmcp',
          server_description: 'A Dungeons and Dragons MCP server to assist with dice rolling.',
          server_url: 'https://dmcp-server.deno.dev/sse',
          require_approval: 'never',
          allowed_tools: ['roll'],
        },
      ];

      const stream = client.responses.stream({
        model,
        tools,
        input: [
          {
            role: 'user',
            content: 'Roll 2d4+1'
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
                  '$schema': 'https://json-schema.org/draft/2020-12/schema',
                  type: 'object',
                  properties: {
                    diceRollExpression: {
                      type: 'string'
                    }
                  },
                  required: ['diceRollExpression'],
                  additionalProperties: false
                },
                name: 'roll'
              }
            ]
          },
          {
            id: 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339',
            type: 'mcp_approval_request',
            arguments: '{"diceRollExpression":"2d4 + 1"}',
            name: 'roll',
            server_label: 'dmcp'
          },
          {
            type: 'mcp_approval_response',
            approve: true,
            approval_request_id: 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339'
          }
        ],
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(1);
      expect(doneEvents).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call_response',
              id: 'mcpl_68a6102a4968819c8177b05584dd627b0679e572a900e618',
              response: undefined,
              server: 'dmcp',
            },
          ],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339',
              name: 'mcp_approval_request',
              arguments: undefined,
              server: 'dmcp',
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              type: 'tool_call_response',
              response: undefined,
            },
          ],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'mcp_68a6102d8948819c9b1490d36d5ffa4a0679e572a900e618',
              name: 'roll',
              arguments: undefined,
              server: 'dmcp',
            },
            {
              type: 'tool_call_response',
              id: 'mcp_68a6102d8948819c9b1490d36d5ffa4a0679e572a900e618',
              response: undefined,
              server: 'dmcp',
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });

    it('does not misbehave with double iteration', async () => {
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
      expect(async () => {
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') {
            content += event.delta;
          }
        }
      }).rejects.toThrow();
      expect(content).toEqual('South Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 4,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: undefined }],
        }
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: undefined }],
          finish_reason: 'stop'
        }
      ]);
    });
  });

  describe('streaming responses with content capture', function () {
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
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 3,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 22,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 3,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Answer in up to 3 words: Which ocean contains Bouvet Island?' }],
        }
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Atlantic Ocean.' }],
          finish_reason: 'stop'
        }
      ]);
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

      const input: OpenAI.Responses.ResponseInput = [
        {
          role: 'system',
          content: 'You are a helpful assistant providing weather updates.',
        },
        {
          role: 'user',
          content: 'What is the weather in Paris and Bogotá?',
        },
      ];
      const stream = client.responses.stream({
        model,
        input,
        tools,
        parallel_tool_calls: true,
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(3);
      expect(doneEvents).toHaveLength(3);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'system',
          parts: [{ type: 'text', content: 'You are a helpful assistant providing weather updates.' }],
        },
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is the weather in Paris and Bogotá?' }],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'fc_12345xyz',
              name: 'get_weather',
              arguments: '{"location":"Paris, France"}',
              call_id: 'call_12345xyz',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[2].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[2].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'fc_67890abc',
              name: 'get_weather',
              arguments: '{"location":"Bogotá, Colombia"}',
              call_id: 'call_67890abc',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
      expect(logs[3].spanContext).toEqual(spanCtx);
      expect(logs[3].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[3].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[3].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'fc_99999def',
              name: 'send_email',
              arguments: '{"to":"bob@email.com","body":"Hi bob"}',
              call_id: 'call_99999def',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
    });

    it('records custom tool calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'custom',
          name: 'code_exec',
          description: 'Executes arbitrary Python code.',
        },
      ];

      const stream = client.responses.stream({
        model,
        input: 'Use the code_exec tool to print hello world to the console.',
        tools,
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(2);
      expect(doneEvents).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Use the code_exec tool to print hello world to the console.' }],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [],
          finish_reason: 'stop',
        },
      ]);
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[2].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[2].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ctc_6890e975e86c819c9338825b3e1994810694874912ae0ea6',
              name: 'code_exec',
              arguments: 'print("hello world")',
              call_id: 'call_aGiFQkRWSWAIsMQ19fKqxUgb',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
    });

    it('records file search calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'file_search',
          vector_store_ids: ['<vector_store_id>'],
          max_num_results: 2,
        },
      ];

      const stream = client.responses.stream({
        model,
        input: 'What is deep research by OpenAI?',
        tools,
        include: ['file_search_call.results'],
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(2);
      expect(doneEvents).toHaveLength(2);

      const messageEvent = doneEvents.find(event => event.item.type === 'message');
      expect(messageEvent).toBeDefined();
      expect(messageEvent?.item.content[0].text).toEqual(
        expect.stringContaining('Deep research')
      );

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is deep research by OpenAI?' }],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'fs_67c09ccea8c48191ade9367e3ba71515',
              name: 'file_search_call',
              arguments: ['What is deep research?'],
            },
            {
              type: 'tool_call_response',
              id: 'fs_67c09ccea8c48191ade9367e3ba71515',
              response: { filename: 'deep_research_blog.pdf', id: 'file-2dtbBZdjtDKS8eqWxqbgDi', score: 0.95, text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed euismod, nisl eget aliquam aliquet, nunc nisl aliquet nisl, eget aliquam nisl nisl eget nisl. Sed euismod, nisl eget aliquam aliquet, nunc nisl aliquet nisl, eget aliquam nisl nisl eget nisl.' },
            },
          ],
          finish_reason: 'stop',
        },
      ]);
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[2].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[2].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: expect.stringContaining('Deep research'),
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });

    it('records web search calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'web_search',
        },
      ];

      const stream = client.responses.stream({
        model,
        input: 'What was a positive news story from today?',
        tools,
        include: ['web_search_call.action.sources'],
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(2);
      expect(doneEvents).toHaveLength(2);

      const messageEvent = doneEvents.find(event => event.item.type === 'message');
      expect(messageEvent).toBeDefined();
      expect(messageEvent?.item.content[0].text).toContain('On March 6, 2025, several news');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toMatchObject({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
      });
      expect(spans[0].attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual(['stop']);

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What was a positive news story from today?' }],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ws_67c9fa0502748190b7dd390736892e100be649c1a5ff9609',
              name: 'web_search_call',
              arguments: 'search',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[2].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[2].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: 'On March 6, 2025, several news...',
            },
          ],
          finish_reason: 'stop',
        },
      ]);
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

      const stream = client.responses.stream({
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

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(2);
      expect(doneEvents).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['tool_call'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: computerModel,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'computer-use-preview-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Check the latest OpenAI news on bing.com.' }],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: 'Clicking on the browser address bar.',
            },
          ],
          finish_reason: 'stop',
        },
      ]);
      expect(logs[2].spanContext).toEqual(spanCtx);
      expect(logs[2].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[2].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[2].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'cu_67cc...',
              name: 'computer_call',
              arguments: { button: 'left', type: 'click', x: 156, y: 50 },
              call_id: 'call_zw3...',
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
    });

    it('records code interpreter calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'code_interpreter',
          container: 'cfile_682e0e8a43c88191a7978f477a09bdf5',
        },
      ];

      const stream = client.responses.stream({
        model,
        tools,
        instructions: null,
        input: 'Plot and analyse the histogram of the RGB channels for the uploaded image.',
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(1);
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0].item.content[0].text).toContain('Here is the histogram of the RGB channels');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Plot and analyse the histogram of the RGB channels for the uploaded image.' }],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: 'Here is the histogram of the RGB channels for the uploaded image. Each curve represents the distribution of pixel intensities for the red, green, and blue channels. Peaks toward the high end of the intensity scale (right-hand side) suggest a lot of brightness and strong warm tones, matching the orange and light background in the image. If you want a different style of histogram (e.g., overall intensity, or quantized color groups), let me know!',
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });

    it('records image generation call', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'image_generation',
        },
      ];

      const stream = client.responses.stream({
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

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(1);
      expect(doneEvents).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [
            {
              type: 'text',
              content: 'Now make it look realistic',
            },
          ],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ig_123',
              name: 'image_generation_call',
            },
            {
              type: 'tool_call_response',
              id: 'ig_123',
              response: undefined,
            },
          ],
        },
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'ig_124',
              name: 'image_generation_call',
            },
            {
              type: 'tool_call_response',
              id: 'ig_124',
              response: '...',
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });

    it('records mcp calls', async () => {
      const tools: OpenAI.Responses.Tool[] = [
        {
          type: 'mcp',
          server_label: 'dmcp',
          server_description: 'A Dungeons and Dragons MCP server to assist with dice rolling.',
          server_url: 'https://dmcp-server.deno.dev/sse',
          require_approval: 'never',
          allowed_tools: ['roll'],
        },
      ];

      const stream = client.responses.stream({
        model,
        tools,
        input: [
          {
            role: 'user',
            content: 'Roll 2d4+1'
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
                  '$schema': 'https://json-schema.org/draft/2020-12/schema',
                  type: 'object',
                  properties: {
                    diceRollExpression: {
                      type: 'string'
                    }
                  },
                  required: ['diceRollExpression'],
                  additionalProperties: false
                },
                name: 'roll'
              }
            ]
          },
          {
            id: 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339',
            type: 'mcp_approval_request',
            arguments: '{"diceRollExpression":"2d4 + 1"}',
            name: 'roll',
            server_label: 'dmcp'
          },
          {
            type: 'mcp_approval_response',
            approve: true,
            approval_request_id: 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339'
          }
        ],
      });

      const events: Array<any> = [];
      for await (const event of stream) {
        events.push(event);
      }

      const completedEvent = events.find(event => event.type === 'response.completed');
      const doneEvents = events.filter(event => event.type === 'response.output_item.done');

      expect(completedEvent?.response.output).toHaveLength(1);
      expect(doneEvents).toHaveLength(1);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 291,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 23,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);
      expect(tokenUsage[0].descriptor).toMatchObject({
        name: 'gen_ai.client.token.usage',
        type: 'HISTOGRAM',
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(tokenUsage[0].dataPoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 291,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 23,
            }),
            attributes: {
              [ATTR_SERVER_ADDRESS]: 'api.openai.com',
              [ATTR_SERVER_PORT]: 443,
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
              [ATTR_GEN_AI_REQUEST_MODEL]: model,
              [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            },
          }),
        ])
      );

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(operationDuration[0].dataPoints.length).toBe(1);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4.1-2025-04-14',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(1 + doneEvents.length);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Roll 2d4+1' }],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call_response',
              id: 'mcpl_68a6102a4968819c8177b05584dd627b0679e572a900e618',
              response: [{ annotations: null, description: 'Given a string of text describing a dice roll...', input_schema: { '$schema': 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { diceRollExpression: { type: 'string' } }, required: ['diceRollExpression'], additionalProperties: false }, name: 'roll' }],
              server: 'dmcp',
            },
          ],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'mcpr_68a619e1d82c8190b50c1ccba7ad18ef0d2d23a86136d339',
              name: 'mcp_approval_request: roll',
              arguments: '{"diceRollExpression":"2d4 + 1"}',
              server: 'dmcp',
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              type: 'tool_call_response',
              response: true,
            },
          ],
        },
      ]);

      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'mcp_68a6102d8948819c9b1490d36d5ffa4a0679e572a900e618',
              name: 'roll',
              arguments: 'roll({"diceRollExpression":"2d4 + 1"})',
              server: 'dmcp',
            },
            {
              type: 'tool_call_response',
              id: 'mcp_68a6102d8948819c9b1490d36d5ffa4a0679e572a900e618',
              response: '4',
              server: 'dmcp',
            },
          ],
          finish_reason: 'stop',
        },
      ]);
    });

    it('does not misbehave with double iteration', async () => {
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
      expect(async () => {
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') {
            content += event.delta;
          }
        }
      }).rejects.toThrow();
      expect(content).toEqual('South Atlantic Ocean.');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: model,
        [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
        [ATTR_GEN_AI_RESPONSE_ID]: expect.stringMatching(/^resp_/),
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 4,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['stop'],
      });

      await meterProvider.forceFlush();
      const [resourceMetrics] = metricExporter.getMetrics();
      expect(resourceMetrics.scopeMetrics.length).toBe(1);
      const scopeMetrics = resourceMetrics.scopeMetrics[0];
      const tokenUsage = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.token.usage'
      );

      expect(tokenUsage.length).toBe(1);

      const operationDuration = scopeMetrics.metrics.filter(
        m => m.descriptor.name === 'gen_ai.client.operation.duration'
      );
      expect(operationDuration.length).toBe(1);
      expect(operationDuration[0].descriptor).toMatchObject({
        name: 'gen_ai.client.operation.duration',
        type: 'HISTOGRAM',
        description: 'GenAI operation duration',
        unit: 's',
      });
      expect(tokenUsage[0].dataPoints.length).toBe(2);
      expect(operationDuration[0].dataPoints).toEqual([
        expect.objectContaining({
          value: expect.objectContaining({
            sum: expect.any(Number),
          }),
          attributes: {
            [ATTR_SERVER_ADDRESS]: 'api.openai.com',
            [ATTR_SERVER_PORT]: 443,
            [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
            [ATTR_GEN_AI_REQUEST_MODEL]: model,
            [ATTR_GEN_AI_RESPONSE_MODEL]: 'gpt-4o-mini-2024-07-18',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);

      const spanCtx = spans[0].spanContext();

      await loggerProvider.forceFlush();
      const logs = logsExporter.getFinishedLogRecords();
      expect(logs.length).toBe(2);
      expect(logs[0].spanContext).toEqual(spanCtx);
      expect(logs[0].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[0].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[0].body).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Answer in up to 3 words: Which ocean contains Bouvet Island?' }],
        }
      ]);
      expect(logs[1].spanContext).toEqual(spanCtx);
      expect(logs[1].eventName).toEqual(EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS);
      expect(logs[1].attributes).toEqual({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined
        // TODO: When test fails, replace undefined with the contents of body, and remove the contents of body from implementation and tests
      });
      expect(logs[1].body).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'South Atlantic Ocean.' }],
          finish_reason: 'stop'
        }
      ]);
    });
  });
});
