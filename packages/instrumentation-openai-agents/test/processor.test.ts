/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { OpenAIAgentsTracingProcessor } from '../src/processor';
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

  it('records Agents SDK span errors', async () => {
    const agent = createSpan('agents-trace', 'agent', 'agent', undefined, {
      name: 'triage',
    });
    agent.error = {
      message: 'agent failed',
      data: { type: 'AgentError' },
    };

    await processor.onSpanStart(agent);
    await processor.onSpanEnd(agent);

    const [agentSpan] = exporter.getFinishedSpans();
    assert.ok(agentSpan);
    assert.deepStrictEqual(agentSpan.status, {
      code: SpanStatusCode.ERROR,
      message: 'agent failed',
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
      message: 'run failed',
      data: { type: 'RunError' },
    };

    await processor.onTraceStart(sdkTrace);
    await processor.onSpanStart(task);
    await processor.onSpanEnd(task);
    await processor.onTraceEnd(sdkTrace);

    const [runSpan] = exporter.getFinishedSpans();
    assert.strictEqual(runSpan.name, 'openai.agents.run');
    assert.deepStrictEqual(runSpan.status, {
      code: SpanStatusCode.ERROR,
      message: 'run failed',
    });
    assert.strictEqual(runSpan.attributes['error.type'], 'RunError');
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
      message: 'turn failed',
      data: { type: 'TurnError' },
    };
    agent.error = {
      message: 'turn failed',
      data: { type: 'TurnError' },
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
      message: 'turn failed',
    });
    assert.strictEqual(agentSpan.attributes['error.type'], 'TurnError');
    assert.strictEqual(agentSpan.events.length, 1);
  });
});
