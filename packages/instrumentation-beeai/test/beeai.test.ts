/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  diag,
  DiagLogLevel,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { suppressTracing } from '@opentelemetry/core';
import {
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_TOOL_CALL_ID,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
  GEN_AI_PROVIDER_NAME_VALUE_IBM_WATSONX_AI,
  GEN_AI_PROVIDER_NAME_VALUE_OLLAMA,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
} from '@opentelemetry/genai-util';

const ATTR_GEN_AI_AGENT_DESCRIPTION = 'gen_ai.agent.description';
const ATTR_GEN_AI_AGENT_NAME = 'gen_ai.agent.name';
const ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT =
  'gen_ai.embeddings.dimension.count';
const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages';
const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages';
const ATTR_GEN_AI_PROVIDER_NAME = 'gen_ai.provider.name';
const ATTR_GEN_AI_REQUEST_CHOICE_COUNT = 'gen_ai.request.choice.count';
const ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY =
  'gen_ai.request.frequency_penalty';
const ATTR_GEN_AI_REQUEST_MAX_TOKENS = 'gen_ai.request.max_tokens';
const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model';
const ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY = 'gen_ai.request.presence_penalty';
const ATTR_GEN_AI_REQUEST_SEED = 'gen_ai.request.seed';
const ATTR_GEN_AI_REQUEST_STOP_SEQUENCES = 'gen_ai.request.stop_sequences';
const ATTR_GEN_AI_REQUEST_STREAM = 'gen_ai.request.stream';
const ATTR_GEN_AI_REQUEST_TEMPERATURE = 'gen_ai.request.temperature';
const ATTR_GEN_AI_REQUEST_TOP_K = 'gen_ai.request.top_k';
const ATTR_GEN_AI_REQUEST_TOP_P = 'gen_ai.request.top_p';
const ATTR_GEN_AI_RESPONSE_FINISH_REASONS = 'gen_ai.response.finish_reasons';
const ATTR_GEN_AI_RESPONSE_ID = 'gen_ai.response.id';
const ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK =
  'gen_ai.response.time_to_first_chunk';
const ATTR_GEN_AI_SYSTEM_INSTRUCTIONS = 'gen_ai.system_instructions';
const ATTR_GEN_AI_TOOL_CALL_ARGUMENTS = 'gen_ai.tool.call.arguments';
const ATTR_GEN_AI_TOOL_CALL_RESULT = 'gen_ai.tool.call.result';
const ATTR_GEN_AI_TOOL_DESCRIPTION = 'gen_ai.tool.description';
const ATTR_GEN_AI_TOOL_NAME = 'gen_ai.tool.name';
const ATTR_GEN_AI_TOOL_TYPE = 'gen_ai.tool.type';
const ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS =
  'gen_ai.usage.cache_read.input_tokens';
const ATTR_GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens';
const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens';
const ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS =
  'gen_ai.usage.reasoning.output_tokens';
const METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS =
  'gen_ai.client.inference.operation.input_tokens';
const METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS =
  'gen_ai.client.inference.operation.output_tokens';
const METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS =
  'gen_ai.client.inference.usage.input_tokens';
const METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS =
  'gen_ai.client.inference.usage.output_tokens';
const METRIC_GEN_AI_CLIENT_OPERATION_DURATION =
  'gen_ai.client.operation.duration';
const METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK =
  'gen_ai.client.operation.time_per_output_chunk';
const METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK =
  'gen_ai.client.operation.time_to_first_chunk';
const METRIC_GEN_AI_EXECUTE_TOOL_DURATION = 'gen_ai.execute_tool.duration';
const METRIC_GEN_AI_INVOKE_AGENT_DURATION = 'gen_ai.invoke_agent.duration';
const METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS =
  'gen_ai.invoke_agent.inference_calls';
const METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS = 'gen_ai.invoke_agent.tool_calls';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { expect } from 'expect';
import * as sinon from 'sinon';
import { z } from 'zod';

import { instrumentation } from './load-instrumentation';
import { BeeAIInstrumentation } from '../src';
import * as bee from 'beeai-framework';
import { BaseAgent } from 'beeai-framework/agents/base';
import { RemoteAgent } from 'beeai-framework/agents/experimental/remote/agent';
import { ReActAgent } from 'beeai-framework/agents/react/agent';
import { ToolCallingAgent } from 'beeai-framework/agents/toolCalling/agent';
import { DummyChatModel as BaseDummyChatModel } from 'beeai-framework/adapters/dummy/backend/chat';
import { DummyEmbeddingModel as BaseDummyEmbeddingModel } from 'beeai-framework/adapters/dummy/backend/embedding';
import { LangChainChatModel } from 'beeai-framework/adapters/langchain/backend/chat';
import { LangChainEmbeddingModel } from 'beeai-framework/adapters/langchain/backend/embedding';
import { LangChainTool } from 'beeai-framework/adapters/langchain/tools';
import {
  ChatModelOutput,
  type ChatModelInput,
} from 'beeai-framework/backend/chat';
import type {
  EmbeddingModelInput,
  EmbeddingModelOutput,
} from 'beeai-framework/backend/embedding';
import {
  AssistantMessage,
  SystemMessage,
  UserMessage,
} from 'beeai-framework/backend/message';
import { Emitter } from 'beeai-framework/emitter/emitter';
import { UnconstrainedMemory } from 'beeai-framework/memory/unconstrainedMemory';
import {
  DynamicTool,
  JSONToolOutput,
  StringToolOutput,
  Tool,
} from 'beeai-framework/tools/base';
import { LLMTool } from 'beeai-framework/tools/llm';
import { convertBeeAIMessage, mapProviderName } from '../src/utils';

class TestMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

class MockChatModel extends BaseDummyChatModel {
  override readonly modelId: string;
  private readonly _provider: string;
  private readonly _responses: Array<
    (input: ChatModelInput) => Promise<ChatModelOutput> | ChatModelOutput
  >;
  private readonly _streamChunks?: ChatModelOutput[];
  private _callIndex = 0;

  constructor(options?: {
    modelId?: string;
    providerId?: string;
    parameters?: bee.ChatModelParameters;
    responses?: Array<
      (input: ChatModelInput) => Promise<ChatModelOutput> | ChatModelOutput
    >;
    streamChunks?: ChatModelOutput[];
  }) {
    super(options?.modelId ?? 'llama3.1', options?.parameters ?? {});
    this.modelId = options?.modelId ?? 'llama3.1';
    this._provider = options?.providerId ?? 'ollama';
    this._responses = options?.responses ?? [
      () => {
        const msg = new AssistantMessage('Mock response from model');
        (msg as { id?: string }).id = 'resp_123';
        return new ChatModelOutput(
          [msg],
          {
            promptTokens: 12,
            completionTokens: 8,
            totalTokens: 20,
          },
          'stop'
        );
      },
    ];
    this._streamChunks = options?.streamChunks;
  }

  override get providerId(): string {
    return this._provider;
  }

  protected override async _create(
    input: ChatModelInput
  ): Promise<ChatModelOutput> {
    const fn =
      this._responses[Math.min(this._callIndex++, this._responses.length - 1)];
    return await fn(input);
  }

  protected override async *_createStream(
    input: ChatModelInput
  ): AsyncGenerator<ChatModelOutput> {
    if (this._streamChunks) {
      for (const chunk of this._streamChunks) {
        yield chunk;
      }
      return;
    }
    const output = await this._create(input);
    yield output;
  }
}

class MockEmbeddingModel extends BaseDummyEmbeddingModel {
  override readonly modelId: string;
  private readonly _provider: string;
  private readonly _shouldFail: boolean;

  constructor(options?: {
    modelId?: string;
    providerId?: string;
    shouldFail?: boolean;
  }) {
    super(options?.modelId ?? 'nomic-embed-text');
    this.modelId = options?.modelId ?? 'nomic-embed-text';
    this._provider = options?.providerId ?? 'ollama';
    this._shouldFail = options?.shouldFail ?? false;
  }

  override get providerId(): string {
    return this._provider;
  }

