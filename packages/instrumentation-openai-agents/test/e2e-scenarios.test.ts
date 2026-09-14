/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * End-to-end scenarios driving the real @openai/agents Runner with a scripted
 * model, so tool dispatch, handoffs, and streaming all run for real while the
 * model turns stay deterministic and offline.
 *
 * See test/SCENARIOS.md for the scenario catalogue and the behaviors these
 * tests encode.
 */

import * as assert from 'assert';
// @openai/agents 0.14 loads this optional MCP module from its Node.js shim.
// Keep this explicit import and dev dependency so Node.js 18 CI can resolve it.
import '@modelcontextprotocol/sdk/shared/protocol.js';
import { z } from 'zod';
import {
  exporter,
  loadAgents,
  spanTree,
  unrelatedTracer,
} from './agents-harness';

type Agents = typeof import('@openai/agents');
type AgentOutputItem = import('@openai/agents').AgentOutputItem;
type Model = import('@openai/agents').Model;

describe('OpenAI Agents end-to-end scenarios', function () {
  this.timeout(20000);

  let agents: Agents;

  before(() => {
    agents = loadAgents();
  });

  beforeEach(() => {
    exporter.reset();
  });

  /**
   * Replays one scripted list of output items per model turn. `failOnTurn` is a
   * zero-based turn index that throws instead of answering, which is how every
   * model failure in these scenarios is triggered.
   */
  function scriptedModel(
    turns: AgentOutputItem[][],
    failOnTurn?: number
  ): Model {
    let turn = 0;
    const nextTurn = () => {
      const index = turn++;
      if (index === failOnTurn) {
        throw new Error('model failed');
      }
      return turns[index] ?? [];
    };
    return {
      getResponse: async () => ({
        usage: new agents.Usage(),
        output: nextTurn(),
      }),
      getStreamedResponse: async function* () {
        for (const item of nextTurn()) {
          yield {
            type: 'response_done',
            response: {
              id: 'scripted-response',
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
              output: [item],
            },
          } as never;
        }
      },
    };
  }

  const toolCall = (
    name: string,
    callId: string,
    args = '{}'
  ): AgentOutputItem => ({
    type: 'function_call',
    id: callId,
    callId,
    name,
    status: 'completed',
    arguments: args,
  });

  const message = (text: string): AgentOutputItem => ({
    type: 'message',
    id: 'scripted-message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text }],
  });

  const lookupOrder = () =>
    agents.tool({
      name: 'lookup_order',
      description: 'Look up an order.',
      parameters: z.object({ orderId: z.string() }),
      execute: ({ orderId }) => ({ orderId, status: 'shipped' }),
    });

  const checkInventory = () =>
    agents.tool({
      name: 'check_inventory',
      description: 'Check stock for a SKU.',
      parameters: z.object({ sku: z.string() }),
      execute: ({ sku }) => ({ sku, inStock: 3 }),
    });

  /** Consumes a streamed run the way the SDK expects, so the trace is ended. */
  async function drain(result: {
    completed: Promise<unknown>;
    [Symbol.asyncIterator](): AsyncIterator<unknown>;
  }): Promise<void> {
    for await (const _event of result) {
      void _event;
    }
    await result.completed;
  }

  const tree = () => spanTree(exporter.getFinishedSpans());

  describe('H - hierarchy', () => {
    it('H1: maps a single agent run to one invoke_agent span', async () => {
      const agent = new agents.Agent({
        name: 'solo',
        model: scriptedModel([[message('done')]]),
      });

      await agents.run(agent, 'go');

      assert.deepStrictEqual(tree(), [
        'openai.agents.run',
        '  invoke_agent solo',
      ]);
    });

    it('H2: nests a tool call under the agent that invoked it', async () => {
      const agent = new agents.Agent({
        name: 'helper',
        model: scriptedModel([
          [toolCall('lookup_order', 'c1', '{"orderId":"A-1"}')],
          [message('done')],
        ]),
        tools: [lookupOrder()],
      });

      await agents.run(agent, 'go');

      assert.deepStrictEqual(tree(), [
        'openai.agents.run',
        '  invoke_agent helper',
        '    execute_tool lookup_order',
      ]);
    });

    it('H3: keeps one agent span across multiple model turns', async () => {
      const agent = new agents.Agent({
        name: 'researcher',
        // Three model turns, each a separate LLM call, but still one agent.
        model: scriptedModel([
          [toolCall('lookup_order', 'c1', '{"orderId":"A-1"}')],
          [toolCall('check_inventory', 'c2', '{"sku":"S-9"}')],
          [message('done')],
        ]),
        tools: [lookupOrder(), checkInventory()],
      });

      await agents.run(agent, 'go');

      assert.deepStrictEqual(tree(), [
        'openai.agents.run',
        '  invoke_agent researcher',
        '    execute_tool lookup_order',
        '    execute_tool check_inventory',
      ]);
    });

    it('H4: nests an agent-as-tool invocation under its calling tool', async () => {
      const inner = new agents.Agent({
        name: 'inner',
        model: scriptedModel([[message('inner done')]]),
      });
      const outer = new agents.Agent({
        name: 'outer',
        model: scriptedModel([
          [toolCall('ask_inner', 'c1', '{"input":"hi"}')],
          [message('outer done')],
        ]),
        tools: [
          inner.asTool({
            toolName: 'ask_inner',
            toolDescription: 'Delegate to the inner agent.',
          }),
        ],
      });

      await agents.run(outer, 'go');

      assert.deepStrictEqual(tree(), [
        'openai.agents.run',
        '  invoke_agent outer',
        '    execute_tool ask_inner',
        '      invoke_agent inner',
      ]);
    });
  });

  describe('HO - handoffs', () => {
    it('HO2: keeps every agent in a multi-hop handoff chain under the run', async () => {
      const third = new agents.Agent({
        name: 'third',
        model: scriptedModel([[message('done')]]),
      });
      const toThird = agents.handoff(third);
      const second = new agents.Agent({
        name: 'second',
        model: scriptedModel([[toolCall(toThird.toolName, 'h2')]]),
        handoffs: [toThird],
      });
      const toSecond = agents.handoff(second);
      const first = new agents.Agent({
        name: 'first',
        model: scriptedModel([[toolCall(toSecond.toolName, 'h1')]]),
        handoffs: [toSecond],
      });

      await agents.run(first, 'go');

      // A handoff does not nest: every agent sits directly under the run.
      assert.deepStrictEqual(tree(), [
        'openai.agents.run',
        '  invoke_agent first',
        '  invoke_agent second',
        '  invoke_agent third',
      ]);
    });

    it('HO3: does not report a handoff call as a tool execution', async () => {
      const receiver = new agents.Agent({
        name: 'receiver',
        model: scriptedModel([[message('done')]]),
      });
      const toReceiver = agents.handoff(receiver);
      const sender = new agents.Agent({
        name: 'sender',
        model: scriptedModel([[toolCall(toReceiver.toolName, 'h1')]]),
        handoffs: [toReceiver],
      });

      await agents.run(sender, 'go');

      // The model really did call transfer_to_receiver, but the SDK models it
      // as a handoff span, which this instrumentation deliberately leaves
      // unmapped rather than reporting as a tool execution.
      assert.match(toReceiver.toolName, /^transfer_to_/);
      const toolSpans = exporter
        .getFinishedSpans()
        .filter(span => span.name.startsWith('execute_tool'));
      assert.deepStrictEqual(toolSpans, []);
    });

    it('HO4: records a post-handoff failure on the receiving agent only', async () => {
      const receiver = new agents.Agent({
        name: 'receiver',
        model: scriptedModel([[message('never reached')]], 0),
      });
      const toReceiver = agents.handoff(receiver);
      const sender = new agents.Agent({
        name: 'sender',
        model: scriptedModel([[toolCall(toReceiver.toolName, 'h1')]]),
        handoffs: [toReceiver],
      });

      await assert.rejects(agents.run(sender, 'go'));

      // The sender finished its work before handing off, so the error belongs
      // to the agent that was active when it happened.
      assert.deepStrictEqual(tree(), [
        'openai.agents.run [ERROR Error]',
        '  invoke_agent sender',
        '  invoke_agent receiver [ERROR Error]',
      ]);
    });

    it('HO5: records a handoff hook failure on the sending agent', async () => {
      const receiver = new agents.Agent({
        name: 'receiver',
        model: scriptedModel([[message('never reached')]]),
      });
      const toReceiver = agents.handoff(receiver, {
        onHandoff: () => {
          throw new Error('handoff hook failed');
        },
      });
      const sender = new agents.Agent({
        name: 'sender',
        model: scriptedModel([[toolCall(toReceiver.toolName, 'h1')]]),
        handoffs: [toReceiver],
      });

      await assert.rejects(agents.run(sender, 'go'));

      // The receiver never started, so it must not leave an orphan span.
      assert.deepStrictEqual(tree(), [
        'openai.agents.run [ERROR Error]',
        '  invoke_agent sender [ERROR Error]',
      ]);
    });

    it('HO6: keeps a handoff inside an agent-as-tool under its calling tool', async () => {
      const third = new agents.Agent({
        name: 'third',
        model: scriptedModel([[message('done')]]),
      });
      const toThird = agents.handoff(third);
      const second = new agents.Agent({
        name: 'second',
        model: scriptedModel([[toolCall(toThird.toolName, 'h1')]]),
        handoffs: [toThird],
      });
      const outer = new agents.Agent({
        name: 'outer',
        model: scriptedModel([
          [toolCall('ask_second', 'c1', '{"input":"hi"}')],
          [message('outer done')],
        ]),
        tools: [
          second.asTool({
            toolName: 'ask_second',
            toolDescription: 'Delegate to the second agent.',
          }),
        ],
      });

      await agents.run(outer, 'go');

      // Both nesting mechanisms at once: the sub-run's handoff chain stays
      // inside the tool span that started it.
      assert.deepStrictEqual(tree(), [
        'openai.agents.run',
        '  invoke_agent outer',
        '    execute_tool ask_second',
        '      invoke_agent second',
        '      invoke_agent third',
      ]);
    });
  });

  describe('E - error propagation', () => {
    it('E1: propagates a model failure to the agent and run spans', async () => {
      const agent = new agents.Agent({
        name: 'solo',
        model: scriptedModel([[message('never reached')]], 0),
      });

      await assert.rejects(agents.run(agent, 'go'));

      assert.deepStrictEqual(tree(), [
        'openai.agents.run [ERROR Error]',
        '  invoke_agent solo [ERROR Error]',
      ]);
    });

    it('E2: stops a recovered tool failure at the tool span', async () => {
      const agent = new agents.Agent({
        name: 'helper',
        model: scriptedModel([
          [toolCall('boom', 'c1')],
          [message('recovered')],
        ]),
        tools: [
          agents.tool({
            name: 'boom',
            description: 'Always fails.',
            parameters: z.object({}),
            execute: () => {
              throw new Error('tool failed');
            },
          }),
        ],
      });

      // The SDK feeds the failure back to the model, which recovers, so the
      // error must not climb past the tool span.
      await agents.run(agent, 'go');

      assert.deepStrictEqual(tree(), [
        'openai.agents.run',
        '  invoke_agent helper',
        '    execute_tool boom [ERROR Error]',
      ]);
    });

    it('E3: propagates a nested agent failure to its calling tool', async () => {
      const inner = new agents.Agent({
        name: 'inner',
        model: scriptedModel([[message('never reached')]], 0),
      });
      const outer = new agents.Agent({
        name: 'outer',
        model: scriptedModel([
          [toolCall('ask_inner', 'c1', '{"input":"hi"}')],
          [message('outer recovered')],
        ]),
        tools: [
          inner.asTool({
            toolName: 'ask_inner',
            toolDescription: 'Delegate to the inner agent.',
          }),
        ],
      });

      await agents.run(outer, 'go');

      // The failure surfaces on the inner agent and the tool that called it,
      // but the outer agent recovers and the run succeeds.
      assert.deepStrictEqual(tree(), [
        'openai.agents.run',
        '  invoke_agent outer',
        '    execute_tool ask_inner [ERROR Error]',
        '      invoke_agent inner [ERROR Error]',
      ]);
    });

    it('E4: ends every span when a nested agent failure aborts the run', async () => {
      const inner = new agents.Agent({
        name: 'inner',
        model: scriptedModel([[message('never reached')]], 0),
      });
      const outer = new agents.Agent({
        name: 'outer',
        // The outer agent does not recover: its next turn fails too.
        model: scriptedModel(
          [[toolCall('ask_inner', 'c1', '{"input":"hi"}')]],
          1
        ),
        tools: [
          inner.asTool({
            toolName: 'ask_inner',
            toolDescription: 'Delegate to the inner agent.',
          }),
        ],
      });

      await assert.rejects(agents.run(outer, 'go'));

      assert.deepStrictEqual(tree(), [
        'openai.agents.run [ERROR Error]',
        '  invoke_agent outer [ERROR Error]',
        '    execute_tool ask_inner [ERROR Error]',
        '      invoke_agent inner [ERROR Error]',
      ]);
    });
  });

  describe('C - context propagation', () => {
    it('C1: does not nest spans from other instrumentations under agent spans', async () => {
      const agent = new agents.Agent({
        name: 'helper',
        model: scriptedModel([
          [toolCall('record_note', 'c1', '{"note":"hi"}')],
          [message('done')],
        ]),
        tools: [
          agents.tool({
            name: 'record_note',
            description: 'Records a note.',
            parameters: z.object({ note: z.string() }),
            execute: ({ note }) => {
              // Stands in for any other instrumentation starting a span during
              // the run, such as the openai client instrumentation.
              unrelatedTracer.startSpan('unrelated.work').end();
              return { note };
            },
          }),
        ],
      });

      await agents.run(agent, 'go');

      // This pins a known limitation rather than desired behavior. The
      // instrumentation builds its hierarchy from SDK tracing callbacks and
      // never makes the resulting context active, so a span started by any
      // other instrumentation during the run begins a separate trace instead
      // of nesting under invoke_agent. See the README's "What is not
      // instrumented" section. If context propagation is ever implemented,
      // this test should fail and be replaced by one asserting the nesting.
      const spans = exporter.getFinishedSpans();
      const runSpan = spans.find(span => span.name === 'openai.agents.run');
      const unrelated = spans.find(span => span.name === 'unrelated.work');
      assert.ok(runSpan);
      assert.ok(unrelated);

      // The two trees are compared separately: they are independent roots, so
      // any ordering between them would just be a timestamp tie-break.
      assert.deepStrictEqual(
        spanTree(spans.filter(span => span !== unrelated)),
        [
          'openai.agents.run',
          '  invoke_agent helper',
          '    execute_tool record_note',
        ]
      );
      assert.deepStrictEqual(spanTree([unrelated]), ['unrelated.work']);
      assert.notStrictEqual(
        unrelated.spanContext().traceId,
        runSpan.spanContext().traceId,
        'the unrelated span should be in its own trace today'
      );
      assert.strictEqual(unrelated.parentSpanContext, undefined);
    });
  });

  describe('S - streaming', () => {
    it('S1: preserves the hierarchy for a streamed run', async () => {
      const agent = new agents.Agent({
        name: 'helper',
        model: scriptedModel([
          [toolCall('lookup_order', 'c1', '{"orderId":"A-1"}')],
          [message('done')],
        ]),
        tools: [lookupOrder()],
      });

      await drain(await agents.run(agent, 'go', { stream: true }));

      assert.deepStrictEqual(tree(), [
        'openai.agents.run',
        '  invoke_agent helper',
        '    execute_tool lookup_order',
      ]);
    });

    it('S2: propagates a streamed model failure to the agent and run spans', async () => {
      const agent = new agents.Agent({
        name: 'solo',
        model: scriptedModel([[message('never reached')]], 0),
      });

      await assert.rejects(
        drain(await agents.run(agent, 'go', { stream: true }))
      );

      assert.deepStrictEqual(tree(), [
        'openai.agents.run [ERROR Error]',
        '  invoke_agent solo [ERROR Error]',
      ]);
    });

    it('S3: propagates a streamed failure inside a caller-managed trace', async () => {
      const agent = new agents.Agent({
        name: 'solo',
        model: scriptedModel([[message('never reached')]], 0),
      });

      await assert.rejects(
        agents.withTrace('streamed-workflow', async () => {
          await drain(await agents.run(agent, 'go', { stream: true }));
        })
      );

      assert.deepStrictEqual(tree(), [
        'openai.agents.run [ERROR Error]',
        '  invoke_agent solo [ERROR Error]',
      ]);
    });

    it('S4: records a streamed failure when task spans are disabled', async () => {
      const agent = new agents.Agent({
        name: 'solo',
        model: scriptedModel([[message('never reached')]], 0),
      });
      const runner = new agents.Runner({
        tracing: { includeTaskAndTurnSpans: false },
      });

      await assert.rejects(
        drain(await runner.run(agent, 'go', { stream: true }))
      );

      // Without task spans there is no intermediate span to carry the error,
      // so the run span itself must record it.
      assert.deepStrictEqual(tree(), [
        'openai.agents.run [ERROR Error]',
        '  invoke_agent solo [ERROR Error]',
      ]);
    });

    it('S5: propagates a streamed nested agent failure to its calling tool', async () => {
      const inner = new agents.Agent({
        name: 'inner',
        model: scriptedModel([[message('never reached')]], 0),
      });
      const outer = new agents.Agent({
        name: 'outer',
        model: scriptedModel([
          [toolCall('ask_inner', 'c1', '{"input":"hi"}')],
          [message('outer recovered')],
        ]),
        tools: [
          inner.asTool({
            toolName: 'ask_inner',
            toolDescription: 'Delegate to the inner agent.',
          }),
        ],
      });

      await drain(await agents.run(outer, 'go', { stream: true }));

      assert.deepStrictEqual(tree(), [
        'openai.agents.run',
        '  invoke_agent outer',
        '    execute_tool ask_inner [ERROR Error]',
        '      invoke_agent inner [ERROR Error]',
      ]);
    });
  });
});
