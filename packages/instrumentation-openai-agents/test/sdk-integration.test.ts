/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Runner tests use nock-back cassettes from test/mock-responses. To
 * re-record them against OpenAI, set NOCK_BACK_MODE=update and provide a valid
 * OPENAI_API_KEY. Use NOCK_BACK_MODE=record to add a new cassette without
 * replacing existing recordings.
 */

import * as assert from 'assert';
// @openai/agents 0.14 loads this optional MCP module from its Node.js shim.
// Keep this explicit import and dev dependency so Node.js 18 CI can resolve it.
import '@modelcontextprotocol/sdk/shared/protocol.js';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { type Definition, back as nockBack } from 'nock';
import * as path from 'node:path';
import { z } from 'zod';
import { OpenAIAgentsInstrumentation } from '../src';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_NAME,
} from '../src/semconv';

function sanitizeRecordings(scopes: Definition[]): Definition[] {
  for (const scope of scopes) {
    const headers: Record<string, string> = (
      scope as Definition & { rawHeaders: Record<string, string> }
    ).rawHeaders;
    delete headers['set-cookie'];
    delete headers['openai-organization'];
    delete headers['openai-project'];
  }
  return scopes;
}

describe('OpenAI Agents SDK integration', () => {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  const instrumentation = new OpenAIAgentsInstrumentation({
    disableOpenAITraceExport: true,
    captureMessageContent: true,
  });
  instrumentation.setTracerProvider(provider);
  const originalApiKey = process.env.OPENAI_API_KEY;
  let agents: typeof import('@openai/agents');

  before(() => {
    if (nockBack.currentMode === 'dryrun') {
      process.env.OPENAI_API_KEY = 'testing';
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    agents = require('@openai/agents');
  });

  after(() => {
    instrumentation.disable();
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  beforeEach(() => {
    exporter.reset();
  });

  it('registers through module loading and receives real SDK callbacks', async () => {
    const sdkTrace = agents
      .getGlobalTraceProvider()
      .createTrace({ name: 'real-workflow' });
    await sdkTrace.start();

    const task = agents.createTaskSpan({ data: { name: 'runner' } }, sdkTrace);
    task.start();
    const agent = agents.createAgentSpan(
      { data: { name: 'real-agent' } },
      task
    );
    agent.start();
    const turn = agents.createTurnSpan(
      { data: { turn: 1, agent_name: 'real-agent' } },
      agent
    );
    turn.start();
    const tool = agents.createFunctionSpan(
      {
        data: {
          name: 'real-tool',
          input: '{"value":1}',
          output: '{"value":2}',
        },
      },
      turn
    );
    tool.start();
    tool.end();
    turn.end();
    agent.end();
    task.end();
    await sdkTrace.end();

    const spans = exporter.getFinishedSpans();
    assert.deepStrictEqual(
      spans.map(span => span.name),
      ['execute_tool real-tool', 'invoke_agent real-agent', 'openai.agents.run']
    );
  });

  describe('recorded OpenAI responses', function () {
    this.timeout(10000);
    nockBack.fixtures = path.join(__dirname, 'mock-responses');

    let nockDone: () => void;
    beforeEach(async function () {
      const filename = `${this.currentTest
        ?.fullTitle()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}.json`;
      const recording = await nockBack(filename, {
        afterRecord: sanitizeRecordings,
      });
      nockDone = recording.nockDone;
    });

    afterEach(() => {
      nockDone();
    });

    it('instruments an agent run', async () => {
      const agent = new agents.Agent({
        name: 'Greeting agent',
        instructions: 'Reply with exactly: hello from agent',
        model: 'gpt-4o-mini',
      });

      const result = await agents.run(agent, 'Say hello.');

      assert.strictEqual(result.finalOutput, 'hello from agent');
      const spans = exporter.getFinishedSpans();
      const runSpan = spans.find(span => span.name === 'openai.agents.run');
      const agentSpan = spans.find(
        span => span.attributes[ATTR_GEN_AI_OPERATION_NAME] === 'invoke_agent'
      );
      assert.ok(runSpan);
      assert.ok(agentSpan);
      assert.strictEqual(
        runSpan.attributes[ATTR_GEN_AI_OPERATION_NAME],
        undefined
      );
      assert.strictEqual(
        agentSpan.attributes[ATTR_GEN_AI_AGENT_NAME],
        'Greeting agent'
      );
      assert.strictEqual(
        agentSpan.parentSpanContext?.spanId,
        runSpan.spanContext().spanId
      );
    });

    it('instruments function tool execution', async () => {
      const weatherTool = agents.tool({
        name: 'get_weather',
        description: 'Get the weather for a city.',
        parameters: z.object({ city: z.string() }),
        execute: ({ city }) => ({ city, weather: 'sunny' }),
      });
      const agent = new agents.Agent({
        name: 'Weather agent',
        instructions: 'Use get_weather and report its result in one sentence.',
        model: 'gpt-4o-mini',
        tools: [weatherTool],
      });

      const result = await agents.run(agent, 'What is the weather in Paris?');

      assert.strictEqual(result.finalOutput, 'The weather in Paris is sunny.');
      const spans = exporter.getFinishedSpans();
      const toolSpan = spans.find(
        span => span.attributes[ATTR_GEN_AI_OPERATION_NAME] === 'execute_tool'
      );
      const agentSpan = spans.find(
        span => span.attributes[ATTR_GEN_AI_OPERATION_NAME] === 'invoke_agent'
      );
      const runSpan = spans.find(span => span.name === 'openai.agents.run');
      assert.ok(toolSpan);
      assert.ok(agentSpan);
      assert.ok(runSpan);
      assert.strictEqual(
        toolSpan.attributes[ATTR_GEN_AI_TOOL_NAME],
        'get_weather'
      );
      assert.strictEqual(
        toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
        '{"city":"Paris"}'
      );
      assert.strictEqual(
        toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
        '{"city":"Paris","weather":"sunny"}'
      );
      assert.strictEqual(
        toolSpan.parentSpanContext?.spanId,
        agentSpan.spanContext().spanId
      );
      assert.strictEqual(
        agentSpan.parentSpanContext?.spanId,
        runSpan.spanContext().spanId
      );
    });
  });
});
