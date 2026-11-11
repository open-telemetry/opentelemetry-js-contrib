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
  createClientInvokeAgentDurationHistogram,
  createDurationHistogram,
  createInputTokenOperationHistogram,
  createInputTokenUsageCounter,
  createInvokeAgentDurationHistogram,
  createInvokeAgentInferenceCallsHistogram,
  createInvokeAgentToolCallsHistogram,
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
  METRIC_GEN_AI_CLIENT_INVOKE_AGENT_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS,
  METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS,
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

  it('should create agent invocation histograms', async () => {
    const meter = meterProvider.getMeter('test-meter');
    createInvokeAgentDurationHistogram(meter).record(1.5);
    createInvokeAgentInferenceCallsHistogram(meter).record(3);
    createInvokeAgentToolCallsHistogram(meter).record(2);
    createClientInvokeAgentDurationHistogram(meter).record(0.5);

    const metrics = await collectMetrics();

    const invokeAgentDuration = metrics.get(
      METRIC_GEN_AI_INVOKE_AGENT_DURATION
    );
    assert.ok(invokeAgentDuration?.dataPointType === DataPointType.HISTOGRAM);
    assert.strictEqual(invokeAgentDuration.descriptor.unit, 's');
    assert.deepStrictEqual(
      invokeAgentDuration.dataPoints[0].value.buckets.boundaries,
      [
        0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8, 25.6, 51.2, 102.4, 204.8,
        409.6, 900, 1800, 3600, 7200, 14400, 43200, 86400,
      ]
    );

    const inferenceCalls = metrics.get(
      METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
    );
    assert.ok(inferenceCalls?.dataPointType === DataPointType.HISTOGRAM);
    assert.strictEqual(inferenceCalls.descriptor.unit, '{inference_call}');
    assert.strictEqual(inferenceCalls.descriptor.valueType, ValueType.INT);
    assert.deepStrictEqual(
      inferenceCalls.dataPoints[0].value.buckets.boundaries,
      [1, 2, 4, 8, 16, 32, 64, 128]
    );

    const toolCalls = metrics.get(METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS);
    assert.ok(toolCalls?.dataPointType === DataPointType.HISTOGRAM);
    assert.strictEqual(toolCalls.descriptor.unit, '{tool_call}');
    assert.strictEqual(toolCalls.descriptor.valueType, ValueType.INT);
    assert.deepStrictEqual(
      toolCalls.dataPoints[0].value.buckets.boundaries,
      [1, 2, 4, 8, 16, 32, 64, 128]
    );

    const clientInvokeAgentDuration = metrics.get(
      METRIC_GEN_AI_CLIENT_INVOKE_AGENT_DURATION
    );
    assert.ok(
      clientInvokeAgentDuration?.dataPointType === DataPointType.HISTOGRAM
    );
    assert.strictEqual(clientInvokeAgentDuration.descriptor.unit, 's');
    assert.deepStrictEqual(
      clientInvokeAgentDuration.dataPoints[0].value.buckets.boundaries,
      [
        0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24,
        20.48, 40.96, 81.92,
      ]
    );
  });
});
