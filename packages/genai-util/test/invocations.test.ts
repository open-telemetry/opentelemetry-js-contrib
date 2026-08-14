/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  TelemetryHandler,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
} from '../src';

class TestMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

describe('GenAI Invocations', () => {
  let tracerProvider: BasicTracerProvider;
  let memoryExporter: InMemorySpanExporter;
  let meterProvider: MeterProvider;
  let metricReader: TestMetricReader;

  beforeEach(() => {
    memoryExporter = new InMemorySpanExporter();
    tracerProvider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
    });

    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({ readers: [metricReader] });
  });

  afterEach(async () => {
    await meterProvider.shutdown();
    await tracerProvider.shutdown();
  });

  describe('InferenceInvocation', () => {
    it('should create and populate inference span with attributes', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const meter = meterProvider.getMeter('test-meter');
      const handler = new TelemetryHandler({
        tracer,
        meter,
        contentCaptureMode: 'span_only',
      });

      const invocation = handler.startInference({
        providerName: 'openai',
        operationName: 'chat',
        requestModel: 'gpt-4o',
        requestOptions: {
          temperature: 0.7,
        },
        inputMessages: [
          {
            role: 'user',
            parts: [{ type: 'text', content: 'Hello' }],
          },
        ],
      });

      invocation.setResponseModel('gpt-4o-2024-08-06');
      invocation.setResponseId('chatcmpl-123');
      invocation.setFinishReasons(['stop']);
      invocation.setUsage({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      });
      invocation.addOutputMessages([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Hi there!' }],
          finish_reason: 'stop',
        },
      ]);
      invocation.stop();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];

      assert.strictEqual(span.name, 'chat gpt-4o');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_PROVIDER_NAME], 'openai');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_OPERATION_NAME], 'chat');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_MODEL], 'gpt-4o');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE], 0.7);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_MODEL],
        'gpt-4o-2024-08-06'
      );
      assert.strictEqual(span.attributes['gen_ai.response.id'], 'chatcmpl-123');
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ['stop']
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 10);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 20);
      assert.ok(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES]);
      assert.ok(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
      assert.strictEqual(span.status.code, SpanStatusCode.OK);
    });

    it('should handle failure properly', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const handler = new TelemetryHandler({ tracer });

      const invocation = handler.startInference({
        providerName: 'anthropic',
        requestModel: 'claude-3-5-sonnet',
      });

      const testError = new Error('Rate limit exceeded');
      invocation.fail(testError);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];

      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(span.status.message, 'Rate limit exceeded');
      assert.strictEqual(span.events.length, 1);
      assert.strictEqual(span.events[0].name, 'exception');
    });

    it('should record events when event content capture mode is enabled', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const handler = new TelemetryHandler({
        tracer,
        contentCaptureMode: 'event_only',
      });

      const invocation = handler.startInference({
        providerName: 'openai',
        inputMessages: [
          {
            role: 'user',
            parts: [{ type: 'text', content: 'What is the weather?' }],
          },
        ],
      });

      invocation.addOutputMessages([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'It is sunny.' }],
          finish_reason: 'stop',
        },
      ]);
      invocation.stop();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];

      // Span attributes for input/output messages should NOT be set
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES],
        undefined
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        undefined
      );

      // But events should be present
      assert.ok(span.events.some(e => e.name === 'gen_ai.user.message'));
      assert.ok(span.events.some(e => e.name === 'gen_ai.choice'));
    });
  });

  describe('EmbeddingInvocation', () => {
    it('should handle embedding spans', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const handler = new TelemetryHandler({ tracer });

      const invocation = handler.startEmbedding({
        providerName: 'openai',
        requestModel: 'text-embedding-3-small',
      });

      invocation.setResponseModel('text-embedding-3-small');
      invocation.setUsage({ inputTokens: 50 });
      invocation.stop();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];

      assert.strictEqual(span.name, 'embeddings text-embedding-3-small');
      assert.strictEqual(span.attributes[ATTR_GEN_AI_PROVIDER_NAME], 'openai');
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OPERATION_NAME],
        'embeddings'
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 50);
      assert.strictEqual(span.status.code, SpanStatusCode.OK);
    });
  });

  describe('ToolInvocation', () => {
    it('should handle tool execution spans', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const handler = new TelemetryHandler({ tracer });

      const invocation = handler.startTool({
        toolName: 'get_stock_price',
        toolDescription: 'Fetch stock price for a symbol',
        toolCallId: 'call_123',
      });

      invocation.stop();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];

      assert.strictEqual(span.name, 'execute_tool get_stock_price');
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OPERATION_NAME],
        'execute_tool'
      );
      assert.strictEqual(
        span.attributes['gen_ai.tool.name'],
        'get_stock_price'
      );
      assert.strictEqual(span.attributes['gen_ai.tool.call.id'], 'call_123');
      assert.strictEqual(span.status.code, SpanStatusCode.OK);
    });
  });

  describe('Agent and Workflow Invocations', () => {
    it('should handle agent and workflow spans', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const handler = new TelemetryHandler({ tracer });

      const agentInv = handler.startAgent({
        agentId: 'agent_abc',
        agentName: 'researcher',
      });
      agentInv.stop();

      const workflowInv = handler.startWorkflow({
        workflowName: 'summarize_docs',
      });
      workflowInv.stop();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      assert.strictEqual(spans[0].name, 'agent researcher');
      assert.strictEqual(spans[1].name, 'workflow summarize_docs');
    });

    it('should handle agent and workflow errors', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const handler = new TelemetryHandler({ tracer });

      const agentInv = handler.startAgent({
        agentId: 'agent_abc',
        agentName: 'researcher',
        agentDescription: 'Research assistant',
        attributes: { 'custom.agent.attr': 'val' },
      });
      agentInv.setAttribute('step', 1);
      agentInv.fail(new Error('Agent crashed'));

      const workflowInv = handler.startWorkflow({
        workflowName: 'summarize_docs',
        attributes: { 'custom.wf.attr': 'val' },
      });
      workflowInv.setAttribute('stage', 'init');
      workflowInv.fail(new Error('Workflow failed'));

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
      assert.strictEqual(spans[1].status.code, SpanStatusCode.ERROR);
    });

    it('should handle embedding and tool errors', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const handler = new TelemetryHandler({ tracer });

      const embInv = handler.startEmbedding({
        providerName: 'openai',
        requestModel: 'text-embedding-3-small',
      });
      embInv.setAttribute('custom', 'val');
      embInv.fail(new Error('Embedding service error'));

      const toolInv = handler.startTool({
        toolName: 'calculator',
        toolDescription: 'Performs math',
        toolCallId: 'call_999',
      });
      toolInv.setResult(42);
      toolInv.setAttribute('custom', 'val');
      toolInv.fail(new Error('Tool failed'));

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
      assert.strictEqual(spans[1].status.code, SpanStatusCode.ERROR);
    });

    it('should handle comprehensive request options and system instructions', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const handler = new TelemetryHandler({
        tracer,
        contentCaptureMode: 'span_and_event',
      });

      const inv = handler.startInference({
        providerName: 'anthropic',
        operationName: 'chat',
        requestModel: 'claude-3-5-sonnet',
        conversationId: 'conv-123',
        serverAddress: 'api.anthropic.com',
        serverPort: 443,
        systemInstructions: 'Be concise.',
        requestOptions: {
          temperature: 0.5,
          topP: 0.9,
          topK: 50,
          maxTokens: 2048,
          stopSequences: ['END'],
          frequencyPenalty: 0.1,
          presencePenalty: 0.2,
          choiceCount: 1,
          seed: 42,
          encodingFormats: ['text'],
        },
      });

      inv.setAttribute('custom.key', 'custom.val');
      inv.setAttributes({ 'another.key': 'val2' });
      inv.recordStreamChunk('chunk');
      inv.stop();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      assert.strictEqual(
        spans[0].attributes['server.address'],
        'api.anthropic.com'
      );
      assert.strictEqual(spans[0].attributes['server.port'], 443);
      assert.strictEqual(
        spans[0].attributes['gen_ai.conversation.id'],
        'conv-123'
      );
      assert.strictEqual(spans[0].attributes['custom.key'], 'custom.val');
      assert.strictEqual(spans[0].attributes['another.key'], 'val2');
    });
  });
});
