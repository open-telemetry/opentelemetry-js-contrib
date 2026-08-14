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
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  EVENT_EXCEPTION,
} from '@opentelemetry/semantic-conventions';
import {
  TelemetryHandler,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_STATUS,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_REQUEST_STREAM_CURSOR,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_DATA_SOURCE_ID,
  ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT,
  ATTR_GEN_AI_RETRIEVAL_DOCUMENTS,
  ATTR_GEN_AI_WORKFLOW_NAME,
  ATTR_GEN_AI_AGENT_NAME,
  GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
  GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE,
  GEN_AI_RESPONSE_STATUS_VALUE_COMPLETED,
  type CompletionResult,
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
        reasoningTokens: 5,
        cacheReadTokens: 15,
        cacheCreationTokens: 8,
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
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_ID],
        'chatcmpl-123'
      );
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ['stop']
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS], 10);
      assert.strictEqual(span.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS], 20);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS],
        5
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS],
        15
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS],
        8
      );
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
      assert.strictEqual(span.events[0].name, EVENT_EXCEPTION);
    });

    it('should respect content capture mode when disabled vs enabled', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const handlerNone = new TelemetryHandler({
        tracer,
        contentCaptureMode: 'none',
      });

      const invNone = handlerNone.startInference({
        providerName: 'openai',
        inputMessages: [
          {
            role: 'user',
            parts: [{ type: 'text', content: 'What is the weather?' }],
          },
        ],
      });

      invNone.addOutputMessages([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'It is sunny.' }],
          finish_reason: 'stop',
        },
      ]);
      invNone.stop();

      const spansNone = memoryExporter.getFinishedSpans();
      assert.strictEqual(spansNone.length, 1);
      assert.strictEqual(
        spansNone[0].attributes[ATTR_GEN_AI_INPUT_MESSAGES],
        undefined
      );
      assert.strictEqual(
        spansNone[0].attributes[ATTR_GEN_AI_OUTPUT_MESSAGES],
        undefined
      );

      memoryExporter.reset();

      const handlerSpan = new TelemetryHandler({
        tracer,
        contentCaptureMode: 'span_only',
      });

      const invSpan = handlerSpan.startInference({
        providerName: 'openai',
        inputMessages: [
          {
            role: 'user',
            parts: [{ type: 'text', content: 'What is the weather?' }],
          },
        ],
      });

      invSpan.addOutputMessages([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'It is sunny.' }],
          finish_reason: 'stop',
        },
      ]);
      invSpan.stop();

      const spansSpan = memoryExporter.getFinishedSpans();
      assert.strictEqual(spansSpan.length, 1);
      assert.ok(spansSpan[0].attributes[ATTR_GEN_AI_INPUT_MESSAGES]);
      assert.ok(spansSpan[0].attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
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
        span.attributes[ATTR_GEN_AI_TOOL_NAME],
        'get_stock_price'
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_TOOL_CALL_ID],
        'call_123'
      );
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
      assert.strictEqual(spans[0].name, 'invoke_agent researcher');
      assert.strictEqual(
        spans[0].attributes[ATTR_GEN_AI_OPERATION_NAME],
        'invoke_agent'
      );
      assert.strictEqual(spans[0].attributes[ATTR_GEN_AI_AGENT_NAME], 'researcher');
      assert.strictEqual(spans[1].name, 'invoke_workflow summarize_docs');
      assert.strictEqual(
        spans[1].attributes[ATTR_GEN_AI_OPERATION_NAME],
        'invoke_workflow'
      );
      assert.strictEqual(
        spans[1].attributes[ATTR_GEN_AI_WORKFLOW_NAME],
        'summarize_docs'
      );
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
        spans[0].attributes[ATTR_SERVER_ADDRESS],
        'api.anthropic.com'
      );
      assert.strictEqual(spans[0].attributes[ATTR_SERVER_PORT], 443);
      assert.strictEqual(
        spans[0].attributes[ATTR_GEN_AI_CONVERSATION_ID],
        'conv-123'
      );
      assert.strictEqual(spans[0].attributes['custom.key'], 'custom.val');
      assert.strictEqual(spans[0].attributes['another.key'], 'val2');
    });
  });

  describe('RetrievalInvocation', () => {
    it('should create and populate retrieval span with attributes and content', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const meter = meterProvider.getMeter('test-meter');
      const handler = new TelemetryHandler({
        tracer,
        meter,
        contentCaptureMode: 'span_only',
      });

      const inv = handler.startRetrieval({
        dataSourceId: 'kb_articles_v2',
        providerName: 'pinecone',
        requestModel: 'text-embedding-3-small',
        topK: 5,
        serverAddress: 'pinecone.io',
        serverPort: 443,
        queryText: 'How do I reset my password?',
        documents: [
          { id: 'doc_1', content: 'Go to settings and click reset password.' },
          { id: 'doc_2', content: 'Contact admin if locked out.' },
        ],
      });

      inv.stop();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];

      assert.strictEqual(span.name, 'retrieval kb_articles_v2');
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OPERATION_NAME],
        GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL
      );
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_DATA_SOURCE_ID],
        'kb_articles_v2'
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_PROVIDER_NAME], 'pinecone');
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_MODEL],
        'text-embedding-3-small'
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_TOP_K], 5);
      assert.strictEqual(span.attributes[ATTR_SERVER_ADDRESS], 'pinecone.io');
      assert.strictEqual(span.attributes[ATTR_SERVER_PORT], 443);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT],
        'How do I reset my password?'
      );
      assert.ok(span.attributes[ATTR_GEN_AI_RETRIEVAL_DOCUMENTS]);
      assert.strictEqual(span.status.code, SpanStatusCode.OK);
    });

    it('should format default span name when dataSourceId is not provided', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const handler = new TelemetryHandler({ tracer });

      const inv = handler.startRetrieval({});
      inv.stop();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      assert.strictEqual(spans[0].name, 'retrieval');
    });

    it('should handle retrieval failure', () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const handler = new TelemetryHandler({ tracer });

      const inv = handler.startRetrieval({
        dataSourceId: 'kb_articles',
        providerName: 'qdrant',
      });
      inv.fail(new Error('Connection timed out'));

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];

      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(span.status.message, 'Connection timed out');
      assert.strictEqual(span.events.length, 1);
      assert.strictEqual(span.events[0].name, EVENT_EXCEPTION);
    });
  });

  describe('FetchResponseInvocation', () => {
    it('should create and populate fetch_response span with attributes and hooks', async () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      const meter = meterProvider.getMeter('test-meter');
      let hookCalledWith: CompletionResult | undefined;

      const handler = new TelemetryHandler({
        tracer,
        meter,
        contentCaptureMode: 'span_only',
        completionHooks: [
          {
            onCompletion: result => {
              hookCalledWith = result;
            },
          },
        ],
      });

      const inv = handler.startFetchResponse({
        providerName: 'openai',
        responseId: 'batch_req_abc123',
        requestStream: false,
        serverAddress: 'api.openai.com',
        serverPort: 443,
      });

      inv.setResponseModel('gpt-4o');
      inv.setResponseStatus(GEN_AI_RESPONSE_STATUS_VALUE_COMPLETED);
      inv.setFinishReasons(['stop']);
      inv.setStreamCursor('cursor_xyz');
      inv.setSystemInstructions('You are a helpful assistant.');
      inv.addOutputMessages([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Batch task completed successfully.' }],
          finish_reason: 'stop',
        },
      ]);
      inv.stop();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];

      assert.strictEqual(span.name, 'fetch_response');
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_OPERATION_NAME],
        GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_PROVIDER_NAME], 'openai');
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_ID],
        'batch_req_abc123'
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_REQUEST_STREAM], false);
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_REQUEST_STREAM_CURSOR],
        'cursor_xyz'
      );
      assert.strictEqual(span.attributes[ATTR_GEN_AI_RESPONSE_MODEL], 'gpt-4o');
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_STATUS],
        'completed'
      );
      assert.deepStrictEqual(
        span.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS],
        ['stop']
      );
      assert.strictEqual(
        span.attributes[ATTR_SERVER_ADDRESS],
        'api.openai.com'
      );
      assert.strictEqual(span.attributes[ATTR_SERVER_PORT], 443);
      assert.ok(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]);
      assert.ok(span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]);
      assert.strictEqual(span.status.code, SpanStatusCode.OK);

      // Verify getters
      assert.strictEqual(inv.getResponseModel(), 'gpt-4o');
      assert.strictEqual(inv.getResponseStatus(), 'completed');
      assert.strictEqual(inv.getStreamCursor(), 'cursor_xyz');

      // Verify hook execution
      await new Promise(r => setTimeout(r, 10));
      assert.ok(hookCalledWith);
      assert.strictEqual(hookCalledWith.responseId, 'batch_req_abc123');
      assert.strictEqual(hookCalledWith.responseModel, 'gpt-4o');
      assert.strictEqual(hookCalledWith.responseStatus, 'completed');
    });

    it('should handle fetch_response failure and trigger completion hook with error', async () => {
      const tracer = tracerProvider.getTracer('test-tracer');
      let hookCalledWith: CompletionResult | undefined;

      const handler = new TelemetryHandler({
        tracer,
        completionHooks: [
          {
            onCompletion: result => {
              hookCalledWith = result;
            },
          },
        ],
      });

      const inv = handler.startFetchResponse({
        providerName: 'anthropic',
        responseId: 'msgbatch_999',
      });

      inv.fail(new Error('Batch expired'));

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];

      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(span.status.message, 'Batch expired');

      await new Promise(r => setTimeout(r, 10));
      assert.ok(hookCalledWith);
      assert.ok(hookCalledWith.error instanceof Error);
    });
  });
});
