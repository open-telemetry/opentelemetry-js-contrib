/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { DataPointType, MeterProvider } from '@opentelemetry/sdk-metrics';
import { RuntimeNodeInstrumentation } from '../src/index';
import { TestMetricReader } from './testMetricsReader';
import { METRIC_V8JS_MEMORY_HEAP_LIMIT } from '../src/semconv';

const MEASUREMENT_INTERVAL = 10;

describe('v8js.memory.heap.limit', function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
  });

  it(`should write ${METRIC_V8JS_MEMORY_HEAP_LIMIT} after monitoringPrecision`, async function () {
    // arrange
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
      captureUncaughtException: false,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 5));
    const { resourceMetrics, errors } = await metricReader.collect();

    // assert
    assert.deepEqual(
      errors,
      [],
      'expected no errors from the callback during collection'
    );
    const scopeMetrics = resourceMetrics.scopeMetrics;
    const metric = scopeMetrics[0].metrics.find(
      x => x.descriptor.name === METRIC_V8JS_MEMORY_HEAP_LIMIT
    );

    assert.notEqual(
      metric,
      undefined,
      `${METRIC_V8JS_MEMORY_HEAP_LIMIT} not found`
    );

    assert.strictEqual(
      metric!.dataPointType,
      DataPointType.SUM,
      'expected sum (UpDownCounter)'
    );

    assert.strictEqual(
      metric!.descriptor.name,
      METRIC_V8JS_MEMORY_HEAP_LIMIT,
      'descriptor.name'
    );
  });

  it('should have a positive value representing the heap size limit', async function () {
    // arrange
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
      captureUncaughtException: false,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 5));
    const { resourceMetrics, errors } = await metricReader.collect();

    // assert
    assert.deepEqual(errors, []);
    const scopeMetrics = resourceMetrics.scopeMetrics;
    const metric = scopeMetrics[0].metrics.find(
      x => x.descriptor.name === METRIC_V8JS_MEMORY_HEAP_LIMIT
    );

    assert.notEqual(
      metric,
      undefined,
      `${METRIC_V8JS_MEMORY_HEAP_LIMIT} not found`
    );

    if (metric!.dataPointType === DataPointType.SUM) {
      assert.strictEqual(
        metric!.dataPoints.length,
        1,
        'expected exactly one data point (global, not per-space)'
      );
      const value = metric!.dataPoints[0].value as number;
      assert.ok(value > 0, `expected positive heap_size_limit, got ${value}`);
    }
  });

  it('should not have v8js.heap.space.name attribute (global metric)', async function () {
    // arrange
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
      captureUncaughtException: false,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 5));
    const { resourceMetrics, errors } = await metricReader.collect();

    // assert
    assert.deepEqual(errors, []);
    const scopeMetrics = resourceMetrics.scopeMetrics;
    const metric = scopeMetrics[0].metrics.find(
      x => x.descriptor.name === METRIC_V8JS_MEMORY_HEAP_LIMIT
    );

    assert.notEqual(metric, undefined);

    if (metric!.dataPointType === DataPointType.SUM) {
      for (const dp of metric!.dataPoints) {
        assert.strictEqual(
          dp.attributes['v8js.heap.space.name'],
          undefined,
          'v8js.memory.heap.limit should not have v8js.heap.space.name attribute'
        );
      }
    }
  });
});
