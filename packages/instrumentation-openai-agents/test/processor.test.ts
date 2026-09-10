/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { context, SpanStatusCode } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import {
  OPENAI_AGENTS_RUN_CONTEXT_KEY,
  OpenAIAgentsTracingProcessor,
} from '../src/processor';
import type {
  OpenAIAgentsSpan,
  OpenAIAgentsTrace,
} from '../src/internal-types';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_NAME,
} from '../src/semconv';

const diag = {
  debug() {},
  error() {},
  info() {},
  verbose() {},
  warn() {},
};

function createSpan(
  traceId: string,
  spanId: string,
  type: string,
  parentId?: string,
  data: Record<string, unknown> = {}
): OpenAIAgentsSpan {
  return {
    traceId,
    spanId,
    parentId,
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:01.000Z',
    spanData: { type, ...data },
  };
}

describe('OpenAIAgentsTracingProcessor', () => {
  let exporter: InMemorySpanExporter;
  let processor: OpenAIAgentsTracingProcessor;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    const provider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
    });
    processor = new OpenAIAgentsTracingProcessor(
      () => provider.getTracer('test'),
      {},
      diag
    );
  });

  afterEach(async () => {
    await processor.shutdown();
    exporter.reset();
  });

  it('does not classify a standalone agent run as a workflow', async () => {
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'support',
    };
    const task = createSpan('agents-trace', 'task', 'task');
    const agent = createSpan('agents-trace', 'agent', 'agent', 'task', {
      name: 'triage',
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
    const runSpan = spans.find(span => span.name === 'openai.agents.run');
    const agentSpan = spans.find(span => span.name.startsWith('invoke_agent'));
    const toolSpan = spans.find(span => span.name.startsWith('execute_tool'));
    assert.ok(runSpan);
    assert.ok(agentSpan);
    assert.ok(toolSpan);

    assert.strictEqual(
      runSpan.attributes[ATTR_GEN_AI_OPERATION_NAME],
      undefined
    );
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_AGENT_NAME], 'triage');
    assert.strictEqual(
      toolSpan.attributes[ATTR_GEN_AI_TOOL_NAME],
      'lookup_order'
    );
    assert.strictEqual(toolSpan.attributes[ATTR_GEN_AI_AGENT_NAME], 'triage');
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

  it('does not classify multiple agent invocations as a workflow', async () => {
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
    const runSpan = spans.find(span => span.name === 'openai.agents.run');
    const agentSpans = spans.filter(
      span => span.attributes[ATTR_GEN_AI_OPERATION_NAME] === 'invoke_agent'
    );
    assert.ok(runSpan);
    assert.strictEqual(
      runSpan.attributes[ATTR_GEN_AI_OPERATION_NAME],
      undefined
    );
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

  it('captures tool arguments and results when explicitly enabled', async () => {
    processor.setConfig({ captureMessageContent: true });
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'support',
    };
    const tool = createSpan('agents-trace', 'tool', 'function', undefined, {
      name: 'lookup_order',
      input: { id: '123' },
      output: { status: 'sent' },
    });

    await processor.onTraceStart(sdkTrace);
    await processor.onSpanStart(tool);
    await processor.onSpanEnd(tool);
    await processor.onTraceEnd(sdkTrace);

    const toolSpan = exporter
      .getFinishedSpans()
      .find(span => span.name.startsWith('execute_tool'));
    assert.ok(toolSpan);
    assert.strictEqual(
      toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
      '{"id":"123"}'
    );
    assert.strictEqual(
      toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      '{"status":"sent"}'
    );
  });

  it('does not capture fallback tool output when execution fails', async () => {
    processor.setConfig({ captureMessageContent: true });
    const tool = createSpan('agents-trace', 'tool', 'function', undefined, {
      name: 'lookup_order',
      input: { id: '123' },
      output: { status: 'unavailable' },
    });
    tool.error = {
      message: 'Error running tool (non-fatal)',
      data: {
        tool_name: 'lookup_order',
        error: 'TypeError: tool failed',
      },
    };

    await processor.onSpanStart(tool);
    await processor.onSpanEnd(tool);

    const [toolSpan] = exporter.getFinishedSpans();
    assert.ok(toolSpan);
    assert.strictEqual(
      toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
      '{"id":"123"}'
    );
    assert.strictEqual(
      toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      undefined
    );
    assert.deepStrictEqual(toolSpan.status, {
      code: SpanStatusCode.ERROR,
      message: 'Error running tool (non-fatal)',
    });
    assert.strictEqual(toolSpan.attributes['error.type'], 'TypeError');
    assert.strictEqual(
      toolSpan.events[0].attributes?.['exception.message'],
      'TypeError: tool failed'
    );
  });

  it('records Agents SDK span errors', async () => {
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

  it('records task errors on the run span', async () => {
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'support',
    };
    const task = createSpan('agents-trace', 'task', 'task');
    task.error = {
      message: 'Error in agent run',
      data: { error: 'RunError: run failed' },
    };

    await processor.onTraceStart(sdkTrace);
    await processor.onSpanStart(task);
    await processor.onSpanEnd(task);
    await processor.onTraceEnd(sdkTrace);

    const [runSpan] = exporter.getFinishedSpans();
    assert.strictEqual(runSpan.name, 'openai.agents.run');
    assert.deepStrictEqual(runSpan.status, {
      code: SpanStatusCode.ERROR,
      message: 'Error in agent run',
    });
    assert.strictEqual(runSpan.attributes['error.type'], 'RunError');
  });

  it('lets a task error take precedence over a descendant error', async () => {
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
    assert.strictEqual(runSpan.attributes['error.type'], 'RunError');
    assert.strictEqual(runSpan.events.length, 2);
  });

  it('records turn errors on the enclosing agent span', async () => {
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'support',
    };
    const agent = createSpan('agents-trace', 'agent', 'agent', undefined, {
      name: 'triage',
    });
    const turn = createSpan('agents-trace', 'turn', 'turn', 'agent');
    turn.error = {
      message: 'Error in agent run',
      data: { error: 'TurnError: turn failed' },
    };
    agent.error = {
      message: 'Error in agent run',
      data: { error: 'AgentError: agent failed' },
    };

    await processor.onTraceStart(sdkTrace);
    await processor.onSpanStart(agent);
    await processor.onSpanStart(turn);
    await processor.onSpanEnd(turn);
    await processor.onSpanEnd(agent);
    await processor.onTraceEnd(sdkTrace);

    const agentSpan = exporter
      .getFinishedSpans()
      .find(span => span.name === 'invoke_agent triage');
    assert.ok(agentSpan);
    assert.deepStrictEqual(agentSpan.status, {
      code: SpanStatusCode.ERROR,
      message: 'Error in agent run',
    });
    assert.strictEqual(agentSpan.attributes['error.type'], 'AgentError');
    assert.strictEqual(agentSpan.events.length, 2);
  });

  it('does not propagate a recovered model attempt error', async () => {
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
    assert.strictEqual(agentSpan.events.length, 0);
  });

  it('ends an owned run on rejection without task callbacks', async () => {
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
    assert.strictEqual(runSpan.name, 'openai.agents.run');
    assert.strictEqual(runSpan.attributes['error.type'], 'RunError');
    assert.strictEqual(
      (
        processor as unknown as {
          _traceRecordsById: Map<string, unknown>;
        }
      )._traceRecordsById.size,
      0
    );

    await processor.onTraceEnd(sdkTrace);
    assert.strictEqual(exporter.getFinishedSpans().length, 1);
  });

  it('does not end a shared trace when one runner invocation fails', async () => {
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
    const runSpan = spans.find(span => span.name === 'openai.agents.run');
    const agentSpan = spans.find(
      span => span.name === 'invoke_agent second-agent'
    );
    assert.ok(runSpan);
    assert.ok(agentSpan);
    assert.strictEqual(runSpan.name, 'openai.agents.run');
    assert.deepStrictEqual(runSpan.status, { code: SpanStatusCode.UNSET });
    assert.strictEqual(
      agentSpan.parentSpanContext?.spanId,
      runSpan.spanContext().spanId
    );
  });

  it('does not use arbitrary error detail as error.type', async () => {
    const agent = createSpan('agents-trace', 'agent', 'agent', undefined, {
      name: 'triage',
    });
    agent.error = {
      message: 'Error in agent run',
      data: { error: 'customer123: request failed in region-7' },
    };

    await processor.onSpanStart(agent);
    await processor.onSpanEnd(agent);

    const [agentSpan] = exporter.getFinishedSpans();
    assert.strictEqual(agentSpan.attributes['error.type'], '_OTHER');
    assert.strictEqual(
      agentSpan.events[0].attributes?.['exception.message'],
      'customer123: request failed in region-7'
    );
  });

  it('allows active spans to finish after instrumentation is disabled', async () => {
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
