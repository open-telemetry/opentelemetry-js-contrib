/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { TelemetryHandler } from '../../src/handler';
import {
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_CHOICE_COUNT,
  ATTR_GEN_AI_REQUEST_SEED,
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_DATA_SOURCE_ID,
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_AGENT_ID,
  ATTR_GEN_AI_AGENT_DESCRIPTION,
  ATTR_GEN_AI_AGENT_VERSION,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
} from '../../src/semconv';
import type { CompletionResult } from '../../src/types';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('Agent Invocations (Local & Remote)', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  it('should create local agent span with INTERNAL kind and all attributes', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const meter = ctx.meterProvider.getMeter('test-meter');
    const handler = new TelemetryHandler({
      tracer,
      meter,
      contentCaptureMode: 'span_only',
    });

    const agentInv = handler.startLocalAgent({
      agentId: 'agent_local_123',
      agentName: 'Math Tutor',
      agentDescription: 'Helps with algebra',
      agentVersion: '2.1.0',
      requestModel: 'gpt-4o',
      conversationId: 'conv_local_789',
      dataSourceId: 'ds_math_docs',
      outputType: 'text',
      requestOptions: {
        temperature: 0.2,
        topP: 0.95,
        topK: 40,
        maxTokens: 1024,
      },
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is 2 + 2?' }],
        },
      ],
      systemInstructions: [
        { type: 'text', content: 'You are a patient math tutor.' },
      ],
    });

    agentInv.setFinishReasons(['stop']);
    agentInv.setUsage({
      inputTokens: 15,
      outputTokens: 5,
      reasoningTokens: 2,
      cacheReadTokens: 4,
      cacheCreationTokens: 6,
    });
    agentInv.addOutputMessages([
      {
        role: 'assistant',
        parts: [{ type: 'text', content: '2 + 2 = 4' }],
        finish_reason: 'stop',
      },
    ]);
    agentInv.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.name, 'invoke_agent Math Tutor');
    assert.strictEqual(span.kind, SpanKind.INTERNAL);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_AGENT_NAME], 'Math Tutor');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_AGENT_ID],
      'agent_local_123'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_AGENT_DESCRIPTION],
      'Helps with algebra'
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_AGENT_VERSION], '2.1.0');
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_MODEL], 'gpt-4o');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      'conv_local_789'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_DATA_SOURCE_ID],
      'ds_math_docs'
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_OUTPUT_TYPE], 'text');
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE], 0.2);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TOP_P], 0.95);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TOP_K], 40);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS], 1024);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 15);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 5);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS],
      2
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
      4
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS],
      6
    );
    assert.deepStrictEqual(
      span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
      ['stop']
    );
    assert.ok(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES]);
    assert.ok(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
    assert.ok(span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]);
    assert.strictEqual(span.status.code, SpanStatusCode.OK);

    // Verify getters
    assert.strictEqual(agentInv.getAgentName(), 'Math Tutor');
    assert.strictEqual(agentInv.getAgentId(), 'agent_local_123');
    assert.strictEqual(agentInv.getAgentDescription(), 'Helps with algebra');
    assert.strictEqual(agentInv.getAgentVersion(), '2.1.0');
    assert.strictEqual(agentInv.getConversationId(), 'conv_local_789');
    assert.strictEqual(agentInv.getDataSourceId(), 'ds_math_docs');
    assert.strictEqual(agentInv.getOutputType(), 'text');
    assert.deepStrictEqual(agentInv.getFinishReasons(), ['stop']);
    assert.strictEqual(agentInv.getUsage()?.inputTokens, 15);
  });

  it('should create remote agent span with CLIENT kind, provider, server attributes, and metrics', async () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const meter = ctx.meterProvider.getMeter('test-meter');
    let hookResult: CompletionResult | undefined;

    const handler = new TelemetryHandler({
      tracer,
      meter,
      contentCaptureMode: 'span_only',
      completionHooks: [
        {
          onCompletion: res => {
            hookResult = res;
          },
        },
      ],
    });

    const remoteInv = handler.startRemoteAgent({
      providerName: 'aws.bedrock',
      requestModel: 'anthropic.claude-3-sonnet',
      agentName: 'Customer Support Agent',
      agentId: 'agent_remote_bedrock_001',
      serverAddress: 'bedrock-runtime.us-east-1.amazonaws.com',
      serverPort: 443,
    });

    remoteInv.setAgentDescription('Bedrock remote customer agent');
    remoteInv.setAgentVersion('1.0.0');
    remoteInv.setUsage({
      inputTokens: 120,
      outputTokens: 80,
    });
    remoteInv.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.name, 'invoke_agent Customer Support Agent');
    assert.strictEqual(span.kind, SpanKind.CLIENT);
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_PROVIDER_NAME],
      'aws.bedrock'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      'anthropic.claude-3-sonnet'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_AGENT_NAME],
      'Customer Support Agent'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_AGENT_ID],
      'agent_remote_bedrock_001'
    );
    assert.strictEqual(
      span.attributes[ATTR_SERVER_ADDRESS],
      'bedrock-runtime.us-east-1.amazonaws.com'
    );
    assert.strictEqual(span.attributes[ATTR_SERVER_PORT], 443);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 120);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 80);
    assert.strictEqual(span.status.code, SpanStatusCode.OK);

    // Verify completion hook execution
    await new Promise(r => setTimeout(r, 10));
    assert.ok(hookResult);
    assert.strictEqual(hookResult.providerName, 'aws.bedrock');
    assert.strictEqual(
      hookResult.operationName,
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
    );
    assert.strictEqual(hookResult.requestModel, 'anthropic.claude-3-sonnet');
    assert.strictEqual(hookResult.usage?.inputTokens, 120);
  });

  it('should handle remote agent failure with error status and exception recording', async () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    let hookResult: CompletionResult | undefined;

    const handler = new TelemetryHandler({
      tracer,
      completionHooks: [
        {
          onCompletion: res => {
            hookResult = res;
          },
        },
      ],
    });

    const remoteInv = handler.startRemoteAgent({
      providerName: 'openai',
      agentName: 'Faulty Assistant',
      serverAddress: 'api.openai.com',
      serverPort: 443,
    });

    const agentError = new Error('Remote agent execution timed out');
    remoteInv.fail(agentError);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.kind, SpanKind.CLIENT);
    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.status.message, 'Remote agent execution timed out');
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');
    assert.strictEqual(span.events.length, 1);
    assert.strictEqual(span.events[0].name, 'exception');

    await new Promise(r => setTimeout(r, 10));
    assert.ok(hookResult);
    assert.strictEqual(hookResult.error, agentError);
  });

  it('should format span name as invoke_agent <agentName> or fallback to invoke_agent per spec', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });

    // Case 1: Neither agentName nor agentId provided -> 'invoke_agent'
    const invDefault = handler.startAgent();
    invDefault.stop();

    // Case 2: Only agentId provided -> span name is 'invoke_agent', agentId set in attributes
    const invIdOnly = handler.startRemoteAgent({
      providerName: 'cohere',
      agentId: 'agent_id_only',
    });
    invIdOnly.stop();

    // Case 3: agentName provided -> 'invoke_agent Math Assistant'
    const invWithName = handler.startLocalAgent({
      agentId: 'agent_id_123',
      agentName: 'Math Assistant',
    });
    invWithName.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3);
    assert.strictEqual(spans[0].name, 'invoke_agent');
    assert.strictEqual(spans[0].kind, SpanKind.INTERNAL);

    assert.strictEqual(spans[1].name, 'invoke_agent');
    assert.strictEqual(spans[1].kind, SpanKind.CLIENT);
    assert.strictEqual(
      spans[1].attributes[ATTR_GEN_AI_AGENT_ID],
      'agent_id_only'
    );
    assert.strictEqual(spans[1].attributes[ATTR_GEN_AI_AGENT_NAME], undefined);

    assert.strictEqual(spans[2].name, 'invoke_agent Math Assistant');
    assert.strictEqual(spans[2].kind, SpanKind.INTERNAL);
    assert.strictEqual(
      spans[2].attributes[ATTR_GEN_AI_AGENT_NAME],
      'Math Assistant'
    );
    assert.strictEqual(
      spans[2].attributes[ATTR_GEN_AI_AGENT_ID],
      'agent_id_123'
    );
  });

  it('should populate all optional agent requestOptions attributes', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({ tracer });

    const inv = handler.startRemoteAgent({
      providerName: 'cohere',
      agentName: 'Tool Router',
      requestOptions: {
        frequencyPenalty: 0.3,
        presencePenalty: 0.4,
        choiceCount: 2,
        seed: 99,
        encodingFormats: ['text', 'json'],
        stopSequences: ['STOP_AGENT'],
      },
    });
    inv.setAttribute('agent.custom', true);
    inv.setAttributes({ 'another.custom': 123 });
    inv.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY],
      0.3
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY],
      0.4
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_CHOICE_COUNT], 2);
    assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_SEED], 99);
    assert.deepStrictEqual(
      span.attributes[ATTR_GEN_AI_REQUEST_ENCODING_FORMATS],
      ['text', 'json']
    );
    assert.deepStrictEqual(
      span.attributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES],
      ['STOP_AGENT']
    );
    assert.strictEqual(span.attributes['agent.custom'], true);
    assert.strictEqual(span.attributes['another.custom'], 123);
  });

  it('should record failure metrics and trigger completion hook with local agent metadata on failure', async () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const meter = ctx.meterProvider.getMeter('test-meter');
    let hookResult: CompletionResult | undefined;

    const handler = new TelemetryHandler({
      tracer,
      meter,
      completionHooks: [
        {
          onCompletion: res => {
            hookResult = res;
          },
        },
      ],
    });

    const agentInv = handler.startLocalAgent({
      agentId: 'agent_abc',
      agentName: 'researcher',
      agentDescription: 'Research assistant',
      conversationId: 'conv_local_999',
      requestModel: 'gpt-4o',
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Execute research task' }],
        },
      ],
      attributes: { 'custom.agent.attr': 'val' },
    });
    agentInv.setAttribute('step', 1);
    const agentError = new Error('Local agent crashed');
    agentInv.fail(agentError);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(spans[0].status.message, 'Local agent crashed');
    assert.strictEqual(spans[0].attributes[ATTR_ERROR_TYPE], 'Error');
    assert.strictEqual(
      spans[0].attributes[ATTR_GEN_AI_AGENT_NAME],
      'researcher'
    );
    assert.strictEqual(spans[0].attributes[ATTR_GEN_AI_AGENT_ID], 'agent_abc');
    assert.strictEqual(
      spans[0].attributes[ATTR_GEN_AI_CONVERSATION_ID],
      'conv_local_999'
    );
    assert.strictEqual(spans[0].attributes['custom.agent.attr'], 'val');
    assert.strictEqual(spans[0].attributes['step'], 1);

    await new Promise(r => setTimeout(r, 10));
    assert.ok(hookResult);
    assert.strictEqual(hookResult.error, agentError);
    assert.strictEqual(
      hookResult.operationName,
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
    );
    assert.strictEqual(hookResult.requestModel, 'gpt-4o');
    assert.strictEqual(hookResult.inputMessages?.length, 1);

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    const durationMetric = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_DURATION
    );
    assert.ok(durationMetric);
    const dataPoint = durationMetric.dataPoints[0];
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_OPERATION_NAME],
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
    );
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_REQUEST_MODEL],
      'gpt-4o'
    );
    assert.strictEqual(dataPoint.attributes[ATTR_ERROR_TYPE], 'Error');
  });
});
