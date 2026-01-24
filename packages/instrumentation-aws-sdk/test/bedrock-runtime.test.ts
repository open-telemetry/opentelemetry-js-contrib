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
 * to 'update' - when recording responses, valid AWS credentials for
 * accessing bedrock are also required. To record for new tests while
 * keeping existing recordings, set NOCK_BACK_MODE to 'record'.
 */

import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import { meterProvider, metricExporter } from './load-instrumentation';

import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  ConversationRole,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { AwsCredentialIdentity } from '@aws-sdk/types';
import * as path from 'path';
import { Definition, back as nockBack } from 'nock';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
} from '../src/semconv';
import { expect } from 'expect';

const region = 'us-east-1';

// Remove any data from recorded responses that could have sensitive data
// and that we don't need for testing.
const sanitizeRecordings = (scopes: Definition[]) => {
  for (const scope of scopes) {
    // Type definition seems to be incorrect of headers.
    const headers: string[] = (scope as any).rawHeaders;
    for (let i = 0; i < headers.length; i += 2) {
      if (headers[i].toLowerCase() === 'set-cookie') {
        headers.splice(i, 2);
      }
    }
  }
  return scopes;
};

describe('Bedrock', () => {
  nockBack.fixtures = path.join(__dirname, 'mock-responses');
  let credentials: AwsCredentialIdentity | undefined;

  if (nockBack.currentMode === 'dryrun') {
    credentials = {
      accessKeyId: 'testing',
      secretAccessKey: 'testing',
    };
  }

  // Use NodeHttpHandler to use HTTP instead of HTTP2 because nock does not support HTTP2
  const client = new BedrockRuntimeClient({
    region,
    credentials,
    requestHandler: new NodeHttpHandler(),
  });

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

    await meterProvider.forceFlush();
    metricExporter.reset();
  });

  describe('Converse', () => {
    it('adds genai conventions', async () => {
      const modelId = 'amazon.titan-text-lite-v1';
      const messages = [
        {
          role: ConversationRole.USER,
          content: [{ text: 'Say this is a test' }],
        },
      ];
      const inferenceConfig = {
        maxTokens: 10,
        temperature: 0.8,
        topP: 1,
        stopSequences: ['|'],
      };

      const command = new ConverseCommand({
        modelId,
        messages,
        inferenceConfig,
      });
      const response = await client.send(command);
      expect(response.output?.message?.content?.[0].text).toBe(
        "Hi. I'm not sure what"
      );

      const testSpans: ReadableSpan[] = getTestSpans();
      const converseSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'chat amazon.titan-text-lite-v1';
        }
      );
      expect(converseSpans.length).toBe(1);
      expect(converseSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
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
              sum: 8,
            }),
            attributes: {
              'gen_ai.system': 'aws.bedrock',
              'gen_ai.operation.name': 'chat',
              'gen_ai.request.model': 'amazon.titan-text-lite-v1',
              'gen_ai.token.type': 'input',
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 10,
            }),
            attributes: {
              'gen_ai.system': 'aws.bedrock',
              'gen_ai.operation.name': 'chat',
              'gen_ai.request.model': 'amazon.titan-text-lite-v1',
              'gen_ai.token.type': 'output',
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
            'gen_ai.system': 'aws.bedrock',
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': 'amazon.titan-text-lite-v1',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);
    });
  });

  describe('ConverseStream', () => {
    it('adds genai conventions', async () => {
      const modelId = 'amazon.titan-text-lite-v1';
      const messages = [
        {
          role: ConversationRole.USER,
          content: [{ text: 'Say this is a test' }],
        },
      ];
      const inferenceConfig = {
        maxTokens: 10,
        temperature: 0.8,
        topP: 1,
        stopSequences: ['|'],
      };

      const command = new ConverseStreamCommand({
        modelId,
        messages,
        inferenceConfig,
      });

      const response = await client.send(command);
      const chunks: string[] = [];
      for await (const item of response.stream!) {
        const text = item.contentBlockDelta?.delta?.text;
        if (text) {
          chunks.push(text);
        }
      }
      expect(chunks.join('')).toBe('Hi! How are you? How');

      const testSpans: ReadableSpan[] = getTestSpans();
      const converseSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'chat amazon.titan-text-lite-v1';
        }
      );
      expect(converseSpans.length).toBe(1);
      expect(converseSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
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
              sum: 8,
            }),
            attributes: {
              'gen_ai.system': 'aws.bedrock',
              'gen_ai.operation.name': 'chat',
              'gen_ai.request.model': 'amazon.titan-text-lite-v1',
              'gen_ai.token.type': 'input',
            },
          }),
          expect.objectContaining({
            value: expect.objectContaining({
              sum: 10,
            }),
            attributes: {
              'gen_ai.system': 'aws.bedrock',
              'gen_ai.operation.name': 'chat',
              'gen_ai.request.model': 'amazon.titan-text-lite-v1',
              'gen_ai.token.type': 'output',
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
            'gen_ai.system': 'aws.bedrock',
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': 'amazon.titan-text-lite-v1',
          },
        }),
      ]);
      expect(
        (operationDuration[0].dataPoints[0].value as any).sum
      ).toBeGreaterThan(0);
    });
  });

  describe('InvokeModel', () => {
    it('adds amazon titan model attributes to span', async () => {
      const modelId = 'amazon.titan-text-express-v1';
      const inputText = 'Say this is a test';
      const textGenerationConfig = {
        maxTokenCount: 10,
        temperature: 0.8,
        topP: 1,
        stopSequences: ['|'],
      };
      const body: any = {
        inputText,
        textGenerationConfig,
      };

      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(body),
      });
      const response = await client.send(command);
      const output = JSON.parse(response.body.transformToString());
      expect(output.results[0].outputText).toBe(
        '\nHello! I am a computer program designed to'
      );

      const testSpans: ReadableSpan[] = getTestSpans();
      const invokeModelSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'BedrockRuntime.InvokeModel';
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
      });
    });
    it('adds amazon nova model attributes to span', async () => {
      const modelId = 'amazon.nova-pro-v1:0';
      const prompt = 'Say this is a test';
      const nativeRequest: any = {
        inputText: prompt,
        inferenceConfig: {
          max_new_tokens: 10,
          temperature: 0.8,
          top_p: 1,
          stopSequences: ['|'],
        },
      };
      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(nativeRequest),
      });
      const response = await client.send(command);
      const output = JSON.parse(response.body.transformToString());
      expect(output.output.message.content[0].text).toBe(
        '\nHello! I am a computer program designed to'
      );

      const testSpans: ReadableSpan[] = getTestSpans();
      const invokeModelSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'BedrockRuntime.InvokeModel';
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
      });
    });
    it('adds anthropic claude model attributes to span', async () => {
      const modelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0';
      const prompt = 'Say this is a test';
      const nativeRequest: any = {
        anthropic_version: 'bedrock-2023-05-31',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
        max_tokens: 10,
        temperature: 0.8,
        top_p: 1,
        stop_sequences: ['|'],
      };
      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(nativeRequest),
      });
      const response = await client.send(command);
      const output = JSON.parse(response.body.transformToString());
      expect(output.completion).toBe(
        '\nHello! I am a computer program designed to'
      );

      const testSpans: ReadableSpan[] = getTestSpans();
      const invokeModelSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'BedrockRuntime.InvokeModel';
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
      });
    });
    it('adds cohere command model attributes to span', async () => {
      const modelId = 'cohere.command-light-text-v14';
      const prompt = 'Say this is a test Say this is a test Say this';
      const nativeRequest: any = {
        prompt: prompt,
        max_tokens: 10,
        temperature: 0.8,
        p: 1,
        stop_sequences: ['|'],
      };
      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(nativeRequest),
      });
      const response = await client.send(command);
      const output = JSON.parse(response.body.transformToString());
      expect(output.generations[0].text).toBe(
        '\nHello! I am a computer program designed to help you with'
      );

      const testSpans: ReadableSpan[] = getTestSpans();
      const invokeModelSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'BedrockRuntime.InvokeModel';
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
      });
    });
    it('adds cohere command r model attributes to span', async () => {
      const modelId = 'cohere.command-r-v1:0';
      const prompt = 'Say this is a test Say this is a test Say this';
      const nativeRequest: any = {
        message: prompt,
        max_tokens: 10,
        temperature: 0.8,
        p: 1,
        stop_sequences: ['|'],
      };
      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(nativeRequest),
      });
      const response = await client.send(command);
      const output = JSON.parse(response.body.transformToString());
      expect(output.text).toBe(
        '\nHello! I am a computer program designed to help you with'
      );

      const testSpans: ReadableSpan[] = getTestSpans();
      const invokeModelSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'BedrockRuntime.InvokeModel';
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
      });
    });
    it('adds meta llama model attributes to span', async () => {
      const modelId = 'meta.llama2-13b-chat-v1';
      const prompt = 'Say this is a test';
      const nativeRequest: any = {
        prompt: prompt,
        max_gen_len: 10,
        temperature: 0.8,
        top_p: 1,
      };
      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(nativeRequest),
      });
      const response = await client.send(command);
      const output = JSON.parse(response.body.transformToString());
      expect(output.generation).toBe(
        '\nHello! I am a computer program designed to'
      );

      const testSpans: ReadableSpan[] = getTestSpans();
      const invokeModelSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'BedrockRuntime.InvokeModel';
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
      });
    });
    it('adds mistral ai model attributes to span', async () => {
      const modelId = 'mistral.mistral-7b-instruct-v0:2';
      const prompt = 'Say this is a test Say this is a test Say this';
      const nativeRequest: any = {
        prompt: prompt,
        max_tokens: 10,
        temperature: 0.8,
        top_p: 1,
        stop: ['|'],
      };
      const command = new InvokeModelCommand({
        modelId,
        body: JSON.stringify(nativeRequest),
      });
      const response = await client.send(command);
      const output = JSON.parse(response.body.transformToString());
      expect(output.outputs[0].text).toBe(
        '\nHello! I am a computer program designed to help you with'
      );

      const testSpans: ReadableSpan[] = getTestSpans();
      const invokeModelSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'BedrockRuntime.InvokeModel';
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
      });
    });
  });

  describe('InvokeModelWithStreams', () => {
    it('adds amazon titan model attributes to span', async () => {
      const modelId = 'amazon.titan-text-lite-v1';
      const prompt = '\n\nHuman: Hello, How are you today? \n\nAssistant:';

      const body = {
        inputText: prompt,
        textGenerationConfig: {
          maxTokenCount: 10,
          temperature: 0.8,
          topP: 1,
          stopSequences: ['|'],
        },
      };
      const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        body: JSON.stringify(body),
        contentType: 'application/json',
        accept: 'application/json',
      });

      const response = await client.send(command);

      let collectedText = '';
      if (!response.body) return;
      for await (const chunk of response.body) {
        if (chunk?.chunk?.bytes instanceof Uint8Array) {
          const parsed = JSON.parse(decodeChunk(chunk));
          collectedText += parsed.outputText;
        }
      }
      expect(collectedText).toBe(" Hello there! I'm doing well. Thank you");

      const invokeModelSpans: ReadableSpan[] =
        getInvokeModelWithResponseStreamSpans();

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 13,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['LENGTH'],
      });
    });
    it('adds claude model attributes to span', async () => {
      const modelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0';
      const prompt = '\n\nHuman: Hello, How are you today? \n\nAssistant:';

      const body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 12,
        top_k: 250,
        stop_sequences: ['|'],
        temperature: 0.8,
        top_p: 1,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      };

      const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        body: JSON.stringify(body),
        contentType: 'application/json',
        accept: 'application/json',
      });

      const response = await client.send(command);

      let collectedText = '';
      if (!response.body) return;
      for await (const chunk of response.body) {
        if (chunk?.chunk?.bytes instanceof Uint8Array) {
          const parsed = JSON.parse(decodeChunk(chunk));
          if (
            parsed.type === 'content_block_delta' &&
            parsed.delta?.type === 'text_delta'
          ) {
            collectedText += parsed.delta.text;
          }
        }
      }
      expect(collectedText).toBe(
        "Hello! I'm doing well, thank you for asking."
      );

      const invokeModelSpans: ReadableSpan[] =
        getInvokeModelWithResponseStreamSpans();

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 12,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 1,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
      });
    });

    it('adds amazon nova model attributes to span', async () => {
      const modelId = 'amazon.nova-pro-v1:0';
      const prompt = 'Say this is a test';
      const nativeRequest: any = {
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: {
          max_new_tokens: 10,
          temperature: 0.8,
          top_p: 1,
          stopSequences: ['|'],
        },
      };
      const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        body: JSON.stringify(nativeRequest),
      });

      const response = await client.send(command);

      let collectedText = '';
      if (!response.body) return;
      for await (const chunk of response.body) {
        if (chunk?.chunk?.bytes instanceof Uint8Array) {
          const parsed = JSON.parse(decodeChunk(chunk));
          if (parsed.contentBlockDelta?.delta) {
            collectedText += parsed.contentBlockDelta?.delta.text;
          }
        }
      }

      expect(collectedText).toBe(
        "Certainly! If you're indicating that this interaction"
      );

      const invokeModelSpans: ReadableSpan[] =
        getInvokeModelWithResponseStreamSpans();

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 5,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['max_tokens'],
      });
    });

    it('adds mistral ai model attributes to span', async () => {
      const modelId = 'mistral.mistral-small-2402-v1:0';

      const prompt = '\n\nHuman: Hello, How are you today? \n\nAssistant:';
      const nativeRequest: any = {
        prompt: prompt,
        max_tokens: 20,
        temperature: 0.8,
        top_p: 1,
        stop: ['|'],
      };
      const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        body: JSON.stringify(nativeRequest),
      });

      const response = await client.send(command);

      let collectedText = '';
      if (!response.body) return;
      for await (const chunk of response.body) {
        if (chunk?.chunk?.bytes instanceof Uint8Array) {
          const parsed = JSON.parse(decodeChunk(chunk));

          if (parsed.outputs[0].text) {
            collectedText += parsed.outputs[0].text;
          }
        }
      }
      expect(collectedText).toBe(
        " I'm an AI, so I don't have feelings, but I'm functioning well"
      );

      const invokeModelSpans: ReadableSpan[] =
        getInvokeModelWithResponseStreamSpans();

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 20,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 1,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
      });
    });

    it('adds cohere command r model attributes to span', async () => {
      const modelId = 'cohere.command-r-v1:0';
      const prompt = 'Say this is a test';
      const nativeRequest: any = {
        message: prompt,
        max_tokens: 10,
        temperature: 0.8,
        p: 0.99,
        stop_sequences: ['|'],
      };

      const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        body: JSON.stringify(nativeRequest),
      });

      const response = await client.send(command);

      let collectedText = '';
      if (!response.body) return;
      for await (const chunk of response.body) {
        if (chunk?.chunk?.bytes instanceof Uint8Array) {
          const parsed = JSON.parse(decodeChunk(chunk));
          if (parsed.text) {
            collectedText += parsed.text;
          }
        }
      }
      expect(collectedText).toBe("This is indeed a test. Hopefully, it's");

      const invokeModelSpans: ReadableSpan[] =
        getInvokeModelWithResponseStreamSpans();

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 0.99,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 3,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 1,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['MAX_TOKENS'],
      });
    });

    it('adds cohere command model attributes to span', async () => {
      const modelId = 'cohere.command-light-text-v14';
      const prompt = 'Say this is a test';
      const nativeRequest: any = {
        prompt: prompt,
        max_tokens: 10,
        temperature: 0.8,
        p: 1,
        stop_sequences: ['|'],
      };

      const command = new InvokeModelWithResponseStreamCommand({
        modelId,
        body: JSON.stringify(nativeRequest),
      });

      const response = await client.send(command);

      let collectedText = '';
      if (!response.body) return;
      for await (const chunk of response.body) {
        if (chunk?.chunk?.bytes instanceof Uint8Array) {
          const parsed = JSON.parse(decodeChunk(chunk));
          if (parsed.generations[0].text) {
            collectedText += parsed.generations[0].text;
          }
        }
      }
      expect(collectedText).toBe(
        ' Okay, I will follow your instructions and this will'
      );

      const invokeModelSpans: ReadableSpan[] =
        getInvokeModelWithResponseStreamSpans();

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_SYSTEM]: GEN_AI_SYSTEM_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 3,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 9,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['MAX_TOKENS'],
      });
    });
  });

  function getInvokeModelWithResponseStreamSpans(): ReadableSpan[] {
    return getTestSpans().filter((s: ReadableSpan) => {
      return s.name === 'BedrockRuntime.InvokeModelWithResponseStream';
    });
  }

  function decodeChunk(chunk: any) {
    return Buffer.from(chunk.chunk.bytes).toString('utf-8');
  }
});
