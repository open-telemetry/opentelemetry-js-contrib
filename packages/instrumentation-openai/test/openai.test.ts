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
import { Definition, back as nockBack } from 'nock';
import { OpenAI } from 'openai';
import * as path from 'path';

import {
  ATTR_EVENT_NAME,
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MODEL,
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
  ATTR_GEN_AI_TOKEN_TYPE,
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
});