  protected override async _create(
    input: EmbeddingModelInput
  ): Promise<EmbeddingModelOutput> {
    if (this._shouldFail) {
      throw new Error('Embedding provider error');
    }
    return {
      values: input.values,
      embeddings: input.values.map(() => [0.1, 0.2, 0.3, 0.4]),
      usage: { tokens: 15 },
    };
  }
}

interface CustomAgentInput {
  prompt: string | null;
}

interface CustomAgentOutput {
  result: AssistantMessage;
}

class CustomAgent extends BaseAgent<CustomAgentInput, CustomAgentOutput> {
  emitter = Emitter.root.child({
    namespace: ['agent', 'custom'],
    creator: this,
  });
  private _memory = new UnconstrainedMemory();

  get memory() {
    return this._memory;
  }
  set memory(m) {
    this._memory = m;
  }

  override get meta() {
    return {
      name: 'CustomAssistant',
      description: 'Custom test assistant',
      tools: [],
    };
  }

  protected override async _run(
    input: CustomAgentInput
  ): Promise<CustomAgentOutput> {
    if (input.prompt) {
      await this.memory.add(new UserMessage(input.prompt));
    }
    const lastUser = this.memory.messages.find(m => m.role === 'user');
    const answer = new AssistantMessage(`Handled: ${lastUser?.text ?? 'none'}`);
    await this.memory.add(answer);
    return { result: answer };
  }

  override loadSnapshot() {}
}

