/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import {
  ATTR_GEN_AI_OUTPUT_TYPE,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
  GEN_AI_PROVIDER_NAME_VALUE_IBM_WATSONX_AI,
  GEN_AI_PROVIDER_NAME_VALUE_OLLAMA,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
} from '@opentelemetry/genai-util';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { expect } from 'expect';
import { z } from 'zod';

import { instrumentation } from './load-instrumentation';
import type * as bee from 'beeai-framework';
import { ChatModelOutput } from 'beeai-framework/backend/chat';
import {
  AssistantMessage,
  SystemMessage,
  UserMessage,
} from 'beeai-framework/backend/message';
import { convertBeeAIMessage, mapProviderName } from '../src/utils';
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_CHOICE_COUNT,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_SEED,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK,
  METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK,
  MockChatModel,
  setupBeeAITestSuite,
} from './helpers';

describe('BeeAIInstrumentation - ChatModel', () => {
  const { getMetricReader } = setupBeeAITestSuite();

  describe('Provider mapping', () => {
    it('maps BeeAI provider identifiers to OpenTelemetry GenAI provider names', () => {
      expect(mapProviderName('openai')).toBe(GEN_AI_PROVIDER_NAME_VALUE_OPENAI);
      expect(mapProviderName('watsonx')).toBe(
        GEN_AI_PROVIDER_NAME_VALUE_IBM_WATSONX_AI
      );
      expect(mapProviderName('ollama')).toBe(GEN_AI_PROVIDER_NAME_VALUE_OLLAMA);
      expect(mapProviderName('google-vertex')).toBe('gcp.vertex_ai');
      expect(mapProviderName('amazon-bedrock')).toBe('aws.bedrock');
      expect(mapProviderName('azure-openai')).toBe('azure.ai.openai');
      expect(mapProviderName('xai')).toBe('x_ai');
      expect(mapProviderName('custom-provider')).toBe('custom-provider');
      expect(mapProviderName('')).toBe('beeai');
    });
  });

  describe('ChatModel instrumentation (InferenceInvocation)', () => {
    it('emits a conformant CLIENT chat span and metrics without content by default', async () => {
      const llm = new MockChatModel({
        modelId: 'gpt-4o',
        providerId: 'openai',
        parameters: {
          temperature: 0.5,
          topP: 0.9,
          topK: 40,
          maxTokens: 256,
          frequencyPenalty: 0.1,
          presencePenalty: 0.2,
          n: 2,
          seed: 42,
          stopSequences: ['STOP'],
        },
      });

      const response = await llm.create({
        messages: [
          new SystemMessage('Be concise.'),
          new UserMessage('Hello BeeAI!'),
        ],
      });

      expect(response.getTextContent()).toBe('Mock response from model');

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.name).toBe('chat gpt-4o');
      expect(span.kind).toBe(SpanKind.CLIENT);
      expect(span.status.code).toBe(SpanStatusCode.UNSET);
      expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_CHAT
      );
      expect(span.attributes[ATTR_GEN_AI_PROVIDER_NAME]).toBe(
        GEN_AI_PROVIDER_NAME_VALUE_OPENAI
      );
      expect(span.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe('gpt-4o');
      expect(span.attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE]).toBe(0.5);
      expect(span.attributes[ATTR_GEN_AI_REQUEST_TOP_P]).toBe(0.9);
      expect(span.attributes[ATTR_GEN_AI_REQUEST_TOP_K]).toBe(40);
      expect(span.attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS]).toBe(256);
      expect(span.attributes[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY]).toBe(0.1);
      expect(span.attributes[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY]).toBe(0.2);
      expect(span.attributes[ATTR_GEN_AI_REQUEST_CHOICE_COUNT]).toBe(2);
      expect(span.attributes[ATTR_GEN_AI_REQUEST_SEED]).toBe(42);
      expect(span.attributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]).toEqual([
        'STOP',
      ]);
      expect(span.attributes[ATTR_GEN_AI_RESPONSE_ID]).toBe('resp_123');
      expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
        'stop',
      ]);
      expect(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(12);
      expect(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(8);
      expect(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES]).toBeUndefined();
      expect(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
      expect(span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]).toBeUndefined();

      const { resourceMetrics } = await getMetricReader().collect();
      const metricNames =
        resourceMetrics.scopeMetrics[0]?.metrics.map(m => m.descriptor.name) ??
        [];
      expect(metricNames).toEqual(
        expect.arrayContaining([
          METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
          METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS,
          METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS,
          METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
          METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
        ])
      );
    });

    it('captures system instructions, input messages, and output messages when captureMessageContent is span_only', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const llm = new MockChatModel({
        modelId: 'llama3.1',
        providerId: 'ollama',
      });

      await llm.create({
        messages: [
          new SystemMessage('You are a helpful assistant.'),
          new UserMessage([
            { type: 'text', text: 'Describe this image' },
            {
              type: 'image',
              image: 'https://example.com/photo.png',
              mimeType: 'image/png',
            },
          ]),
        ],
      });

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] as string)
      ).toEqual([{ type: 'text', content: 'You are a helpful assistant.' }]);

      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'user',
          parts: [
            { type: 'text', content: 'Describe this image' },
            {
              type: 'uri',
              modality: 'image',
              uri: 'https://example.com/photo.png',
              mime_type: 'image/png',
            },
          ],
        },
      ]);

      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Mock response from model' }],
        },
      ]);
    });

    it('records streaming TTFT, time per output chunk metrics, and coalesced output messages when stream is true', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const chunk1 = new ChatModelOutput([new AssistantMessage('Hello ')]);
      const chunk2 = new ChatModelOutput(
        [new AssistantMessage('world!')],
        {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
        'stop'
      );
      const llm = new MockChatModel({
        modelId: 'llama3.1',
        providerId: 'ollama',
        streamChunks: [chunk1, chunk2],
      });

      const observedTokens: string[] = [];
      const response = await llm
        .create({
          messages: [new UserMessage('Stream test')],
          stream: true,
        })
        .observe(emitter => {
          emitter.on('newToken', ({ value }) => {
            observedTokens.push(value.getTextContent());
          });
        });

      expect(response.getTextContent()).toBe('Hello world!');
      expect(observedTokens).toEqual(['Hello ', 'world!']);

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.attributes[ATTR_GEN_AI_REQUEST_STREAM]).toBe(true);
      expect(
        typeof span.attributes[ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK]
      ).toBe('number');
      expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
        'stop',
      ]);
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Hello world!' }],
        },
      ]);

      const { resourceMetrics } = await getMetricReader().collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const ttftMetric = metrics.find(
        m =>
          m.descriptor.name ===
          METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK
      );
      const tpocMetric = metrics.find(
        m =>
          m.descriptor.name ===
          METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK
      );
      expect(ttftMetric?.dataPoints.length).toBe(1);
      expect(tpocMetric?.dataPoints.length).toBe(1);
    });

    it('defaults finish_reasons to error with UNSET status when a stream is aborted early via newToken callback', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const chunk1 = new ChatModelOutput([new AssistantMessage('Partial ')]);
      const chunk2 = new ChatModelOutput(
        [new AssistantMessage('never reached')],
        {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
        'stop'
      );
      const llm = new MockChatModel({
        modelId: 'llama3.1',
        providerId: 'ollama',
        streamChunks: [chunk1, chunk2],
      });

      const response = await llm
        .create({
          messages: [new UserMessage('Abort stream test')],
          stream: true,
        })
        .observe(emitter => {
          emitter.on('newToken', ({ callbacks }) => {
            callbacks.abort();
          });
        });

      expect(response.getTextContent()).toBe('Partial ');
      expect(response.finishReason).toBeUndefined();

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.status.code).toBe(SpanStatusCode.UNSET);
      expect(span.attributes[ATTR_ERROR_TYPE]).toBeUndefined();
      expect(span.attributes[ATTR_GEN_AI_REQUEST_STREAM]).toBe(true);
      expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
        'error',
      ]);
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Partial ' }],
        },
      ]);
    });

    it('preserves provider finishReason from an earlier stream chunk when a trailing usage-only chunk omits finishReason', async () => {
      const chunk1 = new ChatModelOutput(
        [new AssistantMessage('Complete reply')],
        undefined,
        'stop'
      );
      const chunk2 = new ChatModelOutput(
        [],
        {
          promptTokens: 10,
          completionTokens: 4,
          totalTokens: 14,
        },
        undefined
      );
      const llm = new MockChatModel({
        modelId: 'granite-3-8b-instruct',
        providerId: 'watsonx',
        streamChunks: [chunk1, chunk2],
      });

      const response = await llm.create({
        messages: [new UserMessage('Trailing usage chunk test')],
        stream: true,
      });

      expect(response.getTextContent()).toBe('Complete reply');
      expect(response.finishReason).toBeUndefined();

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.status.code).toBe(SpanStatusCode.UNSET);
      expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
        'stop',
      ]);
      expect(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(10);
      expect(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(4);
    });

    it('instruments ChatModel.createStructure and sets gen_ai.output.type to json', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const llm = new MockChatModel({
        modelId: 'gpt-4o',
        providerId: 'openai',
        responses: [
          () =>
            new ChatModelOutput(
              [new AssistantMessage('{"city":"Paris","population":2161000}')],
              { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
              'stop'
            ),
        ],
      });

      const schema = z.object({
        city: z.string(),
        population: z.number(),
      });

      const res = await llm.createStructure({
        schema,
        messages: [new UserMessage('Give info about Paris')],
      });

      expect(res.object).toEqual({ city: 'Paris', population: 2161000 });

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];
      expect(span.name).toBe('chat gpt-4o');
      expect(span.attributes[ATTR_GEN_AI_OUTPUT_TYPE]).toBe(
        GEN_AI_OUTPUT_TYPE_VALUE_JSON
      );
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: '{"city":"Paris","population":2161000}',
            },
          ],
        },
      ]);
    });

    it('records error telemetry when ChatModel.create fails and preserves original error', async () => {
      const llm = new MockChatModel({
        modelId: 'llama3.1',
        providerId: 'ollama',
        responses: [
          () => {
            throw new Error('Model backend unavailable');
          },
        ],
      });

      await expect(
        llm.create({ messages: [new UserMessage('Hi')] })
      ).rejects.toThrow();

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes[ATTR_ERROR_TYPE]).toBe('ChatModelError');
      expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
        'error',
      ]);
    });

    it('preserves distinct output messages per candidate on non-streaming multi-choice (n > 1) responses', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const llm = new MockChatModel({
        modelId: 'granite-3-8b-instruct',
        providerId: 'watsonx',
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage('Candidate 1 answer'),
                new AssistantMessage('Candidate 2 answer'),
              ],
              { promptTokens: 14, completionTokens: 12, totalTokens: 26 },
              'stop'
            ),
        ],
      });

      await llm.create({
        messages: [new UserMessage('Give two options')],
        n: 2,
      });

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];
      expect(span.attributes[ATTR_GEN_AI_REQUEST_CHOICE_COUNT]).toBe(2);
      expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
        'stop',
        'stop',
      ]);
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Candidate 1 answer' }],
        },
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Candidate 2 answer' }],
        },
      ]);
    });

    it('records per-candidate finish_reasons without leaking output content when captureMessageContent is none on multi-choice (n > 1) responses', async () => {
      instrumentation.setConfig({ captureMessageContent: 'none' });
      const llm = new MockChatModel({
        modelId: 'granite-3-8b-instruct',
        providerId: 'watsonx',
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage('Candidate 1 secret'),
                new AssistantMessage('Candidate 2 secret'),
              ],
              { promptTokens: 14, completionTokens: 12, totalTokens: 26 },
              'stop'
            ),
        ],
      });

      await llm.create({
        messages: [new UserMessage('Give two options')],
        n: 2,
      });

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];
      expect(span.attributes[ATTR_GEN_AI_REQUEST_CHOICE_COUNT]).toBe(2);
      expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
        'stop',
        'stop',
      ]);
      expect(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
    });

    it('coalesces split single-choice assistant message segments on non-streaming n=1 responses', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const llm = new MockChatModel({
        modelId: 'granite-3-8b-instruct',
        providerId: 'watsonx',
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage('Let me look that up.'),
                new AssistantMessage({
                  type: 'tool-call',
                  toolCallId: 'call_wx_1',
                  toolName: 'search_docs',
                  args: { q: 'beeai' },
                }),
              ],
              { promptTokens: 18, completionTokens: 10, totalTokens: 28 },
              'tool-calls'
            ),
        ],
      });

      await llm.create({
        messages: [new UserMessage('Search docs for beeai')],
      });

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [
            { type: 'text', content: 'Let me look that up.' },
            {
              type: 'tool_call',
              id: 'call_wx_1',
              name: 'search_docs',
              arguments: { q: 'beeai' },
            },
          ],
        },
      ]);
    });

    it('handles multimodal blob parts, reasoning tokens, and cached tokens', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const llm = new MockChatModel({
        modelId: 'gpt-4o',
        providerId: 'openai',
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage([
                  {
                    type: 'reasoning',
                    text: 'Step-by-step reasoning',
                  } as unknown as AssistantMessage['content'][number],
                  { type: 'text', text: 'Final answer' },
                ]),
              ],
              {
                promptTokens: 50,
                completionTokens: 25,
                totalTokens: 75,
                reasoningTokens: 10,
                cachedPromptTokens: 20,
              } as bee.ChatModelUsage,
              'length'
            ),
        ],
      });

      await llm.create({
        messages: [
          new UserMessage([
            {
              type: 'image',
              image: 'data:image/png;base64,aGVsbG8=',
            },
            {
              type: 'file',
              data: Buffer.from([1, 2, 3]),
              mimeType: 'application/pdf',
            },
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              toolName: 'calc',
              result: { answer: 42 },
            } as unknown as UserMessage['content'][number],
          ]),
        ],
        responseFormat: { type: 'object-json' },
      });

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];
      expect(span.attributes[ATTR_GEN_AI_OUTPUT_TYPE]).toBe(
        GEN_AI_OUTPUT_TYPE_VALUE_JSON
      );
      expect(span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual([
        'length',
      ]);
      expect(span.attributes[ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]).toBe(
        10
      );
      expect(span.attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]).toBe(
        20
      );

      const inputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string
      );
      expect(inputMessages[0].parts).toHaveLength(3);
      expect(inputMessages[0].parts[0].type).toBe('blob');
      expect(inputMessages[0].parts[0].modality).toBe('image');
      expect(inputMessages[0].parts[1].type).toBe('blob');
      expect(inputMessages[0].parts[1].modality).toBe('document');
      expect(inputMessages[0].parts[2]).toEqual({
        type: 'tool_call_response',
        id: 'call_1',
        response: { answer: 42 },
      });

      const outputMessages = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string
      );
      expect(outputMessages[0].parts).toEqual([
        { type: 'reasoning', content: 'Step-by-step reasoning' },
        { type: 'text', content: 'Final answer' },
      ]);
    });

    it('validates base64 multimodal parts without duplicate Uint8Array copies and omits non-base64 strings', async () => {
      // Verify convertBeeAIMessage returns Buffer directly (a Uint8Array subclass)
      // without allocating a second TypedArray copy via `new Uint8Array(Buffer.from(...))`.
      const directConverted = convertBeeAIMessage(
        new UserMessage([
          {
            type: 'image',
            image: 'data:image/png;base64,aGVsbG8%3D',
          },
          {
            type: 'file',
            data: 'AQIDBA==',
            mimeType: 'application/pdf',
          },
        ])
      );
      expect(directConverted?.parts).toHaveLength(2);
      const imageBlob = directConverted?.parts[0] as {
        type: string;
        content: Uint8Array;
      };
      const fileBlob = directConverted?.parts[1] as {
        type: string;
        content: Uint8Array;
      };
      expect(Buffer.isBuffer(imageBlob.content)).toBe(true);
      expect(Array.from(imageBlob.content)).toEqual([104, 101, 108, 108, 111]);
      expect(Buffer.isBuffer(fileBlob.content)).toBe(true);
      expect(Array.from(fileBlob.content)).toEqual([1, 2, 3, 4]);

      // Verify end-to-end span serialization omits local file paths, relative paths,
      // and malformed base64 instead of emitting silently corrupted binary blobs.
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const llm = new MockChatModel({
        modelId: 'gpt-4o',
        providerId: 'openai',
      });

      await llm.create({
        messages: [
          new UserMessage([
            { type: 'text', text: 'Inspect valid and invalid attachments' },
            {
              type: 'file',
              data: '/var/data/quarterly-report.pdf',
              mimeType: 'application/pdf',
            },
            {
              type: 'image',
              image: './relative/chart.png',
              mimeType: 'image/png',
            },
            {
              type: 'image',
              image: 'data:image/png;base64,not-valid-base64!',
            },
            {
              type: 'image',
              image: 'data:image/png;base64,%ZZ',
            },
            {
              type: 'file',
              data: 'aGVsbG9=', // non-zero unused trailing bits
              mimeType: 'application/octet-stream',
            },
            {
              type: 'file',
              data: 'abcde', // invalid length % 4 === 1
              mimeType: 'application/octet-stream',
            },
            {
              type: 'file',
              data: 'AQIDBA', // valid unpadded base64 ([1, 2, 3, 4])
              mimeType: 'application/pdf',
            },
          ]),
        ],
      });

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const inputMessages = JSON.parse(
        spans[0].attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string
      );
      expect(inputMessages).toEqual([
        {
          role: 'user',
          parts: [
            { type: 'text', content: 'Inspect valid and invalid attachments' },
            {
              type: 'blob',
              modality: 'document',
              content: 'AQIDBA==',
              mime_type: 'application/pdf',
            },
          ],
        },
      ]);
    });
  });
});
