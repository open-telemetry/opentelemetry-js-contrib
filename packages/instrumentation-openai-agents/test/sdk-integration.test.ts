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
import { SpanStatusCode } from '@opentelemetry/api';
// @openai/agents 0.14 loads this optional MCP module from its Node.js shim.
// Keep this explicit import and dev dependency so Node.js 18 CI can resolve it.
import '@modelcontextprotocol/sdk/shared/protocol.js';
import { type Definition, back as nockBack } from 'nock';
import * as path from 'node:path';
import { z } from 'zod';
import { exporter, loadAgents } from './agents-harness';
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
  let agents: typeof import('@openai/agents');

  before(() => {
    agents = loadAgents();
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

  it('ends an internally-created trace when task spans are disabled', async () => {
    const failure = new Error('model failed');
    const model: import('@openai/agents').Model = {
      getResponse: async () => {
        throw failure;
      },
      getStreamedResponse: () => {
        throw failure;
      },
    };
    const agent = new agents.Agent({ name: 'failing-agent', model });
    const runner = new agents.Runner({
      tracing: { includeTaskAndTurnSpans: false },
    });

    await assert.rejects(runner.run(agent, 'fail'), failure);

    const runSpan = exporter
      .getFinishedSpans()
      .find(span => span.name === 'openai.agents.run');
    assert.ok(runSpan);
    assert.strictEqual(runSpan.status.code, SpanStatusCode.ERROR);
  });

  it('leaves a caller-managed trace open when a nested run fails', async () => {
    const failure = new Error('model failed');
    const model: import('@openai/agents').Model = {
      getResponse: async () => {
        throw failure;
      },
      getStreamedResponse: () => {
        throw failure;
      },
    };
    const agent = new agents.Agent({ name: 'failing-agent', model });
    const runner = new agents.Runner({
      tracing: { includeTaskAndTurnSpans: false },
    });

    await agents.withTrace('shared-trace', async () => {
      await assert.rejects(runner.run(agent, 'fail'), failure);
      assert.strictEqual(
        exporter
          .getFinishedSpans()
          .filter(span => span.name === 'openai.agents.run').length,
        0
      );
    });

    assert.strictEqual(
      exporter
        .getFinishedSpans()
        .filter(span => span.name === 'openai.agents.run').length,
      1
    );
  });

  it('ends a caller-managed trace when its callback rejects', async () => {
    const failure = new Error('model failed');
    const model: import('@openai/agents').Model = {
      getResponse: async () => {
        throw failure;
      },
      getStreamedResponse: () => {
        throw failure;
      },
    };
    const agent = new agents.Agent({ name: 'failing-agent', model });
    const runner = new agents.Runner({
      tracing: { includeTaskAndTurnSpans: false },
    });

    await assert.rejects(
      agents.withTrace('failed-workflow', async () => {
        await runner.run(agent, 'fail');
      }),
      failure
    );

    const runSpan = exporter
      .getFinishedSpans()
      .find(span => span.name === 'openai.agents.run');
    assert.ok(runSpan);
    assert.strictEqual(runSpan.status.code, SpanStatusCode.ERROR);
  });

  it('ends a getOrCreateTrace scope when its callback rejects', async () => {
    const failure = new Error('workflow failed');

    await assert.rejects(
      agents.getOrCreateTrace(async () => {
        throw failure;
      }),
      failure
    );

    const runSpan = exporter
      .getFinishedSpans()
      .find(span => span.name === 'openai.agents.run');
    assert.ok(runSpan);
    assert.strictEqual(runSpan.status.code, SpanStatusCode.ERROR);
  });

  it('leaves a reused trace open when getOrCreateTrace rejects', async () => {
    const failure = new Error('nested failed');

    await agents.withTrace('outer-workflow', async () => {
      // getOrCreateTrace reuses the surrounding trace, and the caller recovers
      // from the rejection, so the outer trace must stay under its own owner.
      await assert.rejects(
        agents.getOrCreateTrace(async () => {
          throw failure;
        }),
        failure
      );
      assert.strictEqual(
        exporter
          .getFinishedSpans()
          .filter(span => span.name === 'openai.agents.run').length,
        0
      );
    });

    const runSpans = exporter
      .getFinishedSpans()
      .filter(span => span.name === 'openai.agents.run');
    assert.strictEqual(runSpans.length, 1);
    assert.strictEqual(runSpans[0].status.code, SpanStatusCode.UNSET);
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

    it('preserves the span hierarchy across agents, tools, and turns', async function () {
      // A handoff plus several tool calls means more model round trips than
      // the single-turn cassettes above.
      this.timeout(60000);

      const issueRefund = agents.tool({
        name: 'issue_refund',
        description: 'Refund an order.',
        parameters: z.object({ orderId: z.string() }),
        execute: ({ orderId }) => ({ orderId, refunded: true }),
      });
      const supportAgent = new agents.Agent({
        name: 'Support agent',
        instructions:
          'Call issue_refund with the order id you were given, then reply with exactly: Refund issued.',
        model: 'gpt-4o-mini',
        tools: [issueRefund],
      });

      const lookupOrder = agents.tool({
        name: 'lookup_order',
        description: 'Look up the status of an order.',
        parameters: z.object({ orderId: z.string() }),
        execute: ({ orderId }) => ({ orderId, status: 'shipped' }),
      });
      const checkInventory = agents.tool({
        name: 'check_inventory',
        description: 'Check remaining stock for a SKU.',
        parameters: z.object({ sku: z.string() }),
        execute: ({ sku }) => ({ sku, inStock: 3 }),
      });
      const triageAgent = new agents.Agent({
        name: 'Triage agent',
        instructions: [
          'You triage refund requests for order A-1 with SKU S-9.',
          'First call lookup_order for the order id.',
          'Then call check_inventory for the SKU.',
          'Then hand off to the Support agent to issue the refund.',
          'Never answer the customer yourself.',
        ].join(' '),
        model: 'gpt-4o-mini',
        tools: [lookupOrder, checkInventory],
        handoffs: [supportAgent],
      });

      await agents.run(triageAgent, 'Please refund order A-1.');

      const spans = exporter.getFinishedSpans();
      const runSpans = spans.filter(span => span.name === 'openai.agents.run');
      const agentSpans = spans.filter(
        span => span.attributes[ATTR_GEN_AI_OPERATION_NAME] === 'invoke_agent'
      );
      const toolSpans = spans.filter(
        span => span.attributes[ATTR_GEN_AI_OPERATION_NAME] === 'execute_tool'
      );

      // One run span at the root of a single trace.
      assert.strictEqual(runSpans.length, 1);
      const runSpan = runSpans[0];
      assert.strictEqual(runSpan.parentSpanContext, undefined);
      const traceId = runSpan.spanContext().traceId;
      for (const span of spans) {
        assert.strictEqual(span.spanContext().traceId, traceId);
        assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
      }

      // The handoff produces a second agent invocation, and both sit directly
      // under the run rather than nesting inside each other.
      const agentNames = agentSpans
        .map(span => span.attributes[ATTR_GEN_AI_AGENT_NAME])
        .sort();
      assert.deepStrictEqual(agentNames, ['Support agent', 'Triage agent']);
      for (const agentSpan of agentSpans) {
        assert.strictEqual(
          agentSpan.parentSpanContext?.spanId,
          runSpan.spanContext().spanId
        );
      }

      // Every tool span belongs to the agent that invoked it, which is the
      // part a handoff can easily get wrong.
      const agentSpanById = new Map(
        agentSpans.map(span => [span.spanContext().spanId, span])
      );
      assert.ok(toolSpans.length >= 3);
      for (const toolSpan of toolSpans) {
        const parentId = toolSpan.parentSpanContext?.spanId;
        assert.ok(parentId, 'tool span should have a parent');
        const parent = agentSpanById.get(parentId);
        assert.ok(parent, 'tool span parent should be an agent span');
        assert.strictEqual(
          toolSpan.attributes[ATTR_GEN_AI_AGENT_NAME],
          parent.attributes[ATTR_GEN_AI_AGENT_NAME]
        );
        assert.strictEqual(
          typeof toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
          'string'
        );
      }

      const toolsByAgent = new Map<string, string[]>();
      for (const toolSpan of toolSpans) {
        const agentName = String(toolSpan.attributes[ATTR_GEN_AI_AGENT_NAME]);
        const names = toolsByAgent.get(agentName) ?? [];
        names.push(String(toolSpan.attributes[ATTR_GEN_AI_TOOL_NAME]));
        toolsByAgent.set(agentName, names);
      }
      const triageTools = toolsByAgent.get('Triage agent') ?? [];
      assert.ok(triageTools.includes('lookup_order'));
      assert.ok(triageTools.includes('check_inventory'));
      assert.deepStrictEqual(toolsByAgent.get('Support agent'), [
        'issue_refund',
      ]);
      // The refund tool ran under Support, never under Triage.
      assert.ok(!triageTools.includes('issue_refund'));

      const refundSpan = toolSpans.find(
        span => span.attributes[ATTR_GEN_AI_TOOL_NAME] === 'issue_refund'
      );
      assert.ok(refundSpan);
      assert.strictEqual(
        refundSpan.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
        '{"orderId":"A-1","refunded":true}'
      );
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
