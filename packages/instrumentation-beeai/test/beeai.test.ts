/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  diag,
  DiagLogLevel,
  SpanKind,
  SpanStatusCode,
  trace,
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
import { ReActAgent } from 'beeai-framework/agents/react/agent';
import { ToolCallingAgent } from 'beeai-framework/agents/toolCalling/agent';
import { DummyChatModel as BaseDummyChatModel } from 'beeai-framework/adapters/dummy/backend/chat';
import { DummyEmbeddingModel as BaseDummyEmbeddingModel } from 'beeai-framework/adapters/dummy/backend/embedding';
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
} from 'beeai-framework/tools/base';
import { mapProviderName } from '../src/utils';

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
                } as unknown as bee.MessageContentPart),
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
                    } as unknown as bee.MessageContentPart)
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
  });

  describe('Context propagation, suppression, and lifecycle controls', () => {
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

      const customSpan = tracer.startSpan('custom-parent', undefined, httpContext);
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

    it('preserves Run middleware, observe, context, and catch chaining without duplicate execution', async () => {
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

      run.catch(() => {});

      expect(handlerRuns).toBe(0);
      const output = await run;
      expect(handlerRuns).toBe(1);
      expect(middlewareCalled).toBe(true);
      expect(observeCalled).toBe(true);
      expect(output.getTextContent()).toBe('ok:ctx-val');
      expect(getTestSpans()).toHaveLength(1);
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
      try {
        const customInst = new BeeAIInstrumentation();
        customInst.manuallyInstrument({
          ...bee,
          Version: '0.2.0',
        });
        expect(warnSpy.calledOnce).toBe(true);
        expect(warnSpy.firstCall.args.join(' ')).toContain(
          'DependencyConflict'
        );
      } finally {
        diag.disable();
      }
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
                  } as unknown as bee.MessageContentPart,
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
            } as unknown as bee.MessageContentPart,
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
});
