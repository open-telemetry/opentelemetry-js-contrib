/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { context, SpanStatusCode } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_AGENT_DESCRIPTION,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_DEFINITIONS,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TRANSFER_MODE,
  ATTR_GEN_AI_TRANSFER_TARGET_NAME,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
  GEN_AI_TRANSFER_MODE_VALUE_PASS_CONTROL,
  GEN_AI_TRANSFER_MODE_VALUE_RETURN_TO_CALLER,
  METRIC_GEN_AI_EXECUTE_TOOL_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS,
  METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS,
} from '../src/semconv';
import { DataPointType } from '@opentelemetry/sdk-metrics';
import type { OpenAIAgentsTrace } from '../src/internal-types';
import { OPENAI_AGENTS_RUN_CONTEXT_KEY } from '../src/processor';
import {
  createProcessorTestContext,
  createSpan,
  type ProcessorTestContext,
} from './helpers';

describe('OpenAIAgentsTracingProcessor telemetry, transfers & content capture', () => {
  let ctx: ProcessorTestContext;

  beforeEach(() => {
    ctx = createProcessorTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('captures tool arguments and results when enabled and drops fallback output on failure', async () => {
    const { processor, exporter } = ctx;
    ctx.setCaptureMode('span_only');

    const okTool = createSpan('t1', 'tool-ok', 'function', undefined, {
      name: 'lookup_order',
      input: { id: '123' },
      output: { status: 'sent' },
    });
    const failedTool = createSpan('t1', 'tool-fail', 'function', undefined, {
      name: 'lookup_order',
      input: { id: '456' },
      output: { status: 'unavailable' },
    });
    failedTool.error = {
      message: 'Error running tool (non-fatal)',
      data: { error: 'TypeError: tool failed' },
    };

    await processor.onSpanStart(okTool);
    await processor.onSpanEnd(okTool);
    await processor.onSpanStart(failedTool);
    await processor.onSpanEnd(failedTool);

    const [okSpan, failedSpan] = exporter.getFinishedSpans();
    assert.strictEqual(
      okSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
      '{"id":"123"}'
    );
    assert.strictEqual(
      okSpan.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      '{"status":"sent"}'
    );
    assert.strictEqual(
      failedSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
      '{"id":"456"}'
    );
    assert.strictEqual(
      failedSpan.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      undefined
    );
    assert.deepStrictEqual(failedSpan.status, {
      code: SpanStatusCode.ERROR,
      message: 'Error running tool (non-fatal)',
    });
    assert.strictEqual(failedSpan.attributes['error.type'], 'TypeError');
  });

  it('records duration, inference_calls, and tool_calls metrics on invoke_agent only and resolves late handoff targets', async () => {
    const { processor, exporter, metricReader } = ctx;
    const sdkTrace: OpenAIAgentsTrace = {
      traceId: 'agents-trace',
      name: 'Agent workflow',
    };
    const agent = createSpan('agents-trace', 'agent', 'agent', undefined, {
      name: 'triage',
    });
    const response = createSpan('agents-trace', 'resp', 'response', 'agent', {
      _response: {
        model: 'gpt-4o-mini-2024-07-18',
        temperature: 0.2,
        top_p: 0.9,
        max_output_tokens: 256,
      },
    });
    const tool = createSpan('agents-trace', 'tool', 'function', 'agent', {
      name: 'lookup_order',
    });
    const handoff = createSpan('agents-trace', 'handoff', 'handoff', 'agent', {
      from_agent: 'triage',
    });

    await processor.onTraceStart(sdkTrace);
    await processor.onSpanStart(agent);
    await processor.onSpanStart(response);
    await processor.onSpanEnd(response);
    await processor.onSpanStart(tool);
    await processor.onSpanEnd(tool);
    await processor.onSpanStart(handoff);
    handoff.spanData.to_agent = 'billing';
    await processor.onSpanEnd(handoff);
    await processor.onSpanEnd(agent);
    await processor.onTraceEnd(sdkTrace);

    const agentSpan = exporter
      .getFinishedSpans()
      .find(span => span.name === 'invoke_agent triage');
    assert.ok(agentSpan);
    assert.strictEqual(
      agentSpan.attributes[ATTR_GEN_AI_RESPONSE_MODEL],
      'gpt-4o-mini-2024-07-18'
    );
    assert.strictEqual(
      agentSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      undefined
    );
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE], 0.2);
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_REQUEST_TOP_P], 0.9);
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS], 256);

    const handoffSpan = exporter
      .getFinishedSpans()
      .find(span => span.name === 'execute_tool handoff');
    assert.ok(handoffSpan);
    assert.strictEqual(
      handoffSpan.attributes[ATTR_GEN_AI_TRANSFER_MODE],
      GEN_AI_TRANSFER_MODE_VALUE_PASS_CONTROL
    );
    assert.strictEqual(
      handoffSpan.attributes[ATTR_GEN_AI_TRANSFER_TARGET_NAME],
      'billing'
    );

    const { resourceMetrics } = await metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics.flatMap(sm => sm.metrics);
    const agentDuration = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_DURATION
    );
    const toolDuration = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_EXECUTE_TOOL_DURATION
    );
    const inferenceCalls = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
    );
    const toolCalls = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
    );

    assert.ok(agentDuration);
    assert.ok(toolDuration);
    assert.ok(inferenceCalls);
    assert.ok(toolCalls);
    assert.strictEqual(inferenceCalls.dataPoints.length, 1);
    assert.strictEqual(toolCalls.dataPoints.length, 1);
    assert.strictEqual(inferenceCalls.dataPointType, DataPointType.HISTOGRAM);
    assert.strictEqual(toolCalls.dataPointType, DataPointType.HISTOGRAM);
    assert.strictEqual(inferenceCalls.dataPoints[0].value.sum, 1);
    assert.strictEqual(toolCalls.dataPoints[0].value.sum, 2);
  });

  it('marks agent.asTool() transfer past intermediate task span and subtracts nested usage without affecting concurrent runs', async () => {
    const { processor, exporter } = ctx;
    const outerAgent = createSpan('t1', 'outer', 'agent', undefined, {
      name: 'outer',
      output_type: 'OrderSchema',
    });
    const outerTurn = createSpan('t1', 'outer-turn', 'turn', 'outer', {
      turn: 1,
      usage: { input_tokens: 150, output_tokens: 60 },
    });
    const asToolSpan = createSpan('t1', 'as-tool', 'function', 'outer-turn', {
      name: 'ask_inner',
    });
    const innerTask = createSpan('t1', 'inner-task', 'task', 'as-tool');
    const innerAgent = createSpan('t1', 'inner', 'agent', 'inner-task', {
      name: 'inner',
    });
    const innerTurn = createSpan('t1', 'inner-turn', 'turn', 'inner', {
      turn: 1,
      usage: { input_tokens: 50, output_tokens: 20 },
    });
    // A handoff inside the nested asTool run must not overwrite ask_inner's transfer target.
    const handoffTarget = createSpan(
      't1',
      'handoff-target',
      'agent',
      'inner-task',
      { name: 'third' }
    );

    const concurrentAgent = createSpan('t2', 'other', 'agent', undefined, {
      name: 'other',
    });
    const concurrentTurn = createSpan('t2', 'other-turn', 'turn', 'other', {
      turn: 1,
      usage: { input_tokens: 80, output_tokens: 30 },
    });

    await processor.onSpanStart(outerAgent);
    await processor.onSpanStart(outerTurn);
    await processor.onSpanStart(concurrentAgent);
    await processor.onSpanStart(concurrentTurn);
    await processor.onSpanStart(asToolSpan);
    await processor.onSpanStart(innerTask);
    await processor.onSpanStart(innerAgent);
    await processor.onSpanStart(innerTurn);
    await processor.onSpanEnd(innerTurn);
    await processor.onSpanEnd(innerAgent);
    await processor.onSpanStart(handoffTarget);
    await processor.onSpanEnd(handoffTarget);
    await processor.onSpanEnd(innerTask);
    await processor.onSpanEnd(asToolSpan);
    await processor.onSpanEnd(concurrentTurn);
    await processor.onSpanEnd(concurrentAgent);
    await processor.onSpanEnd(outerTurn);
    await processor.onSpanEnd(outerAgent);

    const spans = exporter.getFinishedSpans();
    const inner = spans.find(s => s.name === 'invoke_agent inner');
    const tool = spans.find(s => s.name === 'execute_tool ask_inner');
    const outer = spans.find(s => s.name === 'invoke_agent outer');
    const other = spans.find(s => s.name === 'invoke_agent other');
    assert.ok(inner);
    assert.ok(tool);
    assert.ok(outer);
    assert.ok(other);

    assert.strictEqual(
      tool.attributes[ATTR_GEN_AI_TRANSFER_MODE],
      GEN_AI_TRANSFER_MODE_VALUE_RETURN_TO_CALLER
    );
    assert.strictEqual(
      tool.attributes[ATTR_GEN_AI_TRANSFER_TARGET_NAME],
      'inner'
    );
    assert.strictEqual(
      outer.attributes[ATTR_GEN_AI_OUTPUT_TYPE],
      GEN_AI_OUTPUT_TYPE_VALUE_JSON
    );
    assert.strictEqual(inner.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 50);
    assert.strictEqual(inner.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 20);
    assert.strictEqual(outer.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 100);
    assert.strictEqual(outer.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 40);
    assert.strictEqual(other.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 80);
    assert.strictEqual(other.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 30);
  });

  it('uses own response usage without subtracting direct nested runs inside a function tool', async () => {
    const { processor, exporter } = ctx;
    const outerAgent = createSpan('t1', 'outer', 'agent', undefined, {
      name: 'outer',
    });
    const outerResp = createSpan('t1', 'outer-resp', 'response', 'outer', {
      _response: {
        model: 'gpt-4o-2024-08-06',
        usage: { input_tokens: 40, output_tokens: 15 },
      },
    });
    const fnTool = createSpan('t1', 'fn', 'function', 'outer', {
      name: 'custom_tool',
    });
    const innerAgent = createSpan('t1', 'inner', 'agent', 'fn', {
      name: 'helper',
    });
    const innerResp = createSpan('t1', 'inner-resp', 'response', 'inner', {
      _response: {
        model: 'gpt-4o-mini-2024-07-18',
        usage: { input_tokens: 120, output_tokens: 60 },
      },
    });

    await processor.onSpanStart(outerAgent);
    await processor.onSpanStart(outerResp);
    await processor.onSpanEnd(outerResp);
    await processor.onSpanStart(fnTool);
    await processor.onSpanStart(innerAgent);
    await processor.onSpanStart(innerResp);
    await processor.onSpanEnd(innerResp);
    await processor.onSpanEnd(innerAgent);
    await processor.onSpanEnd(fnTool);
    await processor.onSpanEnd(outerAgent);

    const spans = exporter.getFinishedSpans();
    const outer = spans.find(s => s.name === 'invoke_agent outer')!;
    const inner = spans.find(s => s.name === 'invoke_agent helper')!;
    assert.strictEqual(outer.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 40);
    assert.strictEqual(outer.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 15);
    assert.strictEqual(inner.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 120);
    assert.strictEqual(inner.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 60);
  });

  it('extracts Chat Completions params, finish reasons, opt-in messages, and lets generation model override agent.model', async () => {
    const { processor, exporter } = ctx;
    ctx.setCaptureMode('span_only');
    const runContext = context
      .active()
      .setValue(OPENAI_AGENTS_RUN_CONTEXT_KEY, {});
    await context.with(runContext, async () => {
      processor.onAgentMetadata({ name: 'chat-agent', model: 'gpt-4o-mini' });
      const agent = createSpan('t1', 'agent', 'agent', undefined, {
        name: 'chat-agent',
      });
      const generation = createSpan('t1', 'gen', 'generation', 'agent', {
        model: 'gpt-4o',
        model_config: {
          temperature: 0.5,
          top_p: 0.8,
          max_tokens: 512,
          frequency_penalty: 0.1,
          presence_penalty: 0.2,
        },
        input: [
          { role: 'system', content: 'Be helpful.' },
          { role: 'user', content: 'Hi' },
        ],
        output: [
          {
            choices: [
              {
                finish_reason: 'stop',
                message: { role: 'assistant', content: 'Hello!' },
              },
            ],
          },
        ],
      });

      await processor.onSpanStart(agent);
      await processor.onSpanStart(generation);
      await processor.onSpanEnd(generation);
      await processor.onSpanEnd(agent);
    });

    const [agentSpan] = exporter.getFinishedSpans();
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL], 'gpt-4o');
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE], 0.5);
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_REQUEST_TOP_P], 0.8);
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS], 512);
    assert.strictEqual(
      agentSpan.attributes[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY],
      0.1
    );
    assert.strictEqual(
      agentSpan.attributes[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY],
      0.2
    );
    assert.deepStrictEqual(
      agentSpan.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
      ['stop']
    );
    assert.deepStrictEqual(
      JSON.parse(String(agentSpan.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS])),
      [{ type: 'text', content: 'Be helpful.' }]
    );
    assert.deepStrictEqual(
      JSON.parse(String(agentSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES])),
      [{ role: 'user', parts: [{ type: 'text', content: 'Hi' }] }]
    );
    assert.deepStrictEqual(
      JSON.parse(String(agentSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES])),
      [{ role: 'assistant', parts: [{ type: 'text', content: 'Hello!' }] }]
    );
  });

  it('captures first model call input and last model call output across multiple Responses turns', async () => {
    const { processor, exporter } = ctx;
    ctx.setCaptureMode('span_only');
    const agent = createSpan('t1', 'agent', 'agent', undefined, {
      name: 'multi-turn',
    });
    const resp1 = createSpan('t1', 'resp-1', 'response', 'agent', {
      _input: 'Initial question',
      _response: {
        model: 'gpt-4o-mini',
        instructions: 'Answer concisely.',
        output: [
          {
            type: 'function_call',
            call_id: 'c1',
            name: 'lookup',
            arguments: '{}',
          },
        ],
      },
    });
    const resp2 = createSpan('t1', 'resp-2', 'response', 'agent', {
      _input: [
        { role: 'user', content: 'Initial question' },
        {
          type: 'function_call',
          call_id: 'c1',
          name: 'lookup',
          arguments: '{}',
        },
      ],
      _response: {
        model: 'gpt-4o-mini',
        instructions: 'Answer concisely.',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Final answer' }],
          },
        ],
      },
    });

    await processor.onSpanStart(agent);
    await processor.onSpanStart(resp1);
    await processor.onSpanEnd(resp1);
    await processor.onSpanStart(resp2);
    await processor.onSpanEnd(resp2);
    await processor.onSpanEnd(agent);

    const [agentSpan] = exporter.getFinishedSpans();
    assert.deepStrictEqual(
      JSON.parse(String(agentSpan.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS])),
      [{ type: 'text', content: 'Answer concisely.' }]
    );
    assert.deepStrictEqual(
      JSON.parse(String(agentSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES])),
      [{ role: 'user', parts: [{ type: 'text', content: 'Initial question' }] }]
    );
    assert.deepStrictEqual(
      JSON.parse(String(agentSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES])),
      [{ role: 'assistant', parts: [{ type: 'text', content: 'Final answer' }] }]
    );
  });

  it('populates runner metadata on parallel tool calls, backfills late agent metadata, and refreshes mutated agents per run', async () => {
    const { processor, exporter } = ctx;
    ctx.setCaptureMode('span_only');
    const sharedAgent = {
      name: 'triage',
      handoffDescription: 'Routes customer requests',
      model: 'gpt-4o-mini',
      tools: [
        {
          type: 'function',
          name: 'lookup_order',
          description: 'Look up an order by ID',
          parameters: { type: 'object' },
        },
      ],
    };

    const runOneContext = context
      .active()
      .setValue(OPENAI_AGENTS_RUN_CONTEXT_KEY, {});
    await context.with(runOneContext, async () => {
      processor.onAgentMetadata(sharedAgent);

      const agent = createSpan('t1', 'agent', 'agent', undefined, {
        name: 'triage',
      });
      const toolA = createSpan('t1', 'tool-a', 'function', 'agent', {
        name: 'lookup_order',
      });
      const toolB = createSpan('t1', 'tool-b', 'function', 'agent', {
        name: 'lookup_order',
      });
      const lateAgent = createSpan('t1', 'late', 'agent', undefined, {
        name: 'late-handoff-target',
      });

      await processor.onSpanStart(agent);
      await processor.onSpanStart(toolA);
      await processor.onSpanStart(toolB);
      processor.onToolCallMetadata(
        'tool-b',
        { name: 'lookup_order', description: 'Look up an order by ID' },
        { toolCall: { callId: 'call_second', name: 'lookup_order' } }
      );
      processor.onToolCallMetadata(
        'tool-a',
        { name: 'lookup_order', description: 'Look up an order by ID' },
        { toolCall: { callId: 'call_first', name: 'lookup_order' } }
      );
      processor.onToolCallMetadata(
        'agent',
        { name: 'lookup_order', description: 'Wrong target' },
        { toolCall: { callId: 'call_wrong', name: 'lookup_order' } }
      );
      await processor.onSpanEnd(toolA);
      await processor.onSpanEnd(toolB);
      await processor.onSpanEnd(agent);

      await processor.onSpanStart(lateAgent);
      processor.onAgentMetadata({
        name: 'late-handoff-target',
        handoffDescription: 'Handles billing escalations',
        model: 'gpt-4o',
        tools: [
          { type: 'function', name: 'refund', description: 'Refunds order' },
        ],
      });
      await processor.onSpanEnd(lateAgent);
    });

    // Mutate the same Agent instance before a second run to verify metadata refreshes.
    sharedAgent.model = 'gpt-4.1';
    const runTwoContext = context
      .active()
      .setValue(OPENAI_AGENTS_RUN_CONTEXT_KEY, {});
    await context.with(runTwoContext, async () => {
      processor.onAgentMetadata(sharedAgent);
      const agent2 = createSpan('t2', 'agent-2', 'agent', undefined, {
        name: 'triage',
      });
      await processor.onSpanStart(agent2);
      await processor.onSpanEnd(agent2);
    });

    const [toolSpanA, toolSpanB, agentSpan, lateSpan, secondRunSpan] =
      exporter.getFinishedSpans();
    assert.strictEqual(agentSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ID], undefined);
    assert.strictEqual(
      agentSpan.attributes[ATTR_GEN_AI_AGENT_DESCRIPTION],
      'Routes customer requests'
    );
    assert.strictEqual(
      agentSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      'gpt-4o-mini'
    );
    assert.ok(agentSpan.attributes[ATTR_GEN_AI_TOOL_DEFINITIONS]);
    assert.strictEqual(
      toolSpanA.attributes[ATTR_GEN_AI_TOOL_DESCRIPTION],
      'Look up an order by ID'
    );
    assert.strictEqual(
      toolSpanA.attributes[ATTR_GEN_AI_TOOL_CALL_ID],
      'call_first'
    );
    assert.strictEqual(
      toolSpanB.attributes[ATTR_GEN_AI_TOOL_CALL_ID],
      'call_second'
    );
    assert.strictEqual(
      lateSpan.attributes[ATTR_GEN_AI_AGENT_DESCRIPTION],
      'Handles billing escalations'
    );
    assert.strictEqual(lateSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL], 'gpt-4o');
    assert.ok(lateSpan.attributes[ATTR_GEN_AI_TOOL_DEFINITIONS]);
    assert.strictEqual(
      secondRunSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      'gpt-4.1'
    );
  });
});
