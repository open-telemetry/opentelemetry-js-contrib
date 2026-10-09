/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { TelemetryHandler, type TelemetryHandlerOptions } from '../src/handler';
import {
  SpanKind,
  context,
  diag,
  type Attributes,
  type DiagLogger,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  DataPointType,
  type MetricData,
  type MetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  ATTR_GEN_AI_TOKEN_MODALITY,
  GEN_AI_SCHEMA_URL,
  GEN_AI_TOKEN_MODALITY_VALUE_AUDIO,
  GEN_AI_TOKEN_MODALITY_VALUE_IMAGE,
  GEN_AI_TOKEN_MODALITY_VALUE_TEXT,
  GEN_AI_TOKEN_MODALITY_VALUE_UNKNOWN,
  METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_READ_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_WRITE_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_REASONING_OUTPUT_TOKENS,
} from '../src/semconv';
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

/** Collect the metrics recorded so far, keyed by instrument name. */
async function collectMetricsByName(
  metricReader: MetricReader
): Promise<Map<string, MetricData>> {
  const { resourceMetrics } = await metricReader.collect();
  return new Map(
    resourceMetrics.scopeMetrics
      .flatMap(sm => sm.metrics)
      .map(metric => [metric.descriptor.name, metric])
  );
}

/** Return the attributes, count and sum of each data point of a histogram. */
function histogramPoints(
  metric: MetricData | undefined
): Array<{ attributes: Attributes; count: number; sum?: number }> {
  assert.ok(metric?.dataPointType === DataPointType.HISTOGRAM);
  return metric.dataPoints.map(({ attributes, value }) => ({
    attributes,
    count: value.count,
    sum: value.sum,
  }));
}

/**
 * Return the attributes and value of each data point of a counter, sorted by
 * token modality.
 */
