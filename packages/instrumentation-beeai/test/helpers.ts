/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { resetMemoryExporter } from '@opentelemetry/contrib-test-utils';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import * as sinon from 'sinon';

import { instrumentation } from './load-instrumentation';
import * as bee from 'beeai-framework';
import { BaseAgent } from 'beeai-framework/agents/base';
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
import { AssistantMessage, UserMessage } from 'beeai-framework/backend/message';
import { Emitter } from 'beeai-framework/emitter/emitter';
import { UnconstrainedMemory } from 'beeai-framework/memory/unconstrainedMemory';

export const CAPTURE_ENV_KEY =
  'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT';

export const ATTR_GEN_AI_AGENT_DESCRIPTION = 'gen_ai.agent.description';
export const ATTR_GEN_AI_AGENT_NAME = 'gen_ai.agent.name';
export const ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT =
  'gen_ai.embeddings.dimension.count';
export const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages';
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
export const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages';
export const ATTR_GEN_AI_PROVIDER_NAME = 'gen_ai.provider.name';
export const ATTR_GEN_AI_REQUEST_CHOICE_COUNT = 'gen_ai.request.choice.count';
export const ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY =
  'gen_ai.request.frequency_penalty';
export const ATTR_GEN_AI_REQUEST_MAX_TOKENS = 'gen_ai.request.max_tokens';
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model';
export const ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY =
  'gen_ai.request.presence_penalty';
export const ATTR_GEN_AI_REQUEST_SEED = 'gen_ai.request.seed';
export const ATTR_GEN_AI_REQUEST_STOP_SEQUENCES =
  'gen_ai.request.stop_sequences';
export const ATTR_GEN_AI_REQUEST_STREAM = 'gen_ai.request.stream';
export const ATTR_GEN_AI_REQUEST_TEMPERATURE = 'gen_ai.request.temperature';
export const ATTR_GEN_AI_REQUEST_TOP_K = 'gen_ai.request.top_k';
export const ATTR_GEN_AI_REQUEST_TOP_P = 'gen_ai.request.top_p';
export const ATTR_GEN_AI_RESPONSE_FINISH_REASONS =
  'gen_ai.response.finish_reasons';
export const ATTR_GEN_AI_RESPONSE_ID = 'gen_ai.response.id';
export const ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK =
  'gen_ai.response.time_to_first_chunk';
export const ATTR_GEN_AI_SYSTEM_INSTRUCTIONS = 'gen_ai.system_instructions';
export const ATTR_GEN_AI_TOOL_CALL_ARGUMENTS = 'gen_ai.tool.call.arguments';
export const ATTR_GEN_AI_TOOL_CALL_RESULT = 'gen_ai.tool.call.result';
export const ATTR_GEN_AI_TOOL_DESCRIPTION = 'gen_ai.tool.description';
export const ATTR_GEN_AI_TOOL_NAME = 'gen_ai.tool.name';
export const ATTR_GEN_AI_TOOL_TYPE = 'gen_ai.tool.type';
export const ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS =
  'gen_ai.usage.cache_read.input_tokens';
export const ATTR_GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens';
export const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens';
export const ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS =
  'gen_ai.usage.reasoning.output_tokens';

export const METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS =
  'gen_ai.client.inference.operation.input_tokens';
export const METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS =
  'gen_ai.client.inference.operation.output_tokens';
export const METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS =
  'gen_ai.client.inference.usage.input_tokens';
export const METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS =
  'gen_ai.client.inference.usage.output_tokens';
export const METRIC_GEN_AI_CLIENT_OPERATION_DURATION =
  'gen_ai.client.operation.duration';
export const METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK =
  'gen_ai.client.operation.time_per_output_chunk';
export const METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK =
  'gen_ai.client.operation.time_to_first_chunk';
export const METRIC_GEN_AI_EXECUTE_TOOL_DURATION =
  'gen_ai.execute_tool.duration';
export const METRIC_GEN_AI_INVOKE_AGENT_DURATION =
  'gen_ai.invoke_agent.duration';
export const METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS =
  'gen_ai.invoke_agent.inference_calls';
export const METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS =
  'gen_ai.invoke_agent.tool_calls';

export class TestMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

export class MockChatModel extends BaseDummyChatModel {
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

export class MockEmbeddingModel extends BaseDummyEmbeddingModel {
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

export interface CustomAgentInput {
  prompt: string | null;
}

export interface CustomAgentOutput {
  result: AssistantMessage;
}

export class CustomAgent extends BaseAgent<
  CustomAgentInput,
  CustomAgentOutput
> {
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

export function createTestAgent(
  name: string,
  handler: (input: { prompt: string }) => Promise<string>
): BaseAgent<{ prompt: string }, { result: AssistantMessage }> {
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
}

export function setupBeeAITestSuite(): {
  getMetricReader: () => TestMetricReader;
} {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;
  let originalCaptureEnv: string | undefined;

  before(() => {
    instrumentation.manuallyInstrument(bee);
  });

  beforeEach(() => {
    originalCaptureEnv = process.env[CAPTURE_ENV_KEY];
    delete process.env[CAPTURE_ENV_KEY];
    resetMemoryExporter();
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({ readers: [metricReader] });
    instrumentation.setMeterProvider(meterProvider);
    instrumentation.setConfig({});
    instrumentation.enable();
  });

  afterEach(async () => {
    sinon.restore();
    instrumentation.disable();
    await meterProvider.shutdown();
    if (originalCaptureEnv === undefined) {
      delete process.env[CAPTURE_ENV_KEY];
    } else {
      process.env[CAPTURE_ENV_KEY] = originalCaptureEnv;
    }
  });

  return {
    getMetricReader: () => metricReader,
  };
}
