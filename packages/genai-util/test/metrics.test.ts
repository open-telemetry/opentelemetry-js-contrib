/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { ValueType } from '@opentelemetry/api';
import {
  DataPointType,
  MeterProvider,
  MetricReader,
  type MetricData,
} from '@opentelemetry/sdk-metrics';
import {
  createCacheReadInputTokenUsageCounter,
  createCacheWriteInputTokenUsageCounter,
  createDurationHistogram,
  createInputTokenOperationHistogram,
  createInputTokenUsageCounter,
  createOutputTokenOperationHistogram,
  createOutputTokenUsageCounter,
  createReasoningOutputTokenUsageCounter,
  createTimeToFirstChunkHistogram,
  createTimePerOutputChunkHistogram,
} from '../src/metrics';
import {
  METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_READ_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_WRITE_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_REASONING_OUTPUT_TOKENS,
} from '../src/semconv';

class TestMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

describe('GenAI Metrics Helpers', () => {
  let meterProvider: MeterProvider;
  let metricReader: TestMetricReader;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({ readers: [metricReader] });
  });

  afterEach(async () => {
    await meterProvider.shutdown();
  });

  async function collectMetrics(): Promise<Map<string, MetricData>> {
    const { resourceMetrics } = await metricReader.collect();
    return new Map(
      resourceMetrics.scopeMetrics
        .flatMap(sm => sm.metrics)
        .map(metric => [metric.descriptor.name, metric])
    );
  }

  it('should create duration histogram', () => {
    const meter = meterProvider.getMeter('test-meter');
    const durationHistogram = createDurationHistogram(meter);

    assert.ok(durationHistogram);
  });

  it('should create token operation histograms', async () => {
    const meter = meterProvider.getMeter('test-meter');
    createInputTokenOperationHistogram(meter).record(10);
    createOutputTokenOperationHistogram(meter).record(20);

    const metrics = await collectMetrics();
    for (const name of [
      METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS,
      METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS,
    ]) {
      const metric = metrics.get(name);
      assert.ok(metric?.dataPointType === DataPointType.HISTOGRAM, name);
      assert.strictEqual(metric.descriptor.unit, '{token}');
      assert.strictEqual(metric.descriptor.valueType, ValueType.INT);
      assert.deepStrictEqual(
        metric.dataPoints[0].value.buckets.boundaries,
        [
          1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304,
          16777216, 67108864,
        ]
      );
    }
  });

  it('should create token usage counters', async () => {
    const meter = meterProvider.getMeter('test-meter');
    createInputTokenUsageCounter(meter).add(1);
    createOutputTokenUsageCounter(meter).add(1);
    createCacheReadInputTokenUsageCounter(meter).add(1);
    createCacheWriteInputTokenUsageCounter(meter).add(1);
    createReasoningOutputTokenUsageCounter(meter).add(1);

    const metrics = await collectMetrics();
    for (const name of [
      METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
      METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
      METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_READ_INPUT_TOKENS,
      METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_WRITE_INPUT_TOKENS,
      METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_REASONING_OUTPUT_TOKENS,
    ]) {
      const metric = metrics.get(name);
      assert.ok(metric?.dataPointType === DataPointType.SUM, name);
      assert.strictEqual(metric.isMonotonic, true);
      assert.strictEqual(metric.descriptor.unit, '{token}');
      assert.strictEqual(metric.descriptor.valueType, ValueType.INT);
    }
  });

  it('should create time to first chunk histogram', () => {
    const meter = meterProvider.getMeter('test-meter');
    const ttftHistogram = createTimeToFirstChunkHistogram(meter);

    assert.ok(ttftHistogram);
  });

  it('should create time per output chunk histogram', () => {
    const meter = meterProvider.getMeter('test-meter');
    const histogram = createTimePerOutputChunkHistogram(meter);

    assert.ok(histogram);
  });
});