function counterPoints(
  metric: MetricData | undefined
): Array<[Attributes, number]> {
  assert.ok(metric?.dataPointType === DataPointType.SUM);
  const modalityOf = (attributes: Attributes) =>
    String(attributes[ATTR_GEN_AI_TOKEN_MODALITY]);
  return metric.dataPoints
    .map(({ attributes, value }): [Attributes, number] => [attributes, value])
    .sort(([a], [b]) => modalityOf(a).localeCompare(modalityOf(b)));
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

  describe('recordTokenUsage', () => {
    const attributes: Attributes = {
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'gcp.gemini',
    };
    const withModality = (modality: string): Attributes => ({
      ...attributes,
      [ATTR_GEN_AI_TOKEN_MODALITY]: modality,
    });

    it('should record input and output tokens once on the operation histograms, without a modality', async () => {
      const handler = createHandler({ meterProvider: ctx.meterProvider });
      handler.recordInferenceTokenUsage(
        {
          inputTokenCount: 300,
          outputTokenCount: 40,
        },
        attributes
      );

      const metrics = await collectMetricsByName(ctx.metricReader);
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS)
        ),
        [{ attributes, count: 1, sum: 300 }]
      );
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS)
        ),
        [{ attributes, count: 1, sum: 40 }]
      );
    });

    it('should record the sum across modalities on the operation histograms', async () => {
      const handler = createHandler({ meterProvider: ctx.meterProvider });
      handler.recordInferenceTokenUsage(
        {
          inputTokenCount: 300,
          outputTokenCount: 42,
          tokenUsageByModality: {
            inputTokens: { text: 100, image: 200, audio: -5 },
            outputTokens: { text: 30, audio: 12 },
          },
        },
        attributes
      );

      const metrics = await collectMetricsByName(ctx.metricReader);
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS)
        ),
        [{ attributes, count: 1, sum: 300 }]
      );
      assert.deepStrictEqual(
        histogramPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS)
        ),
        [{ attributes, count: 1, sum: 42 }]
      );
    });

    it('should split the usage counters by modality', async () => {
      const handler = createHandler({ meterProvider: ctx.meterProvider });
      handler.recordInferenceTokenUsage(
        {
          inputTokenCount: 250,
          outputTokenCount: 40,
          reasoningTokenCount: 300,
          tokenUsageByModality: {
            inputTokens: { text: 100, image: 150 },
            outputTokens: { text: 40, audio: 0 },
            cacheReadTokens: { text: 60 },
            cacheWriteTokens: { text: 20, audio: 50 },
          },
        },
        attributes
      );

      const metrics = await collectMetricsByName(ctx.metricReader);
      assert.deepStrictEqual(
        counterPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS)
        ),
        [
          [withModality(GEN_AI_TOKEN_MODALITY_VALUE_IMAGE), 150],
          [withModality(GEN_AI_TOKEN_MODALITY_VALUE_TEXT), 100],
        ]
      );
      assert.deepStrictEqual(
        counterPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS)
        ),
        [[withModality(GEN_AI_TOKEN_MODALITY_VALUE_TEXT), 40]]
      );
      assert.deepStrictEqual(
        counterPoints(
          metrics.get(
            METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_READ_INPUT_TOKENS
          )
        ),
        [[withModality(GEN_AI_TOKEN_MODALITY_VALUE_TEXT), 60]]
      );
      assert.deepStrictEqual(
        counterPoints(
          metrics.get(
            METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_WRITE_INPUT_TOKENS
          )
        ),
        [
          [withModality(GEN_AI_TOKEN_MODALITY_VALUE_AUDIO), 50],
          [withModality(GEN_AI_TOKEN_MODALITY_VALUE_TEXT), 20],
        ]
      );
      assert.deepStrictEqual(
        counterPoints(
          metrics.get(
            METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_REASONING_OUTPUT_TOKENS
          )
        ),
        [[withModality(GEN_AI_TOKEN_MODALITY_VALUE_TEXT), 300]]
      );
    });

    it('should not record spurious zeros for unreported modalities when token usage is present', async () => {
      const handler = createHandler({ meterProvider: ctx.meterProvider });
      handler.recordInferenceTokenUsage(
        {
          inputTokenCount: 100,
          outputTokenCount: 50,
          tokenUsageByModality: {
            inputTokens: { text: 100 },
            outputTokens: { text: 50 },
          },
        },
        attributes
      );

      const metrics = await collectMetricsByName(ctx.metricReader);

      // inputTokens was only reported for text: should only record text, no audio/image/unknown: 0
      assert.deepStrictEqual(
        counterPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS)
        ),
        [[withModality(GEN_AI_TOKEN_MODALITY_VALUE_TEXT), 100]]
      );

      // outputTokens was only reported for text: should only record text, no audio/image/unknown: 0
      assert.deepStrictEqual(
        counterPoints(
          metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS)
        ),
        [[withModality(GEN_AI_TOKEN_MODALITY_VALUE_TEXT), 50]]
      );

      // cacheReadTokens, cacheWriteTokens, and reasoningTokens were not reported:
      // should not emit spurious zeros for text/audio/image/unknown
      for (const name of [
        METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_READ_INPUT_TOKENS,
        METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_WRITE_INPUT_TOKENS,
        METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_REASONING_OUTPUT_TOKENS,
      ]) {
        const metric = metrics.get(name);
        assert.strictEqual(
          metric?.dataPoints.length ?? 0,
          0,
          `Expected no data points for unreported counter ${name}`
        );
      }
    });

    for (const testCase of [
      { label: 'undefined', usage: undefined },
      { label: 'empty object ({})', usage: {} },
    ]) {
      it(`should record 0 on histograms and unknown modality on counters when usage is ${testCase.label}`, async () => {
        const handler = createHandler({ meterProvider: ctx.meterProvider });
        handler.recordInferenceTokenUsage(testCase.usage, attributes);

        const metrics = await collectMetricsByName(ctx.metricReader);

        assert.deepStrictEqual(
          histogramPoints(
            metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS)
          ),
          [{ attributes, count: 1, sum: 0 }]
        );
        assert.deepStrictEqual(
          histogramPoints(
            metrics.get(METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS)
          ),
          [{ attributes, count: 1, sum: 0 }]
        );

        for (const name of [
          METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
          METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
          METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_READ_INPUT_TOKENS,
          METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_WRITE_INPUT_TOKENS,
          METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_REASONING_OUTPUT_TOKENS,
        ]) {
          const points = counterPoints(metrics.get(name));
          assert.strictEqual(
            points.length,
            1,
            `Expected exactly 1 data point for ${name}, got ${points.length}`
          );
          assert.deepStrictEqual(
            points,
            [[withModality(GEN_AI_TOKEN_MODALITY_VALUE_UNKNOWN), 0]],
            `Expected ${name} to record only unknown modality with count 0`
          );
        }
      });
    }
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
