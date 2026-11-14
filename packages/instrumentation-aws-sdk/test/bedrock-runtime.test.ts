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
 * to 'update' - when recording responses, valid AWS credentials for
 * accessing bedrock are also required. To record for new tests while
 * keeping existing recordings, set NOCK_BACK_MODE to 'record'.
 */

import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import {
  instrumentation,
  meterProvider,
  metricExporter,
} from './load-instrumentation';

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

import {
  DiagLogLevel,
  DiagLogger,
  SpanKind,
  SpanStatusCode,
  diag,
} from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace';
import {
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
} from '../src/semconv';
import { expect } from 'expect';
import { TelemetryHandler } from '@opentelemetry/genai-util';
import { HTTP_SPAN_NAME, TracedHttpHandler } from './traced-http-handler';

const region = 'us-east-1';

// Tests that send exactly the same request as another test replay its recording.
const SHARED_RECORDINGS: Record<string, string> = {
  'bedrock-converse-parents-http-spans-under-the-genai-span':
    'bedrock-converse-adds-genai-conventions',
  'bedrock-conversestream-with-content-capture-ends-a-failed-request-span-once-with-error-status':
    'bedrock-conversestream-with-content-capture-records-invalid-model-errors',
  'bedrock-conversestream-ends-the-span-when-the-invocation-cannot-be-started':
    'bedrock-conversestream-adds-genai-conventions',
};

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
    const testName = `${this.currentTest
      ?.fullTitle()
      .toLowerCase()
      .replace(/\s/g, '-')}`;
    const filename = `${SHARED_RECORDINGS[testName] ?? testName}.json`;
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

  // The tool-calling, error and embedding recordings are converted from the
  // opentelemetry-python-genai Bedrock cassettes so both languages are tested
  // against the same responses. The requests below must match them exactly.
  const weatherPrompt =
    'What is the weather in Seattle and San Francisco today?';
  const weatherToolConfig = {
    tools: [
      {
        toolSpec: {
          name: 'get_current_weather',
          description: 'Get the current weather in a given location.',
          inputSchema: {
            json: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The name of the city',
                },
              },
              required: ['location'],
            },
          },
        },
      },
    ],
  };
  const weatherMessages = [
    { role: ConversationRole.USER, content: [{ text: weatherPrompt }] },
  ];

  function withContentCapture(mode: 'none' | 'span_only') {
    beforeEach(() => {
      instrumentation.setConfig({ captureMessageContent: mode });
    });
    afterEach(() => {
      instrumentation.setConfig({});
    });
  }

  function getSpan(name: string): ReadableSpan {
    const spans = getTestSpans().filter(s => s.name === name);
    expect(spans.length).toBe(1);
    return spans[0];
  }

  function expectNoContent(span: ReadableSpan) {
    expect(span.attributes).not.toHaveProperty('gen_ai.input.messages');
    expect(span.attributes).not.toHaveProperty('gen_ai.output.messages');
    expect(span.attributes).not.toHaveProperty('gen_ai.tool.definitions');
  }

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
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
      });

      await expectConverseMetrics('amazon.titan-text-lite-v1', 8, 10);
    });

    it('parents HTTP spans under the GenAI span', async () => {
      const tracedClient = new BedrockRuntimeClient({
        region,
        credentials,
        requestHandler: new TracedHttpHandler(),
      });
      await tracedClient.send(
        new ConverseCommand({
          modelId: 'amazon.titan-text-lite-v1',
          messages: [
            {
              role: ConversationRole.USER,
              content: [{ text: 'Say this is a test' }],
            },
          ],
          inferenceConfig: {
            maxTokens: 10,
            temperature: 0.8,
            topP: 1,
            stopSequences: ['|'],
          },
        })
      );

      // A single span is recorded for the call: the GenAI span, which the
      // middleware also records its AWS attributes on.
      const spans = getTestSpans();
      expect(spans.length).toBe(2);
      const genAISpan = getSpan('chat amazon.titan-text-lite-v1');
      const httpSpan = getSpan(HTTP_SPAN_NAME);
      expect(httpSpan.spanContext().traceId).toBe(
        genAISpan.spanContext().traceId
      );
      expect(httpSpan.parentSpanContext?.spanId).toBe(
        genAISpan.spanContext().spanId
      );
      expect(genAISpan.kind).toBe(SpanKind.CLIENT);
      expect(genAISpan.attributes).toMatchObject({
        'rpc.system': 'aws-api',
        'rpc.service': 'BedrockRuntime',
        'rpc.method': 'Converse',
        'cloud.region': region,
        'http.response.status_code': 200,
        'server.address': `bedrock-runtime.${region}.amazonaws.com`,
        'server.port': 443,
      });
      expect(genAISpan.attributes['aws.request.id']).toBeDefined();
    });

    describe('with content capture', () => {
      withContentCapture('span_only');

      it('records tool calls with content', async () => {
        const response = await client.send(
          new ConverseCommand({
            modelId: 'amazon.nova-micro-v1:0',
            messages: weatherMessages,
            toolConfig: weatherToolConfig,
          })
        );
        expect(response.stopReason).toBe('tool_use');

        const span = getSpan('chat amazon.nova-micro-v1:0');
        expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
          'tool_call',
        ]);
        const output = JSON.parse(
          span.attributes['gen_ai.output.messages'] as string
        );
        expect(output.length).toBe(1);
        const toolCalls = output[0].parts.filter(
          (p: any) => p.type === 'tool_call'
        );
        expect(toolCalls.length).toBeGreaterThanOrEqual(1);
        expect(toolCalls[0].name).toBe('get_current_weather');
      });

      it('records invalid model errors', async () => {
        await expect(
          client.send(
            new ConverseCommand({
              modelId: 'does-not-exist',
              messages: [
                {
                  role: ConversationRole.USER,
                  content: [{ text: 'Say this is a test' }],
                },
              ],
            })
          )
        ).rejects.toMatchObject({ name: 'ValidationException' });

        const span = getSpan('chat does-not-exist');
        expect(span.status.code).toBe(SpanStatusCode.ERROR);
        expect(span.attributes['error.type']).toBe('ValidationException');
      });
    });

    describe('without content capture', () => {
      withContentCapture('none');

      it('records tool calls without content', async () => {
        await client.send(
          new ConverseCommand({
            modelId: 'amazon.nova-micro-v1:0',
            messages: weatherMessages,
            toolConfig: weatherToolConfig,
          })
        );

        const span = getSpan('chat amazon.nova-micro-v1:0');
        expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
          'tool_call',
        ]);
        expectNoContent(span);
      });
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
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
      });

      await expectConverseMetrics('amazon.titan-text-lite-v1', 8, 10);
    });

    // If the GenAI invocation fails to start, the middleware falls back to its
    // own span, which must still be ended once the stream is consumed.
    it('ends the span when the invocation cannot be started', async () => {
      const startInference = TelemetryHandler.prototype.startInference;
      TelemetryHandler.prototype.startInference = () => {
        throw new Error('invocation failed to start');
      };
      try {
        const response = await client.send(
          new ConverseStreamCommand({
            modelId: 'amazon.titan-text-lite-v1',
            messages: [
              {
                role: ConversationRole.USER,
                content: [{ text: 'Say this is a test' }],
              },
            ],
            inferenceConfig: {
              maxTokens: 10,
              temperature: 0.8,
              topP: 1,
              stopSequences: ['|'],
            },
          })
        );
        const isConverseSpan = (s: ReadableSpan) =>
          s.name === 'chat amazon.titan-text-lite-v1';
        expect(getTestSpans().filter(isConverseSpan).length).toBe(0);

        for await (const _event of response.stream!) {
          // drain
        }
        expect(getTestSpans().filter(isConverseSpan).length).toBe(1);
      } finally {
        TelemetryHandler.prototype.startInference = startInference;
      }
    });

    describe('with content capture', () => {
      withContentCapture('span_only');

      it('records tool calls with content', async () => {
        const response = await client.send(
          new ConverseStreamCommand({
            modelId: 'amazon.nova-micro-v1:0',
            messages: weatherMessages,
            toolConfig: weatherToolConfig,
          })
        );
        let events = 0;
        for await (const _event of response.stream!) {
          events++;
        }
        expect(events).toBeGreaterThan(0);

        const span = getSpan('chat amazon.nova-micro-v1:0');
        expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
          'tool_call',
        ]);
        const output = JSON.parse(
          span.attributes['gen_ai.output.messages'] as string
        );
        const toolCalls = output[0].parts.filter(
          (p: any) => p.type === 'tool_call'
        );
        expect(toolCalls.length).toBeGreaterThanOrEqual(1);
        expect(toolCalls[0].name).toBe('get_current_weather');
      });

      it('records invalid model errors', async () => {
        await expect(
          client.send(
            new ConverseStreamCommand({
              modelId: 'does-not-exist',
              messages: [
                {
                  role: ConversationRole.USER,
                  content: [{ text: 'Say this is a test' }],
                },
              ],
            })
          )
        ).rejects.toMatchObject({ name: 'ValidationException' });

        const span = getSpan('chat does-not-exist');
        expect(span.status.code).toBe(SpanStatusCode.ERROR);
        expect(span.attributes['error.type']).toBe('ValidationException');
        // Known from the operation, even though no stream was returned.
        expect(span.attributes['gen_ai.request.stream']).toBe(true);
      });

      it('ends a failed request span once with error status', async () => {
        // Any operation on an ended span (including a second `end()`) is
        // reported as a diagnostic warning by the SDK.
        const warnings: string[] = [];
        const noop = () => {};
        const logger: DiagLogger = {
          error: noop,
          warn: (message: string) => warnings.push(message),
          info: noop,
          debug: noop,
          verbose: noop,
        };
        diag.setLogger(logger, DiagLogLevel.WARN);
        try {
          await expect(
            client.send(
              new ConverseStreamCommand({
                modelId: 'does-not-exist',
                messages: [
                  {
                    role: ConversationRole.USER,
                    content: [{ text: 'Say this is a test' }],
                  },
                ],
              })
            )
          ).rejects.toMatchObject({ name: 'ValidationException' });
        } finally {
          diag.disable();
        }

        const span = getSpan('chat does-not-exist');
        expect(span.ended).toBe(true);
        expect(span.status).toEqual({
          code: SpanStatusCode.ERROR,
          message: 'The provided model identifier is invalid.',
        });
        expect(span.attributes['error.type']).toBe('ValidationException');
        expect(span.attributes['http.response.status_code']).toBe(400);
        expect(span.events.map(e => e.name)).toEqual(['exception']);
        expect(
          warnings.filter(w => w.includes(span.spanContext().spanId))
        ).toEqual([]);

        // The operation duration is recorded exactly once, with the error.
        await meterProvider.forceFlush();
        const durations = metricExporter
          .getMetrics()
          .flatMap(rm => rm.scopeMetrics)
          .flatMap(sm => sm.metrics)
          .filter(m => m.descriptor.name === 'gen_ai.client.operation.duration')
          .flatMap(m => m.dataPoints);
        expect(durations.length).toBe(1);
        expect(durations[0].attributes['error.type']).toBe(
          'ValidationException'
        );
        expect((durations[0].value as { count: number }).count).toBe(1);
      });

      // TODO: recording generated by AI, re-record. The recorded frames come from
      // the python cassette; the trailing modelStreamErrorException frame is
      // synthetic (python injects the error by patching botocore instead).
      it('records event stream errors', async () => {
        const response = await client.send(
          new ConverseStreamCommand({
            modelId: 'amazon.nova-micro-v1:0',
            messages: [
              {
                role: ConversationRole.USER,
                content: [{ text: 'Say this is a test' }],
              },
            ],
            inferenceConfig: {
              maxTokens: 10,
              temperature: 0.8,
              topP: 1,
              stopSequences: ['|'],
            },
          })
        );
        await expect(
          (async () => {
            for await (const _event of response.stream!) {
              // drain
            }
          })()
        ).rejects.toMatchObject({ name: 'ModelStreamErrorException' });

        const span = getSpan('chat amazon.nova-micro-v1:0');
        expect(span.status.code).toBe(SpanStatusCode.ERROR);
        expect(span.attributes['error.type']).toBe('ModelStreamErrorException');
      });

      // Python records the caller's exception on the span. In JS, throwing inside
      // `for await` only calls the iterator's `return()`, so the instrumentation
      // cannot see the error and ends the span as an early, successful stop.
      it('ends the span when the caller stops reading', async () => {
        const response = await client.send(
          new ConverseStreamCommand({
            modelId: 'amazon.nova-micro-v1:0',
            messages: [
              {
                role: ConversationRole.USER,
                content: [{ text: 'Say this is a test' }],
              },
            ],
            inferenceConfig: {
              maxTokens: 10,
              temperature: 0.8,
              topP: 1,
              stopSequences: ['|'],
            },
          })
        );
        await expect(
          (async () => {
            for await (const _event of response.stream!) {
              throw new Error('caller aborted stream');
            }
          })()
        ).rejects.toThrow('caller aborted stream');

        const span = getSpan('chat amazon.nova-micro-v1:0');
        expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
        expect(span.attributes).not.toHaveProperty('error.type');
      });
    });

    describe('without content capture', () => {
      withContentCapture('none');

      it('records tool calls without content', async () => {
        const response = await client.send(
          new ConverseStreamCommand({
            modelId: 'amazon.nova-micro-v1:0',
            messages: weatherMessages,
            toolConfig: weatherToolConfig,
          })
        );
        for await (const _event of response.stream!) {
          // drain
        }

        const span = getSpan('chat amazon.nova-micro-v1:0');
        expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
          'tool_call',
        ]);
        expectNoContent(span);
      });
    });
  });

  describe('InvokeModel', () => {
    // TODO: recording generated by AI, re-record (the python cassette is synthetic too).
    it('records embeddings', async () => {
      const modelId = 'amazon.titan-embed-text-v1';
      const response = await client.send(
        new InvokeModelCommand({
          modelId,
          body: JSON.stringify({
            inputText: 'The quick brown fox jumps over the lazy dog',
          }),
        })
      );
      const output = JSON.parse(response.body.transformToString());
      expect(output.embedding).toEqual([0.1, 0.2, 0.3]);

      const span = getSpan(`embeddings ${modelId}`);
      expect(span.attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_OPERATION_NAME]: 'embeddings',
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 9,
      });
      expect(span.attributes).not.toHaveProperty(
        ATTR_GEN_AI_USAGE_OUTPUT_TOKENS
      );
    });
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
          return s.name === `chat ${modelId}`;
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
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
          return s.name === `chat ${modelId}`;
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
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
          return s.name === `chat ${modelId}`;
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
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
          return s.name === `chat ${modelId}`;
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
      });
      // The recorded response carries no token counts (no usage body or
      // x-amzn-bedrock-*-token-count headers), so none are reported.
      expect(invokeModelSpans[0].attributes).not.toHaveProperty(
        ATTR_GEN_AI_USAGE_INPUT_TOKENS
      );
      expect(invokeModelSpans[0].attributes).not.toHaveProperty(
        ATTR_GEN_AI_USAGE_OUTPUT_TOKENS
      );
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
          return s.name === `chat ${modelId}`;
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
      });
      // The recorded response carries no token counts (no usage body or
      // x-amzn-bedrock-*-token-count headers), so none are reported.
      expect(invokeModelSpans[0].attributes).not.toHaveProperty(
        ATTR_GEN_AI_USAGE_INPUT_TOKENS
      );
      expect(invokeModelSpans[0].attributes).not.toHaveProperty(
        ATTR_GEN_AI_USAGE_OUTPUT_TOKENS
      );
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
          return s.name === `chat ${modelId}`;
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 8,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
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
          return s.name === `chat ${modelId}`;
        }
      );
      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
      });
      // The recorded response carries no token counts (no usage body or
      // x-amzn-bedrock-*-token-count headers), so none are reported.
      expect(invokeModelSpans[0].attributes).not.toHaveProperty(
        ATTR_GEN_AI_USAGE_INPUT_TOKENS
      );
      expect(invokeModelSpans[0].attributes).not.toHaveProperty(
        ATTR_GEN_AI_USAGE_OUTPUT_TOKENS
      );
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
        getInvokeModelWithResponseStreamSpans(modelId);

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 13,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
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
        getInvokeModelWithResponseStreamSpans(modelId);

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 12,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 22,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 12,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
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
        getInvokeModelWithResponseStreamSpans(modelId);

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 5,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
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
        getInvokeModelWithResponseStreamSpans(modelId);

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 20,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 19,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 20,
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
        getInvokeModelWithResponseStreamSpans(modelId);

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 0.99,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 5,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
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
        getInvokeModelWithResponseStreamSpans(modelId);

      expect(invokeModelSpans.length).toBe(1);
      expect(invokeModelSpans[0].attributes).toMatchObject({
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
        [ATTR_GEN_AI_REQUEST_MODEL]: modelId,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 10,
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.8,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 1,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['|'],
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 5,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 10,
        [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: ['length'],
      });
    });
  });

  async function expectConverseMetrics(
    modelId: string,
    inputTokens: number,
    outputTokens: number
  ) {
    await meterProvider.forceFlush();
    const [resourceMetrics] = metricExporter.getMetrics();
    expect(resourceMetrics.scopeMetrics.length).toBe(1);
    const metrics = resourceMetrics.scopeMetrics[0].metrics;
    const byName = (name: string) => {
      const found = metrics.filter(m => m.descriptor.name === name);
      expect(found.length).toBe(1);
      expect(found[0].dataPoints.length).toBe(1);
      return found[0];
    };
    const attributes = {
      'gen_ai.provider.name': 'aws.bedrock',
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': modelId,
      'server.address': `bedrock-runtime.${region}.amazonaws.com`,
      'server.port': 443,
    };

    const duration = byName('gen_ai.client.operation.duration');
    expect(duration.descriptor).toMatchObject({ type: 'HISTOGRAM', unit: 's' });
    expect(duration.dataPoints[0].attributes).toEqual(attributes);
    expect((duration.dataPoints[0].value as any).sum).toBeGreaterThan(0);

    for (const [name, value] of [
      ['gen_ai.client.inference.operation.input_tokens', inputTokens],
      ['gen_ai.client.inference.operation.output_tokens', outputTokens],
    ] as const) {
      const metric = byName(name);
      expect(metric.descriptor).toMatchObject({
        type: 'HISTOGRAM',
        unit: '{token}',
      });
      expect(metric.dataPoints[0].attributes).toEqual(attributes);
      expect((metric.dataPoints[0].value as any).sum).toBe(value);
    }

    for (const [name, value] of [
      ['gen_ai.client.inference.usage.input_tokens', inputTokens],
      ['gen_ai.client.inference.usage.output_tokens', outputTokens],
    ] as const) {
      const metric = byName(name);
      expect(metric.descriptor).toMatchObject({
        type: 'COUNTER',
        unit: '{token}',
      });
      expect(metric.dataPoints[0].attributes).toEqual({
        ...attributes,
        'gen_ai.token.modality': 'unknown',
      });
      expect(metric.dataPoints[0].value).toBe(value);
    }
  }

  function getInvokeModelWithResponseStreamSpans(
    modelId: string
  ): ReadableSpan[] {
    return getTestSpans().filter((s: ReadableSpan) => {
      return s.name === `chat ${modelId}`;
    });
  }

  function decodeChunk(chunk: any) {
    return Buffer.from(chunk.chunk.bytes).toString('utf-8');
  }
});
