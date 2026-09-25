/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { TelemetryHandler, type TelemetryHandlerOptions } from '../src/handler';
import { SpanKind, context, diag, type DiagLogger } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { GEN_AI_SCHEMA_URL } from '../src/semconv';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from './helpers/test-setup';

const TEST_INSTRUMENTATION_NAME = '@opentelemetry/instrumentation-test-genai';
const TEST_INSTRUMENTATION_VERSION = '9.9.9';

/**
 * Create a handler with the required instrumentation scope pre-filled, so that
 * individual tests only specify the options they actually exercise.
 */
function createHandler(
  options: Partial<TelemetryHandlerOptions> = {}
): TelemetryHandler {
  return new TelemetryHandler({
    instrumentationName: TEST_INSTRUMENTATION_NAME,
    instrumentationVersion: TEST_INSTRUMENTATION_VERSION,
    ...options,
  });
}

describe('TelemetryHandler', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  it('should initialize with default options', () => {
    const handler = createHandler();

    assert.ok(handler.getTracer());
    assert.ok(handler.getMeter());
    assert.strictEqual(handler.getDiag(), diag);
    assert.strictEqual(handler.getContentCaptureMode(), 'none');
  });

  it('should initialize with custom options', () => {
    const customDiag: DiagLogger = {
      verbose: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const handler = createHandler({
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
      diag: customDiag,
      contentCaptureMode: 'span_only',
    });

    assert.ok(handler.getTracer());
    assert.ok(handler.getMeter());
    assert.strictEqual(handler.getDiag(), customDiag);
    assert.strictEqual(handler.getContentCaptureMode(), 'span_only');
  });

  it('should use the instrumentation name and version supplied by the caller', async () => {
    const instrumentationName = '@opentelemetry/instrumentation-explicit-scope';
    const instrumentationVersion = '1.2.3';
    const handler = createHandler({
      instrumentationName,
      instrumentationVersion,
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    const span = handler.getTracer().startSpan('test-scope-span');
    span.end();

    const spanRecord = ctx.memoryExporter
      .getFinishedSpans()
      .find(s => s.name === 'test-scope-span');
    assert.ok(spanRecord);
    assert.strictEqual(
      spanRecord.instrumentationScope.name,
      instrumentationName
    );
    assert.strictEqual(
      spanRecord.instrumentationScope.version,
      instrumentationVersion
    );
    // The schema URL stays owned by genai-util, not the caller.
    assert.strictEqual(
      spanRecord.instrumentationScope.schemaUrl,
      GEN_AI_SCHEMA_URL
    );

    handler.recordOperationDuration(0.5);
    const metricCollection = await ctx.metricReader.collect();
    const scopeMetric = metricCollection.resourceMetrics.scopeMetrics.find(
      sm => sm.scope.name === instrumentationName
    );
    assert.ok(scopeMetric);
    assert.strictEqual(scopeMetric.scope.version, instrumentationVersion);
    assert.strictEqual(scopeMetric.scope.schemaUrl, GEN_AI_SCHEMA_URL);
  });

  it('should record metrics and handle boundary values when meterProvider is configured', () => {
    const handler = createHandler({ meterProvider: ctx.meterProvider });

    // Valid recordings
    handler.recordOperationDuration(1.23, { 'gen_ai.system': 'openai' });
    handler.recordTokenUsage(
      { inputTokens: 10, outputTokens: 25 },
      { 'gen_ai.system': 'openai' }
    );
    handler.recordTimeToFirstChunk(0.45, { 'gen_ai.system': 'openai' });
    handler.recordTimePerOutputChunk(0.12, { 'gen_ai.system': 'openai' });

    // Boundary/invalid duration values should be ignored without error
    handler.recordOperationDuration(-1);
    handler.recordOperationDuration(NaN);
    handler.recordOperationDuration(Infinity);
    handler.recordTimeToFirstChunk(-1);
    handler.recordTimeToFirstChunk(NaN);
    handler.recordTimeToFirstChunk(Infinity);
    handler.recordTimePerOutputChunk(-1);
    handler.recordTimePerOutputChunk(NaN);
    handler.recordTimePerOutputChunk(Infinity);

    // Boundary/partial token usage values
    handler.recordTokenUsage({ inputTokens: 10 }); // only input tokens
    handler.recordTokenUsage({ outputTokens: 20 }); // only output tokens
    handler.recordTokenUsage({ inputTokens: -5, outputTokens: -10 }); // negative tokens ignored
    handler.recordTokenUsage(undefined as any); // undefined usage ignored
  });

  it('should resolve content capture mode with correct priority', () => {
    // 1. Explicit contentCaptureMode in options
    const handlerExplicit = createHandler({
      contentCaptureMode: 'span_only',
      config: { captureMessageContent: 'none' },
    });
    assert.strictEqual(handlerExplicit.getContentCaptureMode(), 'span_only');

    // 2. Config captureMessageContent fallback
    const handlerConfig = createHandler({
      config: { captureMessageContent: 'span_only' },
    });
    assert.strictEqual(handlerConfig.getContentCaptureMode(), 'span_only');

    // 3. Environment variable fallback
    process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT =
      'span_only';
    const handlerEnv = createHandler();
    assert.strictEqual(handlerEnv.getContentCaptureMode(), 'span_only');
    delete process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
  });

  it('should determine whether to capture content based on mode', () => {
    // 1. Defaults to false when mode is none
    const handlerDefault = createHandler();
    assert.strictEqual(handlerDefault.shouldCaptureContent(), false);

    // 2. True when capture mode is span_only
    const handlerSpanOnly = createHandler({
      contentCaptureMode: 'span_only',
    });
    assert.strictEqual(handlerSpanOnly.shouldCaptureContent(), true);
  });

  it('should start inference, embedding, and tool invocations with appropriate span kinds', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '1.2.3',
      tracerProvider: ctx.tracerProvider,
    });

    const inference = handler.startInference({
      providerName: 'openai',
      operationName: 'chat',
      requestModel: 'gpt-4o',
    });
    inference.stop();

    const embedding = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-small',
    });
    embedding.stop();

    const tool = handler.startTool({
      toolName: 'calculator',
    });
    tool.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3);

    const [infSpan, embSpan, toolSpan] = spans;
    assert.strictEqual(infSpan.name, 'chat gpt-4o');
    assert.strictEqual(infSpan.kind, SpanKind.CLIENT);

    assert.strictEqual(embSpan.name, 'embeddings text-embedding-3-small');
    assert.strictEqual(embSpan.kind, SpanKind.CLIENT);

    assert.strictEqual(toolSpan.name, 'execute_tool calculator');
    assert.strictEqual(toolSpan.kind, SpanKind.INTERNAL);
  });

  it('should nest invocations started inside another invocation context', () => {
    const contextManager = new AsyncLocalStorageContextManager();
    context.setGlobalContextManager(contextManager.enable());

    try {
      const handler = new TelemetryHandler({
        instrumentationName: 'test',
        instrumentationVersion: '1.2.3',
        tracerProvider: ctx.tracerProvider,
      });

      const inference = handler.startInference({
        providerName: 'openai',
        operationName: 'chat',
        requestModel: 'gpt-4o',
      });

      // Started without an explicit parentContext: it must pick up the active
      // invocation context.
      inference.withContext(() => {
        handler.startTool({ toolName: 'calculator' }).stop();
        // Explicit parentContext must work outside of withContext() as well.
        handler
          .startEmbedding({
            providerName: 'openai',
            requestModel: 'text-embedding-3-small',
            parentContext: context.active(),
          })
          .stop();
      });

      inference.stop();

      const spans = ctx.memoryExporter.getFinishedSpans();

      // The invocation's span is encapsulated, but it is exported like any other
      // span once the invocation is stopped.
      const inferenceSpan = spans.find(s => s.name === 'chat gpt-4o');
      assert.ok(inferenceSpan);
      const inferenceSpanId = inferenceSpan.spanContext().spanId;

      const toolSpan = spans.find(s => s.name === 'execute_tool calculator');
      assert.ok(toolSpan);
      assert.strictEqual(toolSpan.parentSpanContext?.spanId, inferenceSpanId);

      const embeddingSpan = spans.find(
        s => s.name === 'embeddings text-embedding-3-small'
      );
      assert.ok(embeddingSpan);
      assert.strictEqual(
        embeddingSpan.parentSpanContext?.spanId,
        inferenceSpanId
      );
    } finally {
      context.disable();
    }
  });
});