describe('BeeAIInstrumentation', () => {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;
  const captureEnvKey = 'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT';
  let originalCaptureEnv: string | undefined;

  before(() => {
    instrumentation.manuallyInstrument(bee);
  });

  beforeEach(() => {
    originalCaptureEnv = process.env[captureEnvKey];
    delete process.env[captureEnvKey];
    resetMemoryExporter();
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({ readers: [metricReader] });
    instrumentation.setMeterProvider(meterProvider);
    instrumentation.setConfig({});
    instrumentation.enable();
  });

  afterEach(async () => {
    instrumentation.disable();
    await meterProvider.shutdown();
    if (originalCaptureEnv === undefined) {
      delete process.env[captureEnvKey];
    } else {
      process.env[captureEnvKey] = originalCaptureEnv;
    }
  });

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

      const { resourceMetrics } = await metricReader.collect();
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

      const { resourceMetrics } = await metricReader.collect();
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
  });

  describe('EmbeddingModel instrumentation (EmbeddingInvocation)', () => {
    it('emits a CLIENT embeddings span with dimension count, usage, and duration metric', async () => {
      const embedder = new MockEmbeddingModel({
        modelId: 'nomic-embed-text',
        providerId: 'ollama',
      });

      const result = await embedder.create({
        values: ['first text', 'second text'],
      });
      expect(result.embeddings).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.name).toBe('embeddings nomic-embed-text');
      expect(span.kind).toBe(SpanKind.CLIENT);
      expect(span.status.code).toBe(SpanStatusCode.UNSET);
      expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS
      );
      expect(span.attributes[ATTR_GEN_AI_PROVIDER_NAME]).toBe(
        GEN_AI_PROVIDER_NAME_VALUE_OLLAMA
      );
      expect(span.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe(
        'nomic-embed-text'
      );
      expect(span.attributes[ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT]).toBe(4);
      expect(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(15);

      const { resourceMetrics } = await metricReader.collect();
      const durationMetric = resourceMetrics.scopeMetrics[0]?.metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_DURATION
      );
      expect(durationMetric?.dataPoints.length).toBe(1);
    });

    it('records error telemetry when EmbeddingModel.create fails', async () => {
      const embedder = new MockEmbeddingModel({
        modelId: 'nomic-embed-text',
        providerId: 'ollama',
        shouldFail: true,
      });

      await expect(embedder.create({ values: ['fail'] })).rejects.toThrow();

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes[ATTR_ERROR_TYPE]).toBe('EmbeddingModelError');
    });
  });

  describe('Tool instrumentation (ToolInvocation)', () => {
    it('emits an INTERNAL execute_tool span without arguments or result by default', async () => {
      const calculator = new DynamicTool({
        name: 'calculator',
        description: 'Evaluates expressions',
        inputSchema: z.object({ expression: z.string() }),
        handler: async input =>
          new StringToolOutput(`result:${input.expression}`),
      });

      const output = await calculator.run({ expression: '2+2' });
      expect(output.getTextContent()).toBe('result:2+2');

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.name).toBe('execute_tool calculator');
      expect(span.kind).toBe(SpanKind.INTERNAL);
      expect(span.status.code).toBe(SpanStatusCode.UNSET);
      expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      );
      expect(span.attributes[ATTR_GEN_AI_TOOL_NAME]).toBe('calculator');
      expect(span.attributes[ATTR_GEN_AI_TOOL_DESCRIPTION]).toBe(
        'Evaluates expressions'
      );
      expect(span.attributes[ATTR_GEN_AI_TOOL_TYPE]).toBe(
        GEN_AI_TOOL_TYPE_VALUE_FUNCTION
      );
      expect(span.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS]).toBeUndefined();
      expect(span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT]).toBeUndefined();

      const { resourceMetrics } = await metricReader.collect();
      const toolDuration = resourceMetrics.scopeMetrics[0]?.metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_EXECUTE_TOOL_DURATION
      );
      expect(toolDuration?.dataPoints.length).toBe(1);
    });

    it('captures tool arguments and results without stripping user domain keys when content capture is enabled', async () => {
      process.env[captureEnvKey] = 'span_only';

      const jsonTool = new DynamicTool({
        name: 'weather_lookup',
        description: 'Fetches weather data',
        inputSchema: z.object({
          city: z.string(),
          result: z.string().optional(),
          _id: z.string().optional(),
        }),
        handler: async input =>
          new JSONToolOutput({
            _id: input._id ?? 'doc_1',
            city: input.city,
            tempC: 22,
            tokens: ['user-domain-token'],
            client: { name: 'weather-api' },
            createdBy: { id: 5 },
          }),
      });

      const output = await jsonTool.run({
        city: 'Berlin',
        result: 'expected-input-field',
        _id: 'req_42',
      });
      expect(output.result.city).toBe('Berlin');

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] as string)
      ).toEqual({
        city: 'Berlin',
        result: 'expected-input-field',
        _id: 'req_42',
      });
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT] as string)
      ).toEqual({
        _id: 'req_42',
        city: 'Berlin',
        tempC: 22,
        tokens: ['user-domain-token'],
        client: { name: 'weather-api' },
        createdBy: { id: 5 },
      });
    });

    it('records error telemetry on tool failure without setting tool.call.result', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const failingTool = new DynamicTool({
        name: 'failing_tool',
        description: 'Always throws',
        inputSchema: z.object({ query: z.string() }),
        handler: async () => {
          throw new Error('Database connection failed');
        },
      });

      await expect(failingTool.run({ query: 'test' })).rejects.toThrow();

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes[ATTR_ERROR_TYPE]).toBe('ToolError');
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] as string)
      ).toEqual({ query: 'test' });
      expect(span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT]).toBeUndefined();
    });
  });

  describe('BaseAgent instrumentation (LocalAgentInvocation)', () => {
    it('instruments ReActAgent with nested chat and execute_tool spans and call count metrics', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });

      const weatherTool = new DynamicTool({
        name: 'get_weather',
        description: 'Returns weather for a city',
        inputSchema: z.object({ city: z.string() }),
        handler: async input =>
          new StringToolOutput(`Sunny, 25C in ${input.city}`),
      });

      const llm = new MockChatModel({
        modelId: 'llama3.1',
        providerId: 'ollama',
        parameters: { temperature: 0.2 },
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: I need to check the weather in Rome.',
                    'Function Name: get_weather',
                    'Function Input: {"city":"Rome"}',
                  ].join('\n')
                ),
              ],
              { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
              'stop'
            ),
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: I have the weather information.',
                    'Final Answer: It is Sunny and 25C in Rome.',
                  ].join('\n')
                ),
              ],
              { promptTokens: 65, completionTokens: 15, totalTokens: 80 },
              'stop'
            ),
        ],
      });

      const agent = new ReActAgent({
        llm,
        memory: new UnconstrainedMemory(),
        tools: [weatherTool],
      });

      const response = await agent.run({
        prompt: 'What is the weather in Rome?',
      });
      expect(response.result.text).toBe('It is Sunny and 25C in Rome.');

      const spans = getTestSpans();
      const agentSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      );
      const chatSpans = spans.filter(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      );
      const toolSpans = spans.filter(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      );

      expect(agentSpan).toBeDefined();
      expect(chatSpans).toHaveLength(2);
      expect(toolSpans).toHaveLength(1);

      expect(agentSpan!.name).toBe('invoke_agent ReAct');
      expect(agentSpan!.kind).toBe(SpanKind.INTERNAL);
      expect(agentSpan!.attributes[ATTR_GEN_AI_AGENT_NAME]).toBe('ReAct');
      expect(typeof agentSpan!.attributes[ATTR_GEN_AI_AGENT_DESCRIPTION]).toBe(
        'string'
      );
      expect(agentSpan!.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe('llama3.1');
      expect(agentSpan!.attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE]).toBe(0.2);
      expect(agentSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(105);
      expect(agentSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(35);

      expect(
        JSON.parse(agentSpan!.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is the weather in Rome?' }],
        },
      ]);
      expect(
        JSON.parse(agentSpan!.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'It is Sunny and 25C in Rome.' }],
        },
      ]);

      for (const chatSpan of chatSpans) {
        expect(chatSpan.parentSpanContext?.spanId).toBe(
          agentSpan!.spanContext().spanId
        );
      }

      const toolSpan = toolSpans[0];
      expect(toolSpan.parentSpanContext?.spanId).toBe(
        agentSpan!.spanContext().spanId
      );
      expect(toolSpan.attributes[ATTR_GEN_AI_AGENT_NAME]).toBe('ReAct');
      expect(toolSpan.attributes[ATTR_GEN_AI_TOOL_NAME]).toBe('get_weather');
      expect(
        JSON.parse(
          toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] as string
        )
      ).toEqual({ city: 'Rome' });
      expect(toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT]).toBe(
        'Sunny, 25C in Rome'
      );

      const { resourceMetrics } = await metricReader.collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];

      const agentDuration = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_DURATION
      );
      const inferenceCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
      );
      const toolCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      expect(agentDuration?.dataPoints.length).toBe(1);
      expect(inferenceCalls?.dataPoints.length).toBe(1);
      expect(
        (inferenceCalls?.dataPoints[0]?.value as { sum?: number })?.sum
      ).toBe(2);
      expect(toolCalls?.dataPoints.length).toBe(1);
      expect((toolCalls?.dataPoints[0]?.value as { sum?: number })?.sum).toBe(
        1
      );
    });

    it('instruments ToolCallingAgent and propagates toolCallId onto execute_tool spans', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });

      const lookupTool = new DynamicTool({
        name: 'lookup_user',
        description: 'Looks up user by ID',
        inputSchema: z.object({ userId: z.string() }),
        handler: async input =>
          new StringToolOutput(`User ${input.userId} is Alice`),
      });

      const llm = new MockChatModel({
        modelId: 'gpt-4o',
        providerId: 'openai',
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage({
                  type: 'tool-call',
                  toolCallId: 'call_abc123',
                  toolName: 'lookup_user',
                  args: { userId: '42' },
                }),
              ],
              { promptTokens: 30, completionTokens: 12, totalTokens: 42 },
              'tool-calls'
            ),
          (input: ChatModelInput) => {
            const hasFinalAnswerTool = input.tools?.some(
              t => t.name === 'final_answer'
            );
            return new ChatModelOutput(
              [
                hasFinalAnswerTool
                  ? new AssistantMessage({
                      type: 'tool-call',
                      toolCallId: 'call_final999',
                      toolName: 'final_answer',
                      args: { response: 'User 42 is Alice.' },
                    })
                  : new AssistantMessage('User 42 is Alice.'),
              ],
              { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
              hasFinalAnswerTool ? 'tool-calls' : 'stop'
            );
          },
        ],
      });

      const agent = new ToolCallingAgent({
        llm,
        memory: new UnconstrainedMemory(),
        tools: [lookupTool],
      });

      const response = await agent.run({ prompt: 'Who is user 42?' });
      expect(response.result.text).toBe('User 42 is Alice.');

      const spans = getTestSpans();
      const agentSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      );
      const toolSpans = spans.filter(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      );
      const lookupSpan = toolSpans.find(
        s => s.attributes[ATTR_GEN_AI_TOOL_NAME] === 'lookup_user'
      );

      expect(agentSpan).toBeDefined();
      expect(agentSpan!.name).toBe('invoke_agent ToolCalling');
      expect(toolSpans).toHaveLength(1);
      expect(lookupSpan).toBeDefined();
      expect(lookupSpan!.parentSpanContext?.spanId).toBe(
        agentSpan!.spanContext().spanId
      );
      expect(lookupSpan!.attributes[ATTR_GEN_AI_TOOL_CALL_ID]).toBe(
        'call_abc123'
      );
      expect(lookupSpan!.attributes[ATTR_GEN_AI_AGENT_NAME]).toBe(
        'ToolCalling'
      );

      const { resourceMetrics } = await metricReader.collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const toolCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      expect((toolCalls?.dataPoints[0]?.value as { sum?: number })?.sum).toBe(
        1
      );
    });

    it('extracts input messages from pre-populated agent memory when prompt is null', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const agent = new CustomAgent();
      await agent.memory.add(new SystemMessage('System rule'));
      await agent.memory.add(new UserMessage('Message from memory'));

      const response = await agent.run({ prompt: null });
      expect(response.result.text).toBe('Handled: Message from memory');

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];
      expect(span.name).toBe('invoke_agent CustomAssistant');
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] as string)
      ).toEqual([{ type: 'text', content: 'System rule' }]);
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Message from memory' }],
        },
      ]);
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Handled: Message from memory' }],
        },
      ]);
    });

    it('does not roll tool-internal ChatModel tokens or inference_calls onto the parent agent span', async () => {
      const helperLlm = new MockChatModel({
        modelId: 'gpt-4o-mini',
        providerId: 'openai',
        responses: [
          () =>
            new ChatModelOutput(
              [new AssistantMessage('Condensed 50-word PDF summary.')],
              { promptTokens: 500, completionTokens: 100, totalTokens: 600 },
              'stop'
            ),
        ],
      });

      const innerHelperTool = new DynamicTool({
        name: 'normalize_text',
        description: 'Internal text normalizer called by summarize_pdf',
        inputSchema: z.object({ raw: z.string() }),
        handler: async input => new StringToolOutput(input.raw.trim()),
      });

      const summarizePdfTool = new DynamicTool({
        name: 'summarize_pdf',
        description: 'Summarizes a large PDF using a helper LLM',
        inputSchema: z.object({ docId: z.string() }),
        handler: async input => {
          const normalized = await innerHelperTool.run({
            raw: `  Contents of ${input.docId}  `,
          });
          const llmRes = await helperLlm.create({
            messages: [new UserMessage(normalized.getTextContent())],
          });
          return new StringToolOutput(llmRes.getTextContent());
        },
      });

      const agentLlm = new MockChatModel({
        modelId: 'claude-3-5-sonnet',
        providerId: 'anthropic',
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: I need to summarize doc_42.',
                    'Function Name: summarize_pdf',
                    'Function Input: {"docId":"doc_42"}',
                  ].join('\n')
                ),
              ],
              { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
              'stop'
            ),
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: I have the summary.',
                    'Final Answer: Condensed 50-word PDF summary.',
                  ].join('\n')
                ),
              ],
              { promptTokens: 65, completionTokens: 15, totalTokens: 80 },
              'stop'
            ),
          // Third response consumed when LLMTool shares the same ChatModel instance.
          () =>
            new ChatModelOutput(
              [new AssistantMessage('Extracted entities: Acme Corp')],
              { promptTokens: 300, completionTokens: 50, totalTokens: 350 },
              'stop'
            ),
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: Done.',
                    'Final Answer: Extracted entities: Acme Corp',
                  ].join('\n')
                ),
              ],
              { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
              'stop'
            ),
        ],
      });

      const agent = new ReActAgent({
        llm: agentLlm,
        memory: new UnconstrainedMemory(),
        tools: [summarizePdfTool],
      });

      const response = await agent.run({ prompt: 'Summarize doc_42' });
      expect(response.result.text).toBe('Condensed 50-word PDF summary.');

      const spans = getTestSpans();
      const agentSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      );
      const chatSpans = spans.filter(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      );
      const toolSpans = spans.filter(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      );

      expect(agentSpan).toBeDefined();
      expect(chatSpans).toHaveLength(3);
      expect(toolSpans).toHaveLength(2);

      // Agent span reports ONLY its own claude-3-5-sonnet turns (40+65=105 in, 20+15=35 out),
      // excluding the helper gpt-4o-mini call (500 in, 100 out).
      expect(agentSpan!.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe(
        'claude-3-5-sonnet'
      );
      expect(agentSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(105);
      expect(agentSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(35);

      const summarizeSpan = toolSpans.find(
        s => s.attributes[ATTR_GEN_AI_TOOL_NAME] === 'summarize_pdf'
      );
      const innerToolSpan = toolSpans.find(
        s => s.attributes[ATTR_GEN_AI_TOOL_NAME] === 'normalize_text'
      );
      const helperChatSpan = chatSpans.find(
        s => s.attributes[ATTR_GEN_AI_REQUEST_MODEL] === 'gpt-4o-mini'
      );

      expect(summarizeSpan).toBeDefined();
      expect(summarizeSpan!.attributes[ATTR_GEN_AI_AGENT_NAME]).toBe('ReAct');
      expect(innerToolSpan).toBeDefined();
      expect(innerToolSpan!.parentSpanContext?.spanId).toBe(
        summarizeSpan!.spanContext().spanId
      );
      expect(innerToolSpan!.attributes[ATTR_GEN_AI_AGENT_NAME]).toBeUndefined();

      expect(helperChatSpan).toBeDefined();
      expect(helperChatSpan!.parentSpanContext?.spanId).toBe(
        summarizeSpan!.spanContext().spanId
      );
      expect(helperChatSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(
        500
      );
      expect(helperChatSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(
        100
      );

      const { resourceMetrics } = await metricReader.collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const inferenceCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
      );
      const toolCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      const clientInputUsage = metrics.find(
        m =>
          m.descriptor.name ===
          METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS
      );

      expect(
        (inferenceCalls?.dataPoints[0]?.value as { sum?: number })?.sum
      ).toBe(2);
      expect((toolCalls?.dataPoints[0]?.value as { sum?: number })?.sum).toBe(
        1
      );
      // Both models are still accounted for in client inference usage metrics.
      let totalClientInputTokens = 0;
      for (const dp of clientInputUsage?.dataPoints ?? []) {
        if (typeof dp.value === 'number') {
          totalClientInputTokens += dp.value;
        }
      }
      expect(totalClientInputTokens).toBe(605);

      // Also verify built-in LLMTool sharing the exact same ChatModel instance as the agent.
      resetMemoryExporter();
      const sharedLlmTool = new LLMTool({ llm: agentLlm });
      const memory = new UnconstrainedMemory();
      await memory.add(new UserMessage('Acme Corp signed the contract.'));

      class LLMToolCallerAgent extends BaseAgent<
        { prompt: string },
        { result: AssistantMessage }
      > {
        public emitter = Emitter.root.child({
          namespace: ['agent', 'llmToolCaller'],
          creator: this,
        });
        public memory = memory;
        protected readonly input = { llm: agentLlm };

        override get meta() {
          return {
            name: 'EntityAgent',
            description: 'Calls LLMTool',
            tools: [],
          };
        }

        protected async _run(input: { prompt: string }) {
          const toolOut = await sharedLlmTool
            .run({ task: input.prompt })
            .context({ [Tool.contextKeys.Memory]: this.memory });
          const finalChat = await agentLlm.create({
            messages: [new UserMessage(toolOut.getTextContent())],
          });
          return { result: new AssistantMessage(finalChat.getTextContent()) };
        }

        override loadSnapshot() {}
      }

      const entityAgent = new LLMToolCallerAgent();
      await entityAgent.run({ prompt: 'Extract entities' });

      const secondSpans = getTestSpans();
      const entityAgentSpan = secondSpans.find(
        s => s.name === 'invoke_agent EntityAgent'
      );
      expect(entityAgentSpan).toBeDefined();
      // Only the agent's own finalChat call (50 in, 10 out) rolls onto EntityAgent,
      // not sharedLlmTool's internal call (300 in, 50 out).
      expect(entityAgentSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(
        50
      );
      expect(entityAgentSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(
        10
      );
    });

    it('tracks nested sub-agent usage and call counts independently inside an agent-as-tool', async () => {
      const subLlm = new MockChatModel({
        modelId: 'gpt-4o-mini',
        providerId: 'openai',
        responses: [
          () =>
            new ChatModelOutput(
              [new AssistantMessage('Final Answer: Paris is 18C.')],
              { promptTokens: 80, completionTokens: 25, totalTokens: 105 },
              'stop'
            ),
        ],
      });
      const subAgent = new ReActAgent({
        llm: subLlm,
        memory: new UnconstrainedMemory(),
        meta: { name: 'WeatherSpecialist', description: 'Weather sub-agent' },
        tools: [],
      });

      const delegateTool = new DynamicTool({
        name: 'ask_weather_specialist',
        description: 'Delegates weather queries to WeatherSpecialist',
        inputSchema: z.object({ question: z.string() }),
        handler: async input => {
          const subRes = await subAgent.run({ prompt: input.question });
          return new StringToolOutput(subRes.result.text);
        },
      });

      const rootLlm = new MockChatModel({
        modelId: 'claude-3-5-sonnet',
        providerId: 'anthropic',
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: Ask specialist.',
                    'Function Name: ask_weather_specialist',
                    'Function Input: {"question":"Weather in Paris?"}',
                  ].join('\n')
                ),
              ],
              { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
              'stop'
            ),
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  ['Thought: Got it.', 'Final Answer: Paris is 18C.'].join('\n')
                ),
              ],
              { promptTokens: 45, completionTokens: 10, totalTokens: 55 },
              'stop'
            ),
        ],
      });
      const rootAgent = new ReActAgent({
        llm: rootLlm,
        memory: new UnconstrainedMemory(),
        meta: { name: 'RootCoordinator', description: 'Root coordinator' },
        tools: [delegateTool],
      });

      const res = await rootAgent.run({ prompt: 'Weather in Paris?' });
      expect(res.result.text).toBe('Paris is 18C.');

      const spans = getTestSpans();
      const rootSpan = spans.find(
        s => s.name === 'invoke_agent RootCoordinator'
      );
      const subSpan = spans.find(
        s => s.name === 'invoke_agent WeatherSpecialist'
      );
      expect(rootSpan).toBeDefined();
      expect(subSpan).toBeDefined();
      expect(rootSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(75);
      expect(rootSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(25);
      expect(subSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(80);
      expect(subSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(25);
    });
  });

  describe('Context propagation, suppression, and lifecycle controls', () => {
    const createTestAgent = (
      name: string,
      handler: (input: { prompt: string }) => Promise<string>
    ) => {
      class InlineAgent extends BaseAgent<
        { prompt: string },
        { result: AssistantMessage }
      > {
        public emitter = Emitter.root.child({
          namespace: ['agent', name],
          creator: this,
        });
        public memory = new UnconstrainedMemory();

        override get meta() {
          return { name, description: `${name} test agent`, tools: [] };
        }

        protected async _run(input: { prompt: string }) {
          return { result: new AssistantMessage(await handler(input)) };
        }

        override loadSnapshot() {}
      }
      return new InlineAgent();
    };

    it('does not emit spans when instrumentation is disabled', async () => {
      instrumentation.disable();
      const agent = new CustomAgent();
      const result = await agent.run({ prompt: 'Disabled check' });
      expect(result.result.text).toBe('Handled: Disabled check');
      expect(getTestSpans()).toHaveLength(0);
    });

    it('does not emit spans when tracing is suppressed', async () => {
      const agent = new CustomAgent();
      const result = await context.with(suppressTracing(context.active()), () =>
        agent.run({ prompt: 'Suppressed check' })
      );
      expect(result.result.text).toBe('Handled: Suppressed check');
      expect(getTestSpans()).toHaveLength(0);
    });

    it('parents spans to the caller OpenTelemetry context even when an outer span is active', async () => {
      const tracer = trace.getTracer('test-outer');
      const httpSpan = tracer.startSpan('http-request');
      const httpContext = trace.setSpan(context.active(), httpSpan);

      const customSpan = tracer.startSpan(
        'custom-parent',
        undefined,
        httpContext
      );
      const customContext = trace.setSpan(httpContext, customSpan);

      const agent = new CustomAgent();
      await context.with(httpContext, async () => {
        await context.with(customContext, () =>
          agent.run({ prompt: 'Parentage test' })
        );
      });
      customSpan.end();
      httpSpan.end();

      const spans = getTestSpans();
      const agentSpan = spans.find(
        s => s.name === 'invoke_agent CustomAssistant'
      );
      expect(agentSpan).toBeDefined();
      expect(agentSpan!.parentSpanContext?.spanId).toBe(
        customSpan.spanContext().spanId
      );
    });

    it('preserves lazy Run builder chaining (.context, .middleware, .observe) before awaiting', async () => {
      let handlerRuns = 0;
      let middlewareCalled = false;
      let observeCalled = false;

      const tool = new DynamicTool({
        name: 'hook_tool',
        description: 'Tests Run chaining',
        inputSchema: z.object({ value: z.string() }),
        handler: async (input, _options, run) => {
          handlerRuns++;
          const extra = (run.context as { tag?: string }).tag ?? '';
          return new StringToolOutput(`${input.value}:${extra}`);
        },
      });

      const run = tool
        .run({ value: 'ok' })
        .context({ tag: 'ctx-val' })
        .middleware(() => {
          middlewareCalled = true;
        })
        .observe(emitter => {
          emitter.on('start', () => {
            observeCalled = true;
          });
        });

      // Run is lazy: building the chain must not execute the handler or start spans yet.
      expect(handlerRuns).toBe(0);
      expect(getTestSpans()).toHaveLength(0);

      const output = await run;
      expect(handlerRuns).toBe(1);
      expect(middlewareCalled).toBe(true);
      expect(observeCalled).toBe(true);
      expect(output.getTextContent()).toBe('ok:ctx-val');
      expect(getTestSpans()).toHaveLength(1);
    });

    it('preserves cold LazyPromise re-execution and late .context/.observe/.middleware chaining', async () => {
      let handlerRuns = 0;
      const tool = new DynamicTool({
        name: 'reexec_tool',
        description: 'Tests cold LazyPromise re-execution parity',
        inputSchema: z.object({ value: z.string() }),
        handler: async (input, _options, run) => {
          handlerRuns++;
          const tag = (run.context as { tag?: string }).tag ?? 'none';
          return new StringToolOutput(`${input.value}:${tag}:${handlerRuns}`);
        },
      });

      // 1. Re-awaiting the same Run executes the underlying handler each time
      //    (matching native BeeAI LazyPromise semantics) and records a span per run.
      const reusableRun = tool.run({ value: 'poll' });
      const firstOut = await reusableRun;
      const secondOut = await reusableRun;

      expect(firstOut.getTextContent()).toBe('poll:none:1');
      expect(secondOut.getTextContent()).toBe('poll:none:2');
      expect(handlerRuns).toBe(2);
      expect(
        getTestSpans().filter(s => s.name === 'execute_tool reexec_tool')
      ).toHaveLength(2);

      // 2. In BeeAI, `.catch()` triggers an initial LazyPromise execution; chaining
      //    `.context()`, `.middleware()`, and `.observe()` afterwards must still run
      //    fresh on the subsequent `await` rather than returning a stale cached promise.
      resetMemoryExporter();
      handlerRuns = 0;
      let lateMiddlewareRuns = 0;
      let lateObservedStarts = 0;

      const chainedRun = tool.run({ value: 'late' });
      chainedRun.catch(() => {});
      await new Promise(resolve => setImmediate(resolve));

      const lateOut = await chainedRun
        .context({ tag: 'set-late' })
        .middleware(() => {
          lateMiddlewareRuns++;
        })
        .observe(emitter => {
          emitter.on('start', () => {
            lateObservedStarts++;
          });
        });

      expect(lateOut.getTextContent()).toBe('late:set-late:2');
      expect(handlerRuns).toBe(2);
      expect(lateMiddlewareRuns).toBe(1);
      expect(lateObservedStarts).toBe(1);
      expect(
        getTestSpans().filter(s => s.name === 'execute_tool reexec_tool')
      ).toHaveLength(2);
    });

    it('re-parents re-awaited and deferred cold Runs to the active execution context after the creation span ends', async () => {
      const tracer = trace.getTracer('test-cold-run');
      const tool = new DynamicTool({
        name: 'cross_trace_tool',
        description: 'Tests cold Run parentage across traces',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => new StringToolOutput(`ok:${input.value}`),
      });

      // 1. Construct and await inside req1Span, then end req1Span and re-await inside req2Span and ROOT_CONTEXT.
      const req1Span = tracer.startSpan('http-req-1', undefined, ROOT_CONTEXT);
      const req1Ctx = trace.setSpan(ROOT_CONTEXT, req1Span);
      const reusableRun = context.with(req1Ctx, () =>
        tool.run({ value: 'first' })
      );
      await context.with(req1Ctx, async () => await reusableRun);
      req1Span.end();

      const req2Span = tracer.startSpan('http-req-2', undefined, ROOT_CONTEXT);
      const req2Ctx = trace.setSpan(ROOT_CONTEXT, req2Span);
      await context.with(req2Ctx, async () => await reusableRun);
      req2Span.end();

      await context.with(ROOT_CONTEXT, async () => await reusableRun);

      const toolSpans = getTestSpans().filter(
        s => s.name === 'execute_tool cross_trace_tool'
      );
      expect(toolSpans).toHaveLength(3);
      expect(toolSpans[0].spanContext().traceId).toBe(
        req1Span.spanContext().traceId
      );
      expect(toolSpans[0].parentSpanContext?.spanId).toBe(
        req1Span.spanContext().spanId
      );
      expect(toolSpans[1].spanContext().traceId).toBe(
        req2Span.spanContext().traceId
      );
      expect(toolSpans[1].parentSpanContext?.spanId).toBe(
        req2Span.spanContext().spanId
      );
      expect(toolSpans[2].parentSpanContext).toBeUndefined();
      expect(toolSpans[2].spanContext().traceId).not.toBe(
        req1Span.spanContext().traceId
      );
      expect(toolSpans[2].spanContext().traceId).not.toBe(
        req2Span.spanContext().traceId
      );

      // 2. First await deferred until AFTER creation span ends (both under req3 and standalone root).
      resetMemoryExporter();
      const endedSpan = tracer.startSpan(
        'ended-creator',
        undefined,
        ROOT_CONTEXT
      );
      const endedCtx = trace.setSpan(ROOT_CONTEXT, endedSpan);
      const [deferredForReq, deferredForRoot] = context.with(endedCtx, () => [
        tool.run({ value: 'for-req' }),
        tool.run({ value: 'for-root' }),
      ]);
      endedSpan.end();

      const req3Span = tracer.startSpan('http-req-3', undefined, ROOT_CONTEXT);
      const req3Ctx = trace.setSpan(ROOT_CONTEXT, req3Span);
      await context.with(req3Ctx, async () => await deferredForReq);
      req3Span.end();

      await context.with(ROOT_CONTEXT, async () => await deferredForRoot);

      const deferredSpans = getTestSpans().filter(
        s => s.name === 'execute_tool cross_trace_tool'
      );
      expect(deferredSpans).toHaveLength(2);
      expect(deferredSpans[0].spanContext().traceId).toBe(
        req3Span.spanContext().traceId
      );
      expect(deferredSpans[0].parentSpanContext?.spanId).toBe(
        req3Span.spanContext().spanId
      );
      expect(deferredSpans[1].parentSpanContext).toBeUndefined();
      expect(deferredSpans[1].spanContext().traceId).not.toBe(
        endedSpan.spanContext().traceId
      );
    });

    it('prefers active executionContext over an open callerSpan from a different trace', async () => {
      const tracer = trace.getTracer('test-cross-trace');
      const tool = new DynamicTool({
        name: 'handoff_tool',
        description: 'Tests concurrent cross-trace handoff',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => new StringToolOutput(input.value),
      });

      const req1Span = tracer.startSpan('req-1', undefined, ROOT_CONTEXT);
      const req1Ctx = trace.setSpan(ROOT_CONTEXT, req1Span);
      const req2Span = tracer.startSpan('req-2', undefined, ROOT_CONTEXT);
      const req2Ctx = trace.setSpan(ROOT_CONTEXT, req2Span);

      // Construct cold Run in req-1 while both spans remain open, await in req-2.
      const handoffRun = context.with(req1Ctx, () =>
        tool.run({ value: 'concurrent' })
      );
      await context.with(req2Ctx, async () => await handoffRun);
      req1Span.end();
      req2Span.end();

      const toolSpan = getTestSpans().find(
        s => s.name === 'execute_tool handoff_tool'
      );
      expect(toolSpan).toBeDefined();
      expect(toolSpan!.spanContext().traceId).toBe(
        req2Span.spanContext().traceId
      );
      expect(toolSpan!.parentSpanContext?.spanId).toBe(
        req2Span.spanContext().spanId
      );
    });

    it('preserves valid remote parent SpanContext on initial await and clears it on re-execution', async () => {
      const tracer = trace.getTracer('test-remote-parent');
      const tool = new DynamicTool({
        name: 'remote_parent_tool',
        description: 'Tests inbound remote parent context propagation',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => new StringToolOutput(input.value),
      });

      const remoteTraceId = '0123456789abcdef0123456789abcdef';
      const remoteSpanId = '0123456789abcdef';
      const remoteCtx = trace.setSpanContext(ROOT_CONTEXT, {
        traceId: remoteTraceId,
        spanId: remoteSpanId,
        traceFlags: TraceFlags.SAMPLED,
        isRemote: true,
      });

      // Mirror `propagation.extract`: context.with() pops back to ROOT_CONTEXT before await.
      const run = context.with(remoteCtx, () => tool.run({ value: 'inbound' }));
      await run;

      const req2Span = tracer.startSpan('local-req-2', undefined, ROOT_CONTEXT);
      const req2Ctx = trace.setSpan(ROOT_CONTEXT, req2Span);
      await context.with(req2Ctx, async () => await run);
      req2Span.end();

      const toolSpans = getTestSpans().filter(
        s => s.name === 'execute_tool remote_parent_tool'
      );
      expect(toolSpans).toHaveLength(2);
      expect(toolSpans[0].spanContext().traceId).toBe(remoteTraceId);
      expect(toolSpans[0].parentSpanContext?.spanId).toBe(remoteSpanId);
      expect(toolSpans[1].spanContext().traceId).toBe(
        req2Span.spanContext().traceId
      );
      expect(toolSpans[1].parentSpanContext?.spanId).toBe(
        req2Span.spanContext().spanId
      );
    });

    it('propagates inline suppressTracing to nested calls without permanently muting reusable cold Runs', async () => {
      const tracer = trace.getTracer('test-suppression');
      const innerTool = new DynamicTool({
        name: 'suppressed_tool',
        description: 'Tests suppression lifecycle',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => new StringToolOutput(input.value),
      });

      // 1. Inline suppression of an agent run suppresses both the agent span and its nested tool span.
      const agent = createTestAgent('SuppressedParentAgent', async input => {
        const out = await innerTool.run({ value: input.prompt });
        return out.getTextContent();
      });
      await context.with(suppressTracing(ROOT_CONTEXT), () =>
        agent.run({ prompt: 'quiet' })
      );
      expect(getTestSpans()).toHaveLength(0);

      // 2. Inline suppression inside an active traced request skips only the tool call.
      const reqSpan = tracer.startSpan('active-req', undefined, ROOT_CONTEXT);
      const reqCtx = trace.setSpan(ROOT_CONTEXT, reqSpan);
      await context.with(reqCtx, async () => {
        await context.with(suppressTracing(context.active()), () =>
          innerTool.run({ value: 'muted-in-req' })
        );
      });
      reqSpan.end();
      expect(
        getTestSpans().filter(s => s.name === 'execute_tool suppressed_tool')
      ).toHaveLength(0);

      // 3. Re-awaiting a cold Run originally built under suppressTracing traces normally on reuse.
      resetMemoryExporter();
      const reusableSuppressed = context.with(
        suppressTracing(ROOT_CONTEXT),
        () => innerTool.run({ value: 'reusable' })
      );
      await reusableSuppressed; // initial await in ROOT_CONTEXT is suppressed
      expect(getTestSpans()).toHaveLength(0);

      const req2Span = tracer.startSpan('after-reuse', undefined, ROOT_CONTEXT);
      await context.with(
        trace.setSpan(ROOT_CONTEXT, req2Span),
        async () => await reusableSuppressed
      );
      req2Span.end();
      const reusedSpans = getTestSpans().filter(
        s => s.name === 'execute_tool suppressed_tool'
      );
      expect(reusedSpans).toHaveLength(1);
      expect(reusedSpans[0].spanContext().traceId).toBe(
        req2Span.spanContext().traceId
      );

      // 4. First-awaiting a startup-suppressed cold Run inside an active request span emits telemetry.
      resetMemoryExporter();
      const prebuilt = context.with(suppressTracing(ROOT_CONTEXT), () =>
        innerTool.run({ value: 'startup' })
      );
      const req3Span = tracer.startSpan('traced-req', undefined, ROOT_CONTEXT);
      await context.with(
        trace.setSpan(ROOT_CONTEXT, req3Span),
        async () => await prebuilt
      );
      req3Span.end();
      const prebuiltSpans = getTestSpans().filter(
        s => s.name === 'execute_tool suppressed_tool'
      );
      expect(prebuiltSpans).toHaveLength(1);
      expect(prebuiltSpans[0].spanContext().traceId).toBe(
        req3Span.spanContext().traceId
      );
      expect(prebuiltSpans[0].parentSpanContext?.spanId).toBe(
        req3Span.spanContext().spanId
      );

      // 5. Synchronous throws while tracing is suppressed emit zero error spans.
      resetMemoryExporter();
      const syncAgent = new CustomAgent();
      (syncAgent as unknown as { isRunning: boolean }).isRunning = true;
      expect(() =>
        context.with(suppressTracing(ROOT_CONTEXT), () =>
          syncAgent.run({ prompt: 'concurrent' })
        )
      ).toThrow('Agent is already running!');
      expect(getTestSpans()).toHaveLength(0);
    });

    it('does not leak enclosing agent attribution from stale or finished agent runs on deferred cold Runs', async () => {
      const tracer = trace.getTracer('test-stale-agent');
      const leafTool = new DynamicTool({
        name: 'deferred_leaf_tool',
        description: 'Built inside one agent, executed inside another',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => new StringToolOutput(input.value),
      });

      let deferredToolRun: ReturnType<typeof leafTool.run> | undefined;

      const producerAgent = createTestAgent('ProducerAgent', async input => {
        deferredToolRun = leafTool.run({ value: input.prompt });
        return 'deferred';
      });
      const consumerAgent = createTestAgent('ConsumerAgent', async () => {
        const out = await deferredToolRun!;
        return out.getTextContent();
      });

      await producerAgent.run({ prompt: 'deferred-val' });
      expect(deferredToolRun).toBeDefined();

      // ProducerAgent is finished and its span has ended. Awaiting the Run inside
      // ConsumerAgent must parent and count the tool call under ConsumerAgent.
      await consumerAgent.run({ prompt: 'consume' });

      // Concurrent cross-trace checks: keep OpenProducerAgent open while awaiting
      // its cold tool Runs inside (a) a separate plain span and (b) another active agent.
      let releaseConcurrentProducer!: () => void;
      let concurrentExternalRun: ReturnType<typeof leafTool.run> | undefined;
      let concurrentAgentRun: ReturnType<typeof leafTool.run> | undefined;
      let notifyCreated!: () => void;
      const createdPromise = new Promise<void>(resolve => {
        notifyCreated = resolve;
      });

      const openProducerAgent = createTestAgent(
        'OpenProducerAgent',
        async () => {
          concurrentExternalRun = leafTool.run({ value: 'concurrent-span' });
          concurrentAgentRun = leafTool.run({ value: 'concurrent-agent' });
          notifyCreated();
          await new Promise<void>(resolve => {
            releaseConcurrentProducer = resolve;
          });
          return 'done';
        }
      );
      const concurrentConsumerAgent = createTestAgent(
        'ConcurrentConsumerAgent',
        async () => {
          const out = await concurrentAgentRun!;
          return out.getTextContent();
        }
      );

      const openRunPromise = Promise.resolve(
        openProducerAgent.run({ prompt: 'hold' })
      );
      await createdPromise;
      const externalSpan = tracer.startSpan(
        'external-req',
        undefined,
        ROOT_CONTEXT
      );
      await context.with(
        trace.setSpan(ROOT_CONTEXT, externalSpan),
        async () => await concurrentExternalRun!
      );
      externalSpan.end();
      await context.with(
        ROOT_CONTEXT,
        async () => await concurrentConsumerAgent.run({ prompt: 'take-over' })
      );
      releaseConcurrentProducer();
      await openRunPromise;

      const spans = getTestSpans();
      const producerSpan = spans.find(
        s => s.name === 'invoke_agent ProducerAgent'
      );
      const consumerSpan = spans.find(
        s => s.name === 'invoke_agent ConsumerAgent'
      );
      const concurrentConsumerSpan = spans.find(
        s => s.name === 'invoke_agent ConcurrentConsumerAgent'
      );
      const toolSpans = spans.filter(
        s => s.name === 'execute_tool deferred_leaf_tool'
      );
      expect(producerSpan).toBeDefined();
      expect(consumerSpan).toBeDefined();
      expect(concurrentConsumerSpan).toBeDefined();
      expect(toolSpans).toHaveLength(3);

      // 1st tool span: deferred inside finished ProducerAgent, awaited inside ConsumerAgent
      expect(toolSpans[0].spanContext().traceId).toBe(
        consumerSpan!.spanContext().traceId
      );
      expect(toolSpans[0].parentSpanContext?.spanId).toBe(
        consumerSpan!.spanContext().spanId
      );
      // 2nd tool span: created inside OpenProducerAgent, awaited inside separate trace externalSpan
      expect(toolSpans[1].spanContext().traceId).toBe(
        externalSpan.spanContext().traceId
      );
      expect(toolSpans[1].parentSpanContext?.spanId).toBe(
        externalSpan.spanContext().spanId
      );
      // 3rd tool span: created inside OpenProducerAgent, awaited inside concurrent ConcurrentConsumerAgent
      expect(toolSpans[2].spanContext().traceId).toBe(
        concurrentConsumerSpan!.spanContext().traceId
      );
      expect(toolSpans[2].parentSpanContext?.spanId).toBe(
        concurrentConsumerSpan!.spanContext().spanId
      );

      const { resourceMetrics } = await metricReader.collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const toolCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      const toolCallCountFor = (name: string): number | undefined => {
        for (const dp of toolCalls?.dataPoints ?? []) {
          if (dp.attributes[ATTR_GEN_AI_AGENT_NAME] === name) {
            return (dp.value as { sum?: number }).sum;
          }
        }
        return undefined;
      };
      expect(toolCallCountFor('ProducerAgent')).toBe(0);
      expect(toolCallCountFor('ConsumerAgent')).toBe(1);
      expect(toolCallCountFor('OpenProducerAgent')).toBe(0);
      expect(toolCallCountFor('ConcurrentConsumerAgent')).toBe(1);
    });

    it('logs a warning and skips patching when manuallyInstrument receives an unsupported version', () => {
      const warnSpy = sinon.spy();
      diag.setLogger(
        {
          error: () => {},
          warn: warnSpy,
          info: () => {},
          debug: () => {},
          verbose: () => {},
        },
        DiagLogLevel.WARN
      );
      const customInst = new BeeAIInstrumentation();
      try {
        customInst.manuallyInstrument({
          ...bee,
          Version: '0.2.0',
        });
        expect(warnSpy.calledOnce).toBe(true);
        expect(warnSpy.firstCall.args.join(' ')).toContain(
          'DependencyConflict'
        );
      } finally {
        customInst.disable();
        diag.disable();
      }
    });

    it('emits telemetry for a pre-constructed lazy Run across disable() and enable() cycles', async () => {
      let runs = 0;
      const tool = new DynamicTool({
        name: 'toggle_cycle_tool',
        description: 'Tests lazy Run owner lookup across disable/enable',
        inputSchema: z.object({ value: z.string() }),
        handler: async input => {
          runs++;
          return new StringToolOutput(`${input.value}:${runs}`);
        },
      });

      // Construct lazy Run while enabled, then toggle disable() -> enable()
      const prebuiltRun = tool.run({ value: 'ping' });

      instrumentation.disable();
      const disabledOut = await prebuiltRun;
      expect(disabledOut.getTextContent()).toBe('ping:1');
      expect(getTestSpans()).toHaveLength(0);

      instrumentation.enable();
      const reenabledOut = await prebuiltRun;
      expect(reenabledOut.getTextContent()).toBe('ping:2');
      const spans = getTestSpans().filter(
        s => s.name === 'execute_tool toggle_cycle_tool'
      );
      expect(spans).toHaveLength(1);
    });

    it('patches subpath modules without BaseAgent and unpatches manual targets on disable()', () => {
      class DummySubpathTool {
        run() {
          return 'original';
        }
      }
      const originalRun = DummySubpathTool.prototype.run;
      const customInst = new BeeAIInstrumentation({ enabled: false });
      customInst.manuallyInstrument({
        Tool: DummySubpathTool as unknown as typeof bee.Tool,
      });
      expect(DummySubpathTool.prototype.run).toBe(originalRun);

      customInst.enable();
      expect(DummySubpathTool.prototype.run).not.toBe(originalRun);

      customInst.disable();
      expect(DummySubpathTool.prototype.run).toBe(originalRun);
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

    it('records synchronous errors thrown before Run execution starts', () => {
      const agent = new CustomAgent();
      (agent as unknown as { isRunning: boolean }).isRunning = true;

      expect(() => agent.run({ prompt: 'concurrent' })).toThrow(
        'Agent is already running!'
      );

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
      expect(spans[0].attributes[ATTR_ERROR_TYPE]).toBe('AgentError');
    });
  });

  describe('LangChain adapter boundary ownership', () => {
    it('skips duplicate BeeAI spans and metrics on LangChainTool, LangChainChatModel, and LangChainEmbeddingModel while propagating parent context', async () => {
      const tracer = trace.getTracer('test-app');
      const parentSpan = tracer.startSpan('app-request');
      const parentCtx = trace.setSpan(context.active(), parentSpan);

      let seenToolSpanId: string | undefined;
      let seenChatSpanId: string | undefined;
      let seenEmbSpanId: string | undefined;

      const mockLcTool = {
        name: 'lc_search',
        description: 'LangChain delegated search tool',
        schema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false,
        },
        metadata: {},
        invoke: async (arg: { query: string }) => {
          seenToolSpanId = trace
            .getSpan(context.active())
            ?.spanContext().spanId;
          return { hit: arg.query };
        },
      };
      const beeLcTool = new LangChainTool({
        tool: mockLcTool as unknown as ConstructorParameters<
          typeof LangChainTool
        >[0]['tool'],
      });

      const mockLcChat = {
        model: 'gpt-4o-mini',
        _modelType: () => 'base_chat_model',
        invoke: async () => {
          seenChatSpanId = trace
            .getSpan(context.active())
            ?.spanContext().spanId;
          return {
            content: 'Delegated chat reply',
            usage_metadata: {
              input_tokens: 11,
              output_tokens: 7,
              total_tokens: 18,
            },
            response_metadata: { stop_sequence: 'stop' },
          };
        },
      };
      const beeLcChat = new LangChainChatModel(
        mockLcChat as unknown as ConstructorParameters<
          typeof LangChainChatModel
        >[0]
      );

      const mockLcEmbedding = {
        embedDocuments: async (values: string[]) => {
          seenEmbSpanId = trace.getSpan(context.active())?.spanContext().spanId;
          return values.map(() => [0.25, 0.5, 0.75]);
        },
      };
      const beeLcEmbedding = new LangChainEmbeddingModel(
        mockLcEmbedding as unknown as ConstructorParameters<
          typeof LangChainEmbeddingModel
        >[0]
      );

      // Build lazy Runs inside parentCtx and await them outside parentCtx to verify
      // passthrough parent context propagation into delegated calls.
      const [toolRun, chatRun, embRun] = context.with(
        parentCtx,
        () =>
          [
            beeLcTool.run({ query: 'otel' }),
            beeLcChat.create({ messages: [new UserMessage('Hello')] }),
            beeLcEmbedding.create({ values: ['embed-me'] }),
          ] as const
      );

      const toolOut = await toolRun;
      const chatOut = await chatRun;
      const embOut = await embRun;
      parentSpan.end();

      expect(toolOut.result).toEqual({ hit: 'otel' });
      expect(chatOut.getTextContent()).toBe('Delegated chat reply');
      expect(embOut.embeddings).toEqual([[0.25, 0.5, 0.75]]);

      const expectedParentId = parentSpan.spanContext().spanId;
      expect(seenToolSpanId).toBe(expectedParentId);
      expect(seenChatSpanId).toBe(expectedParentId);
      expect(seenEmbSpanId).toBe(expectedParentId);

      // Only the caller's `app-request` span should be emitted — zero BeeAI spans!
      const beeSpans = getTestSpans().filter(
        s =>
          s.instrumentationScope.name === '@opentelemetry/instrumentation-beeai'
      );
      expect(beeSpans).toHaveLength(0);

      const collected = await metricReader.collect();
      expect(collected.resourceMetrics.scopeMetrics).toHaveLength(0);
    });

    it('attributes call counts and parent context to an enclosing BeeAI agent without emitting duplicate child spans', async () => {
      let delegatedChatParentId: string | undefined;
      let delegatedToolParentId: string | undefined;

      const mockLcChat = {
        model: 'gpt-4o-mini',
        _modelType: () => 'base_chat_model',
        invoke: async () => {
          delegatedChatParentId = trace
            .getSpan(context.active())
            ?.spanContext().spanId;
          return {
            content: 'Agent reply via LangChain LLM',
            usage_metadata: {
              input_tokens: 9,
              output_tokens: 4,
              total_tokens: 13,
            },
            response_metadata: { stop_sequence: 'stop' },
          };
        },
      };
      const beeLcChat = new LangChainChatModel(
        mockLcChat as unknown as ConstructorParameters<
          typeof LangChainChatModel
        >[0]
      );

      const mockLcTool = {
        name: 'lc_calc',
        description: 'LangChain calculator',
        schema: {
          type: 'object',
          properties: { x: { type: 'number' } },
          required: ['x'],
          additionalProperties: false,
        },
        metadata: {},
        invoke: async (arg: { x: number }) => {
          delegatedToolParentId = trace
            .getSpan(context.active())
            ?.spanContext().spanId;
          return { doubled: arg.x * 2 };
        },
      };
      const beeLcTool = new LangChainTool({
        tool: mockLcTool as unknown as ConstructorParameters<
          typeof LangChainTool
        >[0]['tool'],
      });

      class DelegatingAgent extends BaseAgent<
        { prompt: string | null },
        { result: AssistantMessage }
      > {
        public emitter = Emitter.root.child({
          namespace: ['agent', 'delegating'],
          creator: this,
        });
        public memory = new UnconstrainedMemory();
        protected readonly input = { llm: beeLcChat };

        override get meta() {
          return {
            name: 'DelegatingAssistant',
            description: 'Uses LangChain adapters',
            tools: [],
          };
        }

        protected async _run(input: { prompt: string | null }) {
          await beeLcTool.run({ x: 21 });
          const chatRes = await beeLcChat.create({
            messages: [new UserMessage(input.prompt ?? 'hi')],
          });
          const answer = new AssistantMessage(chatRes.getTextContent());
          return { result: answer };
        }

        override createSnapshot() {
          return {
            ...super.createSnapshot(),
            emitter: this.emitter,
            memory: this.memory,
          };
        }

        override loadSnapshot() {}
      }

      const agent = new DelegatingAgent();
      const out = await agent.run({ prompt: 'compute' });
      expect(out.result.text).toBe('Agent reply via LangChain LLM');

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const agentSpan = spans[0];
      expect(agentSpan.name).toBe('invoke_agent DelegatingAssistant');
      expect(agentSpan.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      );
      // Extracts `lcLLM.model` ('gpt-4o-mini') rather than LangChain's internal 'base_chat_model' tag.
      expect(agentSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe(
        'gpt-4o-mini'
      );

      // Both delegated calls received the enclosing BeeAI agent span as active context.
      expect(delegatedChatParentId).toBe(agentSpan.spanContext().spanId);
      expect(delegatedToolParentId).toBe(agentSpan.spanContext().spanId);

      // Enclosing agent call-count metrics still recorded 1 inference call and 1 tool call.
      const collected = await metricReader.collect();
      const metrics = collected.resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const inferenceCallsMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
      );
      const toolCallsMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      expect(
        (inferenceCallsMetric?.dataPoints[0]?.value as { sum?: number })?.sum
      ).toBe(1);
      expect(
        (toolCallsMetric?.dataPoints[0]?.value as { sum?: number })?.sum
      ).toBe(1);
    });
  });

  describe('Experimental RemoteAgent opt-out', () => {
    it('skips local INTERNAL agent spans and metrics on RemoteAgent while preserving caller context', async () => {
      const remoteAgent = new RemoteAgent({
        agentName: 'weather-acp-agent',
        url: 'http://127.0.0.1:8080',
        memory: new UnconstrainedMemory(),
      });

      const remoteInternal = remoteAgent as unknown as {
        client: { stream: (...args: unknown[]) => AsyncGenerator<unknown> };
        isRunning: boolean;
      };
      let observedParentSpanId: string | undefined;
      sinon.stub(remoteInternal.client, 'stream').callsFake(async function* () {
        observedParentSpanId = trace.getActiveSpan()?.spanContext().spanId;
        yield {
          event: 'message',
          id: '1',
          data: JSON.stringify({
            type: 'run.completed',
            run: {
              output: [{ parts: [{ content: 'Sunny, 72F' }] }],
            },
          }),
        };
      });

      const appTracer = trace.getTracer('app-test');
      let callerSpanId: string | undefined;
      const out = await appTracer.startActiveSpan('caller-op', async span => {
        callerSpanId = span.spanContext().spanId;
        try {
          return await remoteAgent.run({ input: 'Weather in SF?' });
        } finally {
          span.end();
        }
      });

      expect(out.result.text).toBe('Sunny, 72F');
      expect(observedParentSpanId).toBe(callerSpanId);

      // Only the caller span should be emitted — no bogus INTERNAL invoke_agent span.
      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe('caller-op');

      // Also verify synchronous BaseAgent error path (`isRunning = true`) is skipped.
      remoteInternal.isRunning = true;
      expect(() => remoteAgent.run({ input: 'concurrent' })).toThrow(
        /already running/i
      );
      expect(getTestSpans()).toHaveLength(1);

      const collected = await metricReader.collect();
      const metrics = collected.resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      expect(metrics).toHaveLength(0);
    });
  });
});
