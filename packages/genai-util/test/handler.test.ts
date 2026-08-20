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
import { TelemetryHandler } from '../src/handler';
import { isEventContentCaptureEnabled } from '../src/environment-variables';
import type { CompletionResult } from '../src/types';

class TestMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

describe('TelemetryHandler', () => {
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

  it('should initialize with custom completion hook and run it on invocation stop', async () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    let hookExecuted = false;

    const handler = new TelemetryHandler({
      tracer,
      completionHooks: [
        {
          onCompletion(result: CompletionResult) {
            hookExecuted = true;
            assert.strictEqual(result.providerName, 'openai');
          },
        },
      ],
    });

    const invocation = handler.startInference({
      providerName: 'openai',
      requestModel: 'gpt-4o',
    });
    invocation.stop();

    // Wait a tick for async completion hook
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(hookExecuted, true);
  });

  it('should allow dynamic setter of tracer and meter', () => {
    const handler = new TelemetryHandler();
    const tracer = tracerProvider.getTracer('dynamic-tracer');
    const meter = meterProvider.getMeter('dynamic-meter');

    handler.setTracer(tracer);
    handler.setMeter(meter);

    const inv = handler.startInference({
      providerName: 'cohere',
    });
    inv.stop();

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
  });

  it('should emit span events for Agent, Retrieval, Tool, and FetchResponse in event_only mode', () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({
      tracer,
      contentCaptureMode: 'event_only',
    });

    assert.strictEqual(
      isEventContentCaptureEnabled(handler.getContentCaptureMode()),
      true
    );

    // Agent invocation in event_only mode
    const agentInv = handler.startAgent({
      agentName: 'TestAgent',
      inputMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Agent prompt' }],
        },
      ],
      systemInstructions: 'System prompt',
    });
    agentInv.addOutputMessages([
      {
        role: 'assistant',
        parts: [{ type: 'text', content: 'Agent response' }],
      },
    ]);
    agentInv.stop();

    // Retrieval invocation in event_only mode
    const retrievalInv = handler.startRetrieval({
      dataSourceId: 'kb-1',
      queryText: 'Find info',
      documents: [{ text: 'Doc chunk 1' }],
    });
    retrievalInv.stop();

    // Tool invocation in event_only mode
    const toolInv = handler.startTool({
      toolName: 'calculator',
      toolArguments: { expr: '2+2' },
    });
    toolInv.setResult({ answer: 4 });
    toolInv.stop();

    // FetchResponse invocation in event_only mode
    const fetchInv = handler.startFetchResponse({
      providerName: 'openai',
      responseId: 'resp-123',
    });
    fetchInv.addOutputMessages([
      {
        role: 'assistant',
        parts: [{ type: 'text', content: 'Deferred response' }],
      },
    ]);
    fetchInv.setSystemInstructions('Fetch instructions');
    fetchInv.stop();

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 4);

    const [agentSpan, retrievalSpan, toolSpan, fetchSpan] = spans;

    // Agent span: attributes stripped, event emitted
    assert.strictEqual(
      agentSpan.attributes['gen_ai.input.messages'],
      undefined
    );
    assert.strictEqual(
      agentSpan.attributes['gen_ai.output.messages'],
      undefined
    );
    assert.strictEqual(agentSpan.events.length, 1);
    assert.strictEqual(
      agentSpan.events[0].name,
      'gen_ai.client.inference.operation.details'
    );
    assert.ok(agentSpan.events[0].attributes?.['gen_ai.input.messages']);
    assert.ok(agentSpan.events[0].attributes?.['gen_ai.output.messages']);

    // Retrieval span: attributes stripped, event emitted
    assert.strictEqual(
      retrievalSpan.attributes['gen_ai.retrieval.query.text'],
      undefined
    );
    assert.strictEqual(
      retrievalSpan.attributes['gen_ai.retrieval.documents'],
      undefined
    );
    assert.strictEqual(retrievalSpan.events.length, 1);
    assert.strictEqual(
      retrievalSpan.events[0].name,
      'gen_ai.client.inference.operation.details'
    );
    assert.strictEqual(
      retrievalSpan.events[0].attributes?.['gen_ai.retrieval.query.text'],
      'Find info'
    );

    // Tool span: attributes stripped, event emitted
    assert.strictEqual(
      toolSpan.attributes['gen_ai.tool.call.arguments'],
      undefined
    );
    assert.strictEqual(
      toolSpan.attributes['gen_ai.tool.call.result'],
      undefined
    );
    assert.strictEqual(toolSpan.events.length, 1);
    assert.strictEqual(
      toolSpan.events[0].name,
      'gen_ai.client.inference.operation.details'
    );
    assert.strictEqual(
      toolSpan.events[0].attributes?.['gen_ai.tool.call.arguments'],
      '{"expr":"2+2"}'
    );
    assert.strictEqual(
      toolSpan.events[0].attributes?.['gen_ai.tool.call.result'],
      '{"answer":4}'
    );

    // FetchResponse span: attributes stripped, event emitted
    assert.strictEqual(
      fetchSpan.attributes['gen_ai.output.messages'],
      undefined
    );
    assert.strictEqual(fetchSpan.events.length, 1);
    assert.strictEqual(
      fetchSpan.events[0].name,
      'gen_ai.client.inference.operation.details'
    );
    assert.ok(fetchSpan.events[0].attributes?.['gen_ai.output.messages']);
  });

  it('should reflect event emission enablement based on content capture mode', () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    const handlerEvent = new TelemetryHandler({
      tracer,
      contentCaptureMode: 'event_only',
    });
    assert.strictEqual(
      isEventContentCaptureEnabled(handlerEvent.getContentCaptureMode()),
      true
    );

    const handlerSpanAndEvent = new TelemetryHandler({
      tracer,
      contentCaptureMode: 'span_and_event',
    });
    assert.strictEqual(
      isEventContentCaptureEnabled(handlerSpanAndEvent.getContentCaptureMode()),
      true
    );

    const handlerSpanOnly = new TelemetryHandler({
      tracer,
      contentCaptureMode: 'span_only',
    });
    assert.strictEqual(
      isEventContentCaptureEnabled(handlerSpanOnly.getContentCaptureMode()),
      false
    );

    const handlerNone = new TelemetryHandler({
      tracer,
      contentCaptureMode: 'none',
    });
    assert.strictEqual(
      isEventContentCaptureEnabled(handlerNone.getContentCaptureMode()),
      false
    );

    process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT =
      'event_only';
    const handlerEnv = new TelemetryHandler({ tracer });
    assert.strictEqual(
      isEventContentCaptureEnabled(handlerEnv.getContentCaptureMode()),
      true
    );
    delete process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
  });
});
