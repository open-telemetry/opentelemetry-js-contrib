/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { SpanKind, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SamplingDecision,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { TelemetryHandler } from '../../src';
import {
  ATTR_GEN_AI_AGENT_DESCRIPTION,
  ATTR_GEN_AI_AGENT_ID,
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_AGENT_VERSION,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_DATA_SOURCE_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_CHOICE_COUNT,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_PREVIOUS_RESPONSE_ID,
  ATTR_GEN_AI_REQUEST_SEED,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_DEFINITIONS,
  ATTR_GEN_AI_USAGE_AUDIO_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_AUDIO_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_AUDIO_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_IMAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_IMAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_IMAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_TEXT_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_TEXT_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_TEXT_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INVOKE_AGENT_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS,
  METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS,
} from '../../src/semconv';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('AgentInvocation', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  describe('in-process agent invocation (gen_ai.invoke_agent.internal)', () => {
    it('should create an INTERNAL span with default invoke_agent operation name', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      const invocation = handler.startAgent();
      invocation.stop();

      const spans = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];

      assert.strictEqual(span.name, 'invoke_agent');
      assert.strictEqual(span.kind, SpanKind.INTERNAL);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OPERATION_NAME],
        'invoke_agent'
      );
      assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
    });

    it('should format span name with agentName and set initial attributes', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      const invocation = handler.startAgent({
        agentName: 'Math Tutor',
        agentDescription: 'Helps with math problems',
        conversationId: 'conv_123',
        dataSourceId: 'ds_456',
        outputType: 'json',
        requestModel: 'gpt-4o',
        requestOptions: {
          temperature: 0.7,
          topP: 0.95,
          maxTokens: 2048,
          stopSequences: ['STOP'],
          frequencyPenalty: 0.2,
          presencePenalty: 0.3,
          choiceCount: 2,
          seed: 42,
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.name, 'invoke_agent Math Tutor');
      assert.strictEqual(span.kind, SpanKind.INTERNAL);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OPERATION_NAME],
        'invoke_agent'
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_AGENT_NAME], 'Math Tutor');
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_AGENT_DESCRIPTION],
        'Helps with math problems'
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_CONVERSATION_ID],
        'conv_123'
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_DATA_SOURCE_ID], 'ds_456');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_OUTPUT_TYPE], 'json');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_MODEL], 'gpt-4o');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE], 0.7);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TOP_P], 0.95);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_MAX_TOKENS], 2048);
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES],
        ['STOP']
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY],
        0.2
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY],
        0.3
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_CHOICE_COUNT], 2);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_SEED], 42);
    });

    it('should support invoke_workflow and invoke_runner operation names and omit request.model from duration metric', async () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        meterProvider: ctx.meterProvider,
      });

      handler
        .startAgent({
          operationName: 'invoke_workflow',
          agentName: 'CustomerSupportPipeline',
          requestModel: 'gpt-4o',
        })
        .stop();

      handler
        .startAgent({
          operationName: 'invoke_runner',
        })
        .stop();

      const spans = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      assert.strictEqual(
        spans[0].name,
        'invoke_workflow CustomerSupportPipeline'
      );
      assert.strictEqual(
        spans[0].attributes[ATTR_GEN_AI_OPERATION_NAME],
        'invoke_workflow'
      );
      assert.strictEqual(spans[1].name, 'invoke_runner');
      assert.strictEqual(
        spans[1].attributes[ATTR_GEN_AI_OPERATION_NAME],
        'invoke_runner'
      );

      const { resourceMetrics } = await ctx.metricReader.collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const durationMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_DURATION
      );
      assert.ok(durationMetric);
      const workflowPoint = (
        durationMetric.dataPoints as Array<{
          attributes: Record<string, unknown>;
        }>
      ).find(
        dp => dp.attributes[ATTR_GEN_AI_OPERATION_NAME] === 'invoke_workflow'
      );
      assert.ok(workflowPoint);
      assert.deepStrictEqual(workflowPoint.attributes, {
        [ATTR_GEN_AI_OPERATION_NAME]: 'invoke_workflow',
        [ATTR_GEN_AI_AGENT_NAME]: 'CustomerSupportPipeline',
      });
    });

    it('should ignore remote-only setters (setAgentId, setAgentVersion, setStreaming) on in-process spans', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      const invocation = handler.startAgent({ agentName: 'LocalAgent' });
      invocation
        .setAgentId('asst_ignored')
        .setAgentVersion('1.0.0')
        .setStreaming();
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_AGENT_ID], undefined);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_AGENT_VERSION], undefined);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_STREAM],
        undefined
      );
    });

    it('should update span name and attribute when setAgentName is called dynamically', async () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        meterProvider: ctx.meterProvider,
      });

      const invocation = handler.startAgent();
      invocation
        .setAgentName('DynamicAgent')
        .setAgentDescription('Dynamically discovered agent')
        .setConversationId('conv_dyn')
        .setDataSourceId('ds_dyn')
        .setOutputType('text')
        .setRequestModel('claude-3-5-sonnet');
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.name, 'invoke_agent DynamicAgent');
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_AGENT_NAME],
        'DynamicAgent'
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_AGENT_DESCRIPTION],
        'Dynamically discovered agent'
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_CONVERSATION_ID],
        'conv_dyn'
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_DATA_SOURCE_ID], 'ds_dyn');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_OUTPUT_TYPE], 'text');
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_MODEL],
        'claude-3-5-sonnet'
      );

      const { resourceMetrics } = await ctx.metricReader.collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const durationMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_DURATION
      );
      assert.ok(durationMetric);
      assert.strictEqual(
        durationMetric.dataPoints[0].attributes[ATTR_GEN_AI_AGENT_NAME],
        'DynamicAgent'
      );
      assert.strictEqual(
        durationMetric.dataPoints[0].attributes[ATTR_GEN_AI_REQUEST_MODEL],
        'claude-3-5-sonnet'
      );
    });

    it('should record finish reasons and token usage on in-process agent spans', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      const invocation = handler.startAgent({ agentName: 'Planner' });
      invocation.setFinishReasons(['stop']);
      invocation.setUsage({ inputTokenCount: 150 });
      invocation.setUsage({ outputTokenCount: 75 });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ['stop']
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 150);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 75);

      ctx.reset();

      const invMissingReason = handler.startAgent({ agentName: 'Planner' });
      invMissingReason.addOutputMessages([
        { role: 'assistant', parts: [{ type: 'text', content: 'A' }] },
        { role: 'assistant', parts: [{ type: 'text', content: 'B' }] },
      ]);
      invMissingReason.setFinishReasons(['stop', '']);
      invMissingReason.stop();

      const [spanMissingReason] = ctx.memoryExporter.getFinishedSpans();
      assert.deepStrictEqual(
        spanMissingReason.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ['stop', 'error']
      );
    });

    it('should respect content capture mode (none vs span_only) for messages, system instructions, and tool definitions', () => {
      const inputMessages = [
        {
          role: 'user' as const,
          parts: [{ type: 'text' as const, content: 'Hi' }],
        },
      ];
      const outputMessages = [
        {
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, content: 'Hello!' }],
        },
      ];
      const systemInstructions = [
        { type: 'text' as const, content: 'You are a helpful agent.' },
      ];
      const toolDefinitions = [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get current weather',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
        },
      ];

      // 1. Mode: none
      const handlerNone = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        contentCaptureMode: 'none',
      });
      const invNone = handlerNone.startAgent({
        agentName: 'WeatherAgent',
        inputMessages,
        systemInstructions,
        toolDefinitions,
      });
      invNone.addOutputMessages(outputMessages);
      invNone.stop();

      const [spanNone] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(
        spanNone.attributes[ATTR_GEN_AI_INPUT_MESSAGES],
        undefined
      );
      assert.strictEqual(
        spanNone.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        undefined
      );
      assert.strictEqual(
        spanNone.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS],
        undefined
      );
      assert.strictEqual(
        spanNone.attributes[ATTR_GEN_AI_TOOL_DEFINITIONS],
        undefined
      );

      ctx.reset();

      // 2. Mode: span_only
      const handlerSpan = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        contentCaptureMode: 'span_only',
      });
      const invSpan = handlerSpan.startAgent({
        agentName: 'WeatherAgent',
        inputMessages,
      });
      invSpan.addInputMessages([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is the weather?' }],
        },
      ]);
      invSpan.addOutputMessages(outputMessages);
      invSpan.setSystemInstructions(systemInstructions);
      invSpan.setToolDefinitions(toolDefinitions);
      invSpan.stop();

      const [spanCaptured] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(
        spanCaptured.attributes[ATTR_GEN_AI_INPUT_MESSAGES],
        JSON.stringify([
          ...inputMessages,
          {
            role: 'user',
            parts: [{ type: 'text', content: 'What is the weather?' }],
          },
        ])
      );
      assert.strictEqual(
        spanCaptured.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        JSON.stringify(outputMessages)
      );
      assert.strictEqual(
        spanCaptured.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS],
        JSON.stringify(systemInstructions)
      );
      assert.strictEqual(
        spanCaptured.attributes[ATTR_GEN_AI_TOOL_DEFINITIONS],
        JSON.stringify(toolDefinitions)
      );
    });

    it('should record gen_ai.invoke_agent.duration, inference_calls, and tool_calls metrics', async () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        meterProvider: ctx.meterProvider,
      });

      const invocation = handler.startAgent({
        agentName: 'ResearchAgent',
        requestModel: 'gpt-4o',
      });
      invocation.recordInferenceCall();
      invocation.recordInferenceCall(2);
      invocation.recordToolCall();
      invocation.stop();

      const { resourceMetrics } = await ctx.metricReader.collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];

      const durationMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_DURATION
      );
      assert.ok(
        durationMetric,
        'gen_ai.invoke_agent.duration was not recorded'
      );
      assert.strictEqual(durationMetric.descriptor.unit, 's');
      assert.deepStrictEqual(durationMetric.dataPoints[0].attributes, {
        [ATTR_GEN_AI_OPERATION_NAME]: 'invoke_agent',
        [ATTR_GEN_AI_AGENT_NAME]: 'ResearchAgent',
        [ATTR_GEN_AI_REQUEST_MODEL]: 'gpt-4o',
      });

      const inferenceCallsMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
      );
      assert.ok(
        inferenceCallsMetric,
        'gen_ai.invoke_agent.inference_calls was not recorded'
      );
      assert.strictEqual(
        inferenceCallsMetric.descriptor.unit,
        '{inference_call}'
      );
      assert.strictEqual(
        (inferenceCallsMetric.dataPoints[0].value as { sum?: number }).sum,
        3
      );
      assert.deepStrictEqual(inferenceCallsMetric.dataPoints[0].attributes, {
        [ATTR_GEN_AI_OPERATION_NAME]: 'invoke_agent',
        [ATTR_GEN_AI_AGENT_NAME]: 'ResearchAgent',
      });

      const toolCallsMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      assert.ok(
        toolCallsMetric,
        'gen_ai.invoke_agent.tool_calls was not recorded'
      );
      assert.strictEqual(toolCallsMetric.descriptor.unit, '{tool_call}');
      assert.strictEqual(
        (toolCallsMetric.dataPoints[0].value as { sum?: number }).sum,
        1
      );
      assert.deepStrictEqual(toolCallsMetric.dataPoints[0].attributes, {
        [ATTR_GEN_AI_OPERATION_NAME]: 'invoke_agent',
        [ATTR_GEN_AI_AGENT_NAME]: 'ResearchAgent',
      });
    });

    it('should support setInferenceCalls and setToolCalls and omit call metrics when unset', async () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        meterProvider: ctx.meterProvider,
      });

      // First invocation: no inference/tool call counts set
      handler.startAgent({ agentName: 'SimpleAgent' }).stop();

      let { resourceMetrics } = await ctx.metricReader.collect();
      let metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      assert.strictEqual(
        metrics.find(
          m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
        ),
        undefined
      );
      assert.strictEqual(
        metrics.find(
          m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
        ),
        undefined
      );

      // Second invocation: explicit counts set via setInferenceCalls / setToolCalls
      const inv2 = handler.startAgent({ agentName: 'SimpleAgent' });
      inv2.setInferenceCalls(4);
      inv2.setToolCalls(0);
      inv2.stop();

      ({ resourceMetrics } = await ctx.metricReader.collect());
      metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const infMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
      );
      const toolMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      assert.ok(infMetric);
      assert.strictEqual(
        (infMetric.dataPoints[0].value as { sum?: number }).sum,
        4
      );
      assert.ok(toolMetric);
      assert.strictEqual(
        (toolMetric.dataPoints[0].value as { sum?: number }).sum,
        0
      );
    });

    it('should record error.type on duration metric when in-process agent fails, but not on call count metrics', async () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        meterProvider: ctx.meterProvider,
      });

      const invocation = handler.startAgent({ agentName: 'FailingAgent' });
      invocation.setInferenceCalls(1);
      invocation.setToolCalls(2);
      invocation.fail({
        exception: new TypeError('Agent execution failed'),
        statusDescription: 'Agent step error',
      });

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(span.status.message, 'Agent step error');
      assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'TypeError');

      const { resourceMetrics } = await ctx.metricReader.collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];

      const durationMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_DURATION
      );
      assert.ok(durationMetric);
      assert.strictEqual(
        durationMetric.dataPoints[0].attributes[ATTR_ERROR_TYPE],
        'TypeError'
      );

      const inferenceCallsMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
      );
      assert.ok(inferenceCallsMetric);
      assert.strictEqual(
        inferenceCallsMetric.dataPoints[0].attributes[ATTR_ERROR_TYPE],
        undefined
      );
    });
  });

  describe('remote client agent invocation (gen_ai.client.invoke_agent)', () => {
    it('should create a CLIENT span with remote agent attributes', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      const invocation = handler.startAgent({
        providerName: 'aws.bedrock',
        agentName: 'CustomerServiceBot',
        agentId: 'asst_123',
        agentVersion: '2.1.0',
        conversationId: 'conv_remote',
        previousResponseId: 'resp_prev_001',
        serverAddress: 'bedrock-agent-runtime.us-east-1.amazonaws.com',
        serverPort: 443,
        requestModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        requestOptions: {
          stream: true,
          temperature: 0.5,
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.name, 'invoke_agent CustomerServiceBot');
      assert.strictEqual(span.kind, SpanKind.CLIENT);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OPERATION_NAME],
        'invoke_agent'
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_PROVIDER_NAME],
        'aws.bedrock'
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_AGENT_NAME],
        'CustomerServiceBot'
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_AGENT_ID], 'asst_123');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_AGENT_VERSION], '2.1.0');
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_CONVERSATION_ID],
        'conv_remote'
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_PREVIOUS_RESPONSE_ID],
        'resp_prev_001'
      );
      assert.strictEqual(
        span.attributes[ATTR_SERVER_ADDRESS],
        'bedrock-agent-runtime.us-east-1.amazonaws.com'
      );
      assert.strictEqual(span.attributes[ATTR_SERVER_PORT], 443);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_STREAM], true);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE], 0.5);
    });

    it('should omit server.port when server.address is not provided', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      handler
        .startAgent({
          providerName: 'openai',
          serverPort: 443,
        })
        .stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_SERVER_ADDRESS], undefined);
      assert.strictEqual(span.attributes[ATTR_SERVER_PORT], undefined);
    });

    it('should support dynamic setters for agentId, agentVersion, and streaming', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      const invocation = handler.startAgent({
        providerName: 'openai',
      });
      invocation
        .setAgentId('asst_dynamic')
        .setAgentVersion('1.0.0')
        .setStreaming();
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_AGENT_ID], 'asst_dynamic');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_AGENT_VERSION], '1.0.0');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_STREAM], true);
    });

    it('should record cache and modality token usage attributes on remote client agent spans', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      const invocation = handler.startAgent({
        providerName: 'gcp.vertex_ai',
        agentName: 'MultimodalAgent',
      });
      invocation.setUsage({
        inputTokenCount: 300,
        outputTokenCount: 120,
        cacheReadTokenCount: 50,
        cacheWriteTokenCount: 25,
        tokenUsageByModality: {
          inputTokens: { text: 100, image: 150, audio: 50 },
          outputTokens: { text: 80, image: 20, audio: 20 },
          cacheReadTokens: { text: 30, image: 10, audio: 10 },
        },
      });
      invocation.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 300);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 120);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
        50
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS],
        25
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_TEXT_INPUT_TOKENS],
        100
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_TEXT_OUTPUT_TOKENS],
        80
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_TEXT_CACHE_READ_INPUT_TOKENS],
        30
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_IMAGE_INPUT_TOKENS],
        150
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_IMAGE_OUTPUT_TOKENS],
        20
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_IMAGE_CACHE_READ_INPUT_TOKENS],
        10
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_AUDIO_INPUT_TOKENS],
        50
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_AUDIO_OUTPUT_TOKENS],
        20
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_AUDIO_CACHE_READ_INPUT_TOKENS],
        10
      );

      ctx.reset();

      // Remote agent usage without modality breakdown
      const invNoModality = handler.startAgent({
        providerName: 'gcp.vertex_ai',
        agentName: 'SimpleRemoteAgent',
      });
      invNoModality.setUsage({
        inputTokenCount: 50,
        outputTokenCount: 25,
      });
      invNoModality.stop();

      const [spanNoModality] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(
        spanNoModality.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS],
        50
      );
      assert.strictEqual(
        spanNoModality.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS],
        25
      );
      assert.strictEqual(
        spanNoModality.attributes[ATTR_GEN_AI_USAGE_TEXT_INPUT_TOKENS],
        undefined
      );
    });

    it('should record gen_ai.client.invoke_agent.duration metric with remote dimensions', async () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        meterProvider: ctx.meterProvider,
      });

      handler
        .startAgent({
          providerName: 'aws.bedrock',
          agentName: 'SupportBot',
          requestModel: 'claude-3-5-sonnet',
          serverAddress: 'bedrock.us-east-1.amazonaws.com',
          serverPort: 443,
        })
        .stop();

      const { resourceMetrics } = await ctx.metricReader.collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const durationMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_CLIENT_INVOKE_AGENT_DURATION
      );
      assert.ok(
        durationMetric,
        'gen_ai.client.invoke_agent.duration was not recorded'
      );
      assert.strictEqual(durationMetric.descriptor.unit, 's');
      assert.deepStrictEqual(durationMetric.dataPoints[0].attributes, {
        [ATTR_GEN_AI_OPERATION_NAME]: 'invoke_agent',
        [ATTR_GEN_AI_PROVIDER_NAME]: 'aws.bedrock',
        [ATTR_GEN_AI_AGENT_NAME]: 'SupportBot',
        [ATTR_GEN_AI_REQUEST_MODEL]: 'claude-3-5-sonnet',
        [ATTR_SERVER_ADDRESS]: 'bedrock.us-east-1.amazonaws.com',
        [ATTR_SERVER_PORT]: 443,
      });
    });

    it('should provide sampling-relevant attributes at span creation time', () => {
      const seen: Attributes[] = [];
      const samplingTracerProvider = new TracerProvider({
        spanProcessors: [
          new SimpleSpanProcessor({ exporter: new InMemorySpanExporter() }),
        ],
        sampler: {
          shouldSample(_ctx, _traceId, _name, _kind, attributes) {
            seen.push(attributes);
            return { decision: SamplingDecision.RECORD_AND_SAMPLED };
          },
          toString: () => 'CapturingSampler',
        },
      });

      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: samplingTracerProvider,
      });

      handler
        .startAgent({
          providerName: 'openai',
          agentName: 'Math Tutor',
          serverAddress: 'api.openai.com',
          serverPort: 443,
        })
        .stop();

      assert.strictEqual(seen.length, 1);
      assert.strictEqual(seen[0][ATTR_GEN_AI_OPERATION_NAME], 'invoke_agent');
      assert.strictEqual(seen[0][ATTR_GEN_AI_PROVIDER_NAME], 'openai');
      assert.strictEqual(seen[0][ATTR_GEN_AI_AGENT_NAME], 'Math Tutor');
      assert.strictEqual(seen[0][ATTR_SERVER_ADDRESS], 'api.openai.com');
      assert.strictEqual(seen[0][ATTR_SERVER_PORT], 443);
    });

    it('should not let custom attributes override required semconv attributes', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
      });

      handler
        .startAgent({
          providerName: 'openai',
          attributes: {
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_PROVIDER_NAME]: 'overridden',
            'custom.attr': 'kept',
          },
        })
        .stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OPERATION_NAME],
        'invoke_agent'
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_PROVIDER_NAME], 'openai');
      assert.strictEqual(span.attributes['custom.attr'], 'kept');
    });

    it('should record caller-supplied metric attributes on every metric, overriding semantic convention dimensions', async () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        meterProvider: ctx.meterProvider,
      });

      const invocation = handler.startAgent({
        agentName: 'OriginalAgent',
        metricAttributes: { [ATTR_GEN_AI_AGENT_NAME]: 'OverriddenAgent' },
      });
      invocation.setMetricAttribute('custom.metric.attr', 'metric-value');
      invocation.setInferenceCalls(2);
      invocation.setToolCalls(1);
      invocation.stop();

      const { resourceMetrics } = await ctx.metricReader.collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      assert.strictEqual(metrics.length, 3);

      for (const metric of metrics) {
        for (const { attributes } of metric.dataPoints) {
          const name = metric.descriptor.name;
          assert.strictEqual(
            attributes['custom.metric.attr'],
            'metric-value',
            name
          );
          assert.strictEqual(
            attributes[ATTR_GEN_AI_AGENT_NAME],
            'OverriddenAgent',
            name
          );
          assert.strictEqual(
            attributes[ATTR_GEN_AI_OPERATION_NAME],
            'invoke_agent',
            name
          );
        }
      }

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes['custom.metric.attr'], undefined);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_AGENT_NAME],
        'OriginalAgent'
      );
    });
  });
});
