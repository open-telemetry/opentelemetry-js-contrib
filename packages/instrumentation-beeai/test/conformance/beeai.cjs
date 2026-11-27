/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('node:assert/strict');
const { BeeAIInstrumentation } = require('../../dist/index.cjs');
const {
  TracerProvider,
  SimpleSpanProcessor,
} = require('@opentelemetry/sdk-trace');
const {
  MeterProvider,
  PeriodicExportingMetricReader,
} = require('@opentelemetry/sdk-metrics');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-grpc');
const {
  OTLPMetricExporter,
} = require('@opentelemetry/exporter-metrics-otlp-grpc');

async function main() {
  const tracing = new TracerProvider({
    spanProcessors: [
      new SimpleSpanProcessor({ exporter: new OTLPTraceExporter() }),
    ],
  });
  const metering = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }),
    ],
  });
  const instrumentation = new BeeAIInstrumentation();
  instrumentation.setTracerProvider(tracing);
  instrumentation.setMeterProvider(metering);

  const bee = require('beeai-framework');
  instrumentation.manuallyInstrument(bee);

  const {
    DummyChatModel,
  } = require('beeai-framework/adapters/dummy/backend/chat');
  const {
    DummyEmbeddingModel,
  } = require('beeai-framework/adapters/dummy/backend/embedding');
  const { ChatModelOutput } = require('beeai-framework/backend/chat');
  const {
    AssistantMessage,
    UserMessage,
  } = require('beeai-framework/backend/message');
  const { ReActAgent } = require('beeai-framework/agents/react/agent');
  const {
    UnconstrainedMemory,
  } = require('beeai-framework/memory/unconstrainedMemory');
  const { DynamicTool, StringToolOutput } = require('beeai-framework');
  const { z } = require('zod');

  class TestChatModel extends DummyChatModel {
    constructor(text) {
      super('llama3.1');
      this._text = text;
    }
    get providerId() {
      return 'ollama';
    }
    async _create() {
      return new ChatModelOutput(
        [new AssistantMessage(this._text)],
        { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        'stop'
      );
    }
    async *_createStream() {
      yield await this._create();
    }
  }

  class TestEmbeddingModel extends DummyEmbeddingModel {
    constructor() {
      super('nomic-embed-text');
    }
    get providerId() {
      return 'ollama';
    }
    async _create(input) {
      return {
        values: input.values,
        embeddings: input.values.map(() => [0.1, 0.2, 0.3]),
        usage: { tokens: 10 },
      };
    }
  }

  const mode = process.argv[2] || 'tool';
  try {
    if (mode === 'agent') {
      const llm = new TestChatModel(
        'Thought: Ready.\nFinal Answer: Final response'
      );
      const agent = new ReActAgent({
        llm,
        memory: new UnconstrainedMemory(),
        tools: [],
      });
      const res = await agent.run({ prompt: 'hello' });
      assert.equal(res.result.text, 'Final response');
    } else if (mode === 'chat') {
      const llm = new TestChatModel('chat response');
      const res = await llm.create({ messages: [new UserMessage('hello')] });
      assert.equal(res.getTextContent(), 'chat response');
    } else if (mode === 'embeddings') {
      const embedder = new TestEmbeddingModel();
      const res = await embedder.create({ values: ['hello'] });
      assert.equal(res.embeddings.length, 1);
    } else {
      const tool = new DynamicTool({
        name: 'test_tool',
        description: 'Offline conformance tool scenario',
        inputSchema: z.object({ input: z.string() }),
        handler: async () => new StringToolOutput('tool result'),
      });
      const res = await tool.run({ input: 'hello' });
      assert.equal(res.getTextContent(), 'tool result');
    }
  } finally {
    instrumentation.disable();
    await tracing.shutdown();
    await metering.shutdown();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
