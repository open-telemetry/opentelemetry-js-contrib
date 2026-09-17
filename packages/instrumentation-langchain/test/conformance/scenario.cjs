/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { context, trace } = require('@opentelemetry/api');
const {
  AsyncLocalStorageContextManager,
} = require('@opentelemetry/context-async-hooks');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-grpc');
const {
  SimpleSpanProcessor,
  TracerProvider,
} = require('@opentelemetry/sdk-trace');

const packageRoot = path.resolve(__dirname, '..', '..');

function configureTelemetry(captureMode) {
  process.env.LANGSMITH_TRACING = 'false';
  process.env.LANGCHAIN_TRACING_V2 = 'false';
  process.env.LANGCHAIN_TRACING = 'false';
  delete process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
  if (captureMode === 'env') {
    process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'true';
  }

  const { LangChainInstrumentation } = require(
    path.join(packageRoot, 'build', 'src')
  );
  const exporter = new OTLPTraceExporter();
  const provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  const contextManager = new AsyncLocalStorageContextManager().enable();
  context.setGlobalContextManager(contextManager);
  trace.setGlobalTracerProvider(provider);

  const instrumentation = new LangChainInstrumentation(
    captureMode === 'config' ? { captureMessageContent: true } : {}
  );
  if (captureMode === 'off') {
    instrumentation.setConfig({ captureMessageContent: false });
  }
  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [instrumentation],
  });

  return { provider, contextManager };
}

function loadLangChain() {
  const {
    BaseChatModel,
  } = require('@langchain/core/language_models/chat_models');
  const { AIMessage } = require('@langchain/core/messages');
  const {
    RunnableLambda,
    RunnableMap,
    RunnableSequence,
  } = require('@langchain/core/runnables');
  const {
    DynamicStructuredTool,
    DynamicTool,
  } = require('@langchain/core/tools');
  const { createAgent } = require('langchain');

  class DeterministicChatModel extends BaseChatModel {
    constructor() {
      super({});
      this.model = 'deterministic-langchain-test-model';
    }

    _llmType() {
      return 'deterministic-langchain-test';
    }

    bindTools() {
      return this;
    }

    async _generate() {
      return {
        generations: [
          {
            text: 'generated answer',
            message: new AIMessage({
              content: 'generated answer',
              usage_metadata: {
                input_tokens: 7,
                output_tokens: 3,
                total_tokens: 10,
              },
              response_metadata: { finish_reason: 'stop' },
            }),
          },
        ],
        llmOutput: {},
      };
    }
  }

  return {
    AIMessage,
    createAgent,
    DeterministicChatModel,
    DynamicStructuredTool,
    DynamicTool,
    RunnableLambda,
    RunnableMap,
    RunnableSequence,
  };
}

function greetingWorkflow(RunnableLambda, RunnableSequence) {
  return RunnableSequence.from([
    RunnableLambda.from(input => String(input).toUpperCase()),
    RunnableLambda.from(input => `${input}!`),
  ]).withConfig({ runName: 'greeting' });
}

async function runWorkflowContentOff(langchain) {
  const result = await greetingWorkflow(
    langchain.RunnableLambda,
    langchain.RunnableSequence
  ).invoke('private input');
  assert.strictEqual(result, 'PRIVATE INPUT!');
}

async function runWorkflowContentOn(langchain) {
  const result = await greetingWorkflow(
    langchain.RunnableLambda,
    langchain.RunnableSequence
  ).invoke('hello', { configurable: { thread_id: 'thread-workflow' } });
  assert.strictEqual(result, 'HELLO!');
}

async function runWorkflowStream(langchain) {
  const stream = await greetingWorkflow(
    langchain.RunnableLambda,
    langchain.RunnableSequence
  ).stream('hello');
  assert(stream instanceof ReadableStream);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  assert.strictEqual(chunks.join(''), 'HELLO!');
}

async function runRunnableMap(langchain) {
  const map = langchain.RunnableMap.from({
    first: langchain.RunnableLambda.from(input => `${input}-first`),
    second: langchain.RunnableLambda.from(input => `${input}-second`),
  });
  assert.deepStrictEqual(await map.invoke('value'), {
    first: 'value-first',
    second: 'value-second',
  });
}

async function runToolContentOff(langchain) {
  const tool = new langchain.DynamicTool({
    name: 'echo',
    description: 'Private description not recorded by default.',
    func: async input => input,
  });
  assert.strictEqual(await tool.call('private input'), 'private input');
}

async function runToolContentOn(langchain) {
  const tool = new langchain.DynamicStructuredTool({
    name: 'echo',
    description: 'Echo deterministic test input.',
    schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    func: async input => input.text,
  });
  const result = await tool.invoke({
    type: 'tool_call',
    name: 'echo',
    id: 'tool-call-1',
    args: { text: 'hello' },
  });
  assert.strictEqual(result.content, 'hello');
  assert.strictEqual(result.tool_call_id, 'tool-call-1');
}

async function runToolError(langchain) {
  const expected = new TypeError('private tool failure');
  const tool = new langchain.DynamicTool({
    name: 'broken',
    description: 'Throws a deterministic error.',
    func: async () => {
      throw expected;
    },
  });
  try {
    await tool.invoke('private input');
  } catch (actual) {
    assert.strictEqual(actual, expected);
    return;
  }
  assert.fail('Expected tool.invoke to rethrow the original error');
}

function agent(langchain) {
  return langchain.createAgent({
    name: 'test-agent',
    model: new langchain.DeterministicChatModel(),
    tools: [],
  });
}

async function runInvokeAgent(langchain) {
  const result = await agent(langchain).invoke({
    messages: [['user', 'hello']],
  });
  assert.strictEqual(result.messages.at(-1).content, 'generated answer');
}

async function runInvokeAgentStream(langchain) {
  const stream = await agent(langchain).stream({
    messages: [['user', 'hello']],
  });
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(
    chunks[0].model_request.messages[0].content,
    'generated answer'
  );
}

const scenarios = {
  workflow_content_off: ['off', runWorkflowContentOff],
  workflow_content_on: ['env', runWorkflowContentOn],
  workflow_stream: ['config', runWorkflowStream],
  runnable_map: ['off', runRunnableMap],
  tool_content_off: ['off', runToolContentOff],
  tool_content_on: ['config', runToolContentOn],
  tool_error: ['off', runToolError],
  invoke_agent: ['off', runInvokeAgent],
  invoke_agent_stream: ['off', runInvokeAgentStream],
  invoke_agent_content_on: ['config', runInvokeAgent],
  invoke_agent_stream_content_on: ['env', runInvokeAgentStream],
};

async function main() {
  const name = process.argv[2];
  const scenario = scenarios[name];
  if (!scenario) {
    throw new Error(
      `Unknown scenario '${name}'. Expected one of ${Object.keys(scenarios).join(', ')}`
    );
  }

  const [captureMode, run] = scenario;
  const telemetry = configureTelemetry(captureMode);
  const langchain = loadLangChain();
  try {
    await run(langchain);
    await telemetry.provider.forceFlush();
  } finally {
    await telemetry.provider.shutdown();
    telemetry.contextManager.disable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
