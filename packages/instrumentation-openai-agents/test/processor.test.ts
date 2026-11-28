/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { context, SpanStatusCode } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_NAME,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_RUNNER,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
} from '../src/semconv';
import {
  OPENAI_AGENTS_NESTED_RUN_CONTEXT_KEY,
  OPENAI_AGENTS_RUN_CONTEXT_KEY,
  OPENAI_AGENTS_USER_TRACE_CONTEXT_KEY,
} from '../src/processor';
import type { OpenAIAgentsTrace } from '../src/internal-types';
import {
  createProcessorTestContext,
  createSpan,
  type ProcessorTestContext,
} from './helpers';

describe('OpenAIAgentsTracingProcessor lifecycle & hierarchy', () => {
  let ctx: ProcessorTestContext;

  beforeEach(() => {
    ctx = createProcessorTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('maps a standalone agent run to invoke_runner and omits framework default name', async () => {
    const { processor, exporter } = ctx;
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'Agent workflow',
      groupId: 'conv-42',
    };
    const task = createSpan('agents-trace', 'task', 'task');
    const agent = createSpan('agents-trace', 'agent', 'agent', 'task', {
      name: 'triage',
      output_type: 'text',
    });
    const turn = createSpan('agents-trace', 'turn', 'turn', 'agent');
    const tool = createSpan('agents-trace', 'tool', 'function', 'turn', {
      name: 'lookup_order',
      input: '{"id":"123"}',
      output: '{"status":"sent"}',
    });

    await processor.onTraceStart(sdkTrace);
    await processor.onSpanStart(task);
    await processor.onSpanStart(agent);
    await processor.onSpanStart(turn);
    await processor.onSpanStart(tool);
    await processor.onSpanEnd(tool);
    await processor.onSpanEnd(turn);
    await processor.onSpanEnd(agent);
    await processor.onSpanEnd(task);
    await processor.onTraceEnd(sdkTrace);

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3);
    const runSpan = spans.find(
      span =>
        span.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
        GEN_AI_OPERATION_NAME_VALUE_INVOKE_RUNNER
    );
    const agentSpan = spans.find(span => span.name.startsWith('invoke_agent'));
    const toolSpan = spans.find(span => span.name.startsWith('execute_tool'));
    assert.ok(runSpan);
    assert.ok(agentSpan);
    assert.ok(toolSpan);

    assert.strictEqual(runSpan.name, 'invoke_runner');
    assert.strictEqual(runSpan.attributes[ATTR_GEN_AI_AGENT_NAME], undefined);
    assert.strictEqual(runSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID], 'conv-42');
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_AGENT_NAME], 'triage');
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID], 'conv-42');
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_OUTPUT_TYPE], undefined);
    assert.strictEqual(
      toolSpan.attributes[ATTR_GEN_AI_TOOL_NAME],
      'lookup_order'
    );
    assert.strictEqual(toolSpan.attributes[ATTR_GEN_AI_AGENT_NAME], 'triage');
    assert.strictEqual(toolSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID], 'conv-42');
    assert.strictEqual(
      agentSpan.parentSpanContext?.spanId,
      runSpan.spanContext().spanId
    );
    assert.strictEqual(
      toolSpan.parentSpanContext?.spanId,
      agentSpan.spanContext().spanId
    );
    assert.strictEqual(
      toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
      undefined
    );
    assert.strictEqual(
      toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      undefined
    );
  });

  it('sets agentName on invoke_runner when user supplies a workflowName and uses invoke_workflow for user withTrace', async () => {
    const { processor, exporter } = ctx;
    const runnerTrace: OpenAIAgentsTrace = {
      traceId: 'runner-trace',
      name: 'support-runner',
    };
    await processor.onTraceStart(runnerTrace);
    await processor.onTraceEnd(runnerTrace);

    const userTrace: OpenAIAgentsTrace = {
      traceId: 'workflow-trace',
      name: 'customer-workflow',
    };
    await context.with(
      context.active().setValue(OPENAI_AGENTS_USER_TRACE_CONTEXT_KEY, true),
      async () => {
        await processor.onTraceStart(userTrace);
        await processor.onTraceEnd(userTrace);
      }
    );

    const [runSpan, workflowSpan] = exporter.getFinishedSpans();
    assert.strictEqual(runSpan.name, 'invoke_runner support-runner');
    assert.strictEqual(
      runSpan.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_RUNNER
    );
    assert.strictEqual(
      runSpan.attributes[ATTR_GEN_AI_AGENT_NAME],
      'support-runner'
    );

    assert.strictEqual(workflowSpan.name, 'invoke_workflow customer-workflow');
    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW
    );
    assert.strictEqual(
      workflowSpan.attributes[ATTR_GEN_AI_AGENT_NAME],
      'customer-workflow'
    );
  });

  it('suppresses nested invoke_runner spans for internal nested runners', async () => {
    const { processor, exporter } = ctx;
    const outerTrace: OpenAIAgentsTrace = {
      traceId: 'outer-trace',
      name: 'Agent workflow',
    };
    const innerTrace: OpenAIAgentsTrace = {
      traceId: 'inner-trace',
      name: 'Agent workflow',
    };

    await processor.onTraceStart(outerTrace);
    await context.with(
      context.active().setValue(OPENAI_AGENTS_NESTED_RUN_CONTEXT_KEY, true),
      async () => {
        await processor.onTraceStart(innerTrace);
        await processor.onTraceEnd(innerTrace);
      }
    );
    await processor.onTraceEnd(outerTrace);

    const runnerSpans = exporter
      .getFinishedSpans()
      .filter(
        span =>
          span.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_RUNNER
      );
    assert.strictEqual(runnerSpans.length, 1);
  });

  it('keeps multiple agent invocations under invoke_runner', async () => {
    const { processor, exporter } = ctx;
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'support',
    };
    const task = createSpan('agents-trace', 'task', 'task');
    const firstAgent = createSpan(
      'agents-trace',
      'first-agent',
      'agent',
      'task',
      { name: 'triage' }
    );
    const secondAgent = createSpan(
      'agents-trace',
      'second-agent',
      'agent',
      'task',
      { name: 'specialist' }
    );

    await processor.onTraceStart(sdkTrace);
    await processor.onSpanStart(task);
    await processor.onSpanStart(firstAgent);
    await processor.onSpanEnd(firstAgent);
    await processor.onSpanStart(secondAgent);
    await processor.onSpanEnd(secondAgent);
    await processor.onSpanEnd(task);
    await processor.onTraceEnd(sdkTrace);

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3);
    const runSpan = spans.find(
      span =>
        span.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
        GEN_AI_OPERATION_NAME_VALUE_INVOKE_RUNNER
    );
    const agentSpans = spans.filter(
      span => span.attributes[ATTR_GEN_AI_OPERATION_NAME] === 'invoke_agent'
    );
    assert.ok(runSpan);
    assert.strictEqual(agentSpans.length, 2);
    assert.deepStrictEqual(
      agentSpans.map(span => span.attributes[ATTR_GEN_AI_AGENT_NAME]),
      ['triage', 'specialist']
    );
    for (const agentSpan of agentSpans) {
      assert.strictEqual(
        agentSpan.parentSpanContext?.spanId,
        runSpan.spanContext().spanId
      );
    }
  });

  it('records Agents SDK span errors', async () => {
    const { processor, exporter } = ctx;
    const agent = createSpan('agents-trace', 'agent', 'agent', undefined, {
      name: 'triage',
    });
    agent.error = {
      message: 'Error in agent run',
      data: { error: 'AgentError: agent failed' },
    };

    await processor.onSpanStart(agent);
    await processor.onSpanEnd(agent);

    const [agentSpan] = exporter.getFinishedSpans();
    assert.ok(agentSpan);
    assert.deepStrictEqual(agentSpan.status, {
      code: SpanStatusCode.ERROR,
      message: 'Error in agent run',
    });
    assert.strictEqual(agentSpan.attributes['error.type'], 'AgentError');
  });

  it('records task errors on the runner span and lets task errors take precedence', async () => {
    const { processor, exporter } = ctx;
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'support',
    };
    const task = createSpan('agents-trace', 'task', 'task');
    const child = createSpan('agents-trace', 'child', 'turn', 'task');
    child.error = {
      message: 'Error in agent run',
      data: { error: 'ChildError: child failed' },
    };
    task.error = {
      message: 'Error in agent run',
      data: { error: 'RunError: run failed' },
    };

    await processor.onTraceStart(sdkTrace);
    await processor.onSpanStart(task);
    await processor.onSpanStart(child);
    await processor.onSpanEnd(child);
    await processor.onSpanEnd(task);
    await processor.onTraceEnd(sdkTrace);

    const [runSpan] = exporter.getFinishedSpans();
    assert.strictEqual(runSpan.name, 'invoke_runner support');
    assert.deepStrictEqual(runSpan.status, {
      code: SpanStatusCode.ERROR,
      message: 'Error in agent run',
    });
    assert.strictEqual(runSpan.attributes['error.type'], 'RunError');
  });

  it('propagates turn errors to the enclosing agent span and lets agent errors take precedence', async () => {
    const { processor, exporter } = ctx;
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'support',
    };
    const agentWithOwn = createSpan('agents-trace', 'a1', 'agent', undefined, {
      name: 'triage',
    });
    const turn1 = createSpan('agents-trace', 't1', 'turn', 'a1');
    turn1.error = {
      message: 'Error in turn',
      data: { error: 'TurnError: turn failed' },
    };
    agentWithOwn.error = {
      message: 'Error in agent run',
      data: { error: 'AgentError: agent failed' },
    };

    const agentFromTurn = createSpan('agents-trace', 'a2', 'agent', undefined, {
      name: 'fallback',
    });
    const turn2 = createSpan('agents-trace', 't2', 'turn', 'a2');
    turn2.error = {
      message: 'Error in turn',
      data: { error: 'TurnError: turn failed' },
    };

    await processor.onTraceStart(sdkTrace);
    await processor.onSpanStart(agentWithOwn);
    await processor.onSpanStart(turn1);
    await processor.onSpanEnd(turn1);
    await processor.onSpanEnd(agentWithOwn);
    await processor.onSpanStart(agentFromTurn);
    await processor.onSpanStart(turn2);
    await processor.onSpanEnd(turn2);
    await processor.onSpanEnd(agentFromTurn);
    await processor.onTraceEnd(sdkTrace);

    const spans = exporter.getFinishedSpans();
    const ownSpan = spans.find(span => span.name === 'invoke_agent triage');
    const turnSpan = spans.find(span => span.name === 'invoke_agent fallback');
    assert.ok(ownSpan);
    assert.ok(turnSpan);
    assert.strictEqual(ownSpan.attributes['error.type'], 'AgentError');
    assert.strictEqual(turnSpan.attributes['error.type'], 'TurnError');
    assert.deepStrictEqual(turnSpan.status, {
      code: SpanStatusCode.ERROR,
      message: 'Error in turn',
    });
  });

  it('does not propagate a recovered model attempt error', async () => {
    const { processor, exporter } = ctx;
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'support',
    };
    const agent = createSpan('agents-trace', 'agent', 'agent', undefined, {
      name: 'triage',
    });
    const failedAttempt = createSpan(
      'agents-trace',
      'generation',
      'generation',
      'agent'
    );
    failedAttempt.error = {
      message: 'Model request failed',
      data: { error: 'APIConnectionError: temporary failure' },
    };

    await processor.onTraceStart(sdkTrace);
    await processor.onSpanStart(agent);
    await processor.onSpanStart(failedAttempt);
    await processor.onSpanEnd(failedAttempt);
    await processor.onSpanEnd(agent);
    await processor.onTraceEnd(sdkTrace);

    const agentSpan = exporter
      .getFinishedSpans()
      .find(span => span.name === 'invoke_agent triage');
    assert.ok(agentSpan);
    assert.deepStrictEqual(agentSpan.status, { code: SpanStatusCode.UNSET });
    assert.strictEqual(agentSpan.attributes['error.type'], undefined);
  });

  it('ends an owned run on rejection without task callbacks', async () => {
    const { processor, exporter } = ctx;
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'support',
    };
    const runToken = {};
    const failure = new Error('run failed');
    failure.name = 'RunError';

    await context.with(
      context.active().setValue(OPENAI_AGENTS_RUN_CONTEXT_KEY, runToken),
      () => processor.onTraceStart(sdkTrace)
    );
    processor.onRunError(runToken, failure);

    const [runSpan] = exporter.getFinishedSpans();
    assert.strictEqual(runSpan.name, 'invoke_runner support');
    assert.strictEqual(runSpan.attributes['error.type'], 'RunError');

    await processor.onTraceEnd(sdkTrace);
    assert.strictEqual(exporter.getFinishedSpans().length, 1);
  });

  it('keeps the owning run mapping when nested traces end in or out of order', async () => {
    const { processor, exporter } = ctx;
    const token = {};
    const outer: OpenAIAgentsTrace = { traceId: 'outer-trace' };
    const nestedA: OpenAIAgentsTrace = { traceId: 'nested-a' };
    const nestedB: OpenAIAgentsTrace = { traceId: 'nested-b' };
    const runContext = context
      .active()
      .setValue(OPENAI_AGENTS_RUN_CONTEXT_KEY, token);

    await context.with(runContext, async () => {
      await processor.onTraceStart(outer);
      await processor.onTraceStart(nestedA);
      await processor.onTraceStart(nestedB);
      await processor.onTraceEnd(nestedA);
      await processor.onTraceEnd(nestedB);
      processor.onRunError(token, new Error('tool failed'));
    });

    const failed = exporter
      .getFinishedSpans()
      .filter(span => span.status.code === SpanStatusCode.ERROR);
    assert.strictEqual(failed.length, 1);
    assert.strictEqual(exporter.getFinishedSpans().length, 3);
  });

  it('defers stream trace end until stream settles for owned, caller-managed, and ok streams', async () => {
    const { processor, exporter } = ctx;
    const tokenFail = {};
    const failTrace: OpenAIAgentsTrace = { traceId: 'streamed-trace' };
    await context.with(
      context.active().setValue(OPENAI_AGENTS_RUN_CONTEXT_KEY, tokenFail),
      () => processor.onTraceStart(failTrace)
    );
    processor.onRunStreamStart(tokenFail, failTrace.traceId);
    await processor.onTraceEnd(failTrace);
    assert.strictEqual(exporter.getFinishedSpans().length, 0);
    processor.onRunStreamSettled(tokenFail, new Error('stream failed'));

    const tokenCaller = {};
    const callerTrace: OpenAIAgentsTrace = { traceId: 'caller-trace' };
    await processor.onTraceStart(callerTrace);
    processor.onRunStreamStart(tokenCaller, callerTrace.traceId);
    await processor.onTraceEnd(callerTrace);
    processor.onRunStreamSettled(tokenCaller, new Error('stream failed'));

    const tokenOk = {};
    const okTrace: OpenAIAgentsTrace = { traceId: 'ok-trace' };
    await processor.onTraceStart(okTrace);
    processor.onRunStreamStart(tokenOk, okTrace.traceId);
    await processor.onTraceEnd(okTrace);
    processor.onRunStreamSettled(tokenOk);

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(spans[1].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(spans[2].status.code, SpanStatusCode.UNSET);
  });

  it('does not end a shared trace when one runner invocation fails', async () => {
    const { processor, exporter } = ctx;
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'support',
    };
    const firstRunToken = {};
    const task = createSpan('agents-trace', 'task', 'task');
    task.error = {
      message: 'Error in agent run',
      data: { error: 'RunError: run failed' },
    };
    const secondAgent = createSpan(
      'agents-trace',
      'second-agent',
      'agent',
      undefined,
      { name: 'second-agent' }
    );

    await processor.onTraceStart(sdkTrace);
    await context.with(
      context.active().setValue(OPENAI_AGENTS_RUN_CONTEXT_KEY, firstRunToken),
      () => processor.onSpanStart(task)
    );
    await processor.onSpanEnd(task);
    processor.onRunError(firstRunToken, new Error('run failed'));
    assert.strictEqual(exporter.getFinishedSpans().length, 0);

    await context.with(
      context.active().setValue(OPENAI_AGENTS_RUN_CONTEXT_KEY, {}),
      () => processor.onSpanStart(secondAgent)
    );
    await processor.onSpanEnd(secondAgent);
    await processor.onTraceEnd(sdkTrace);

    const spans = exporter.getFinishedSpans();
    const runSpan = spans.find(span => span.name === 'invoke_runner support');
    const agentSpan = spans.find(
      span => span.name === 'invoke_agent second-agent'
    );
    assert.ok(runSpan);
    assert.ok(agentSpan);
    assert.deepStrictEqual(runSpan.status, { code: SpanStatusCode.UNSET });
    assert.strictEqual(
      agentSpan.parentSpanContext?.spanId,
      runSpan.spanContext().spanId
    );
  });

  it('bounds error.type to safe error names and accepts built-in Error', async () => {
    const { processor, exporter } = ctx;
    const agent = createSpan('agents-trace', 'agent', 'agent', undefined, {
      name: 'triage',
    });
    agent.error = {
      message: 'Error in agent run',
      data: { error: 'customer123: request failed in region-7' },
    };
    const tool = createSpan('agents-trace', 'tool', 'function', undefined, {
      name: 'lookup_order',
    });
    tool.error = {
      message: 'Error running tool',
      data: { error: 'Error: tool failed' },
    };

    await processor.onSpanStart(agent);
    await processor.onSpanEnd(agent);
    await processor.onSpanStart(tool);
    await processor.onSpanEnd(tool);

    const [agentSpan, toolSpan] = exporter.getFinishedSpans();
    assert.strictEqual(agentSpan.attributes['error.type'], '_OTHER');
    assert.strictEqual(toolSpan.attributes['error.type'], 'Error');
  });

  it('allows active spans to finish after instrumentation is disabled', async () => {
    const { processor, exporter } = ctx;
    const agent = createSpan('agents-trace', 'agent', 'agent', undefined, {
      name: 'triage',
    });
    const ignoredTool = createSpan(
      'agents-trace',
      'tool',
      'function',
      'agent',
      { name: 'lookup_order' }
    );

    await processor.onSpanStart(agent);
    processor.setEnabled(false);
    await processor.onSpanStart(ignoredTool);
    agent.error = {
      message: 'Error in agent run',
      data: { error: 'AgentError: agent failed' },
    };
    await processor.onSpanEnd(agent);

    const spans = exporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].name, 'invoke_agent triage');
    assert.strictEqual(spans[0].attributes['error.type'], 'AgentError');
    assert.strictEqual(spans[0].duration[0], 1);
  });
});
