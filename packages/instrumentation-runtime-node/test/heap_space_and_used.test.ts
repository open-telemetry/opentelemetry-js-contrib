/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { DataPointType, MeterProvider } from '@opentelemetry/sdk-metrics';
import { RuntimeNodeInstrumentation } from '../src/index';
import { TestMetricReader } from './testMetricsReader';
import {
  ATTR_V8JS_HEAP_SPACE_NAME,
  METRIC_V8JS_MEMORY_HEAP_LIMIT,
  METRIC_V8JS_MEMORY_HEAP_SPACE_SIZE,
  METRIC_V8JS_MEMORY_HEAP_USED,
  METRIC_V8JS_MEMORY_HEAP_SPACE_AVAILABLE_SIZE,
  METRIC_V8JS_MEMORY_HEAP_SPACE_PHYSICAL_SIZE,
} from '../src/semconv';

const MEASUREMENT_INTERVAL = 10;

describe('v8js.memory.heap.*', function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
  });

  const metrics: Array<{
    name: string;
    expectedDataPointType: DataPointType;
  }> = [
    {
      name: METRIC_V8JS_MEMORY_HEAP_SPACE_SIZE,
      expectedDataPointType: DataPointType.SUM,
    },
    {
      name: METRIC_V8JS_MEMORY_HEAP_USED,
      expectedDataPointType: DataPointType.GAUGE,
    },
    {
      name: METRIC_V8JS_MEMORY_HEAP_SPACE_AVAILABLE_SIZE,
      expectedDataPointType: DataPointType.GAUGE,
    },
    {
      name: METRIC_V8JS_MEMORY_HEAP_SPACE_PHYSICAL_SIZE,
      expectedDataPointType: DataPointType.GAUGE,
    },
  ];
  for (const { name: metricName, expectedDataPointType } of metrics) {
    it(`should write ${metricName} after monitoringPrecision`, async function () {
      // arrange
      const instrumentation = new RuntimeNodeInstrumentation({
        monitoringPrecision: MEASUREMENT_INTERVAL,
        captureUncaughtException: false,
      });
      instrumentation.setMeterProvider(meterProvider);

      // act
      await new Promise(resolve =>
        setTimeout(resolve, MEASUREMENT_INTERVAL * 5)
      );
      const { resourceMetrics, errors } = await metricReader.collect();

      // assert
      assert.deepEqual(
        errors,
        [],
        'expected no errors from the callback during collection'
      );
      const scopeMetrics = resourceMetrics.scopeMetrics;
      const metric = scopeMetrics[0].metrics.find(
        x => x.descriptor.name === metricName
      );

      assert.notEqual(metric, undefined, `${metricName} not found`);

      assert.strictEqual(
        metric!.dataPointType,
        expectedDataPointType,
        `expected ${DataPointType[expectedDataPointType]}`
      );

      assert.strictEqual(
        metric!.descriptor.name,
        metricName,
        'descriptor.name'
      );
    });

    // Hardcoding a minimal set of space names is fine, but v8 does not promise
    // these are stable. See https://github.com/open-telemetry/semantic-conventions/issues/2832
    for (const space of [
      'new_space',
      'old_space',
      'code_space',
      'large_object_space',
    ]) {
      it(`should write ${metricName} ${space} attribute`, async function () {
        // arrange
        const instrumentation = new RuntimeNodeInstrumentation({
          monitoringPrecision: MEASUREMENT_INTERVAL,
          captureUncaughtException: false,
        });
        instrumentation.setMeterProvider(meterProvider);
        const map = [...Array(10).keys()].map(x => x + 10);
        map.indexOf(1);
        // act
        await new Promise(resolve =>
          setTimeout(resolve, MEASUREMENT_INTERVAL * 5)
        );
        const { resourceMetrics, errors } = await metricReader.collect();

        // assert
        assert.deepEqual(
          errors,
          [],
          'expected no errors from the callback during collection'
        );
        const scopeMetrics = resourceMetrics.scopeMetrics;
        const foundMetric = scopeMetrics[0].metrics.find(
          x => x.descriptor.name === metricName
        );
        let spaceAttribute;
        if (
          foundMetric?.dataPointType === DataPointType.GAUGE ||
          foundMetric?.dataPointType === DataPointType.SUM
        ) {
          spaceAttribute = foundMetric.dataPoints.find(
            x => x.attributes[ATTR_V8JS_HEAP_SPACE_NAME] === space
          );
        }

        assert.notEqual(
          spaceAttribute,
          undefined,
          `${metricName} space "${space}" not found`
        );
      });
    }
  }

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

  it(`${METRIC_V8JS_MEMORY_HEAP_LIMIT} should have a positive value representing the heap size limit`, async function () {
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

  it(`${METRIC_V8JS_MEMORY_HEAP_LIMIT} should not have ${ATTR_V8JS_HEAP_SPACE_NAME} attribute (global metric)`, async function () {
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
          dp.attributes[ATTR_V8JS_HEAP_SPACE_NAME],
          undefined,
          `${METRIC_V8JS_MEMORY_HEAP_LIMIT} should not have ${ATTR_V8JS_HEAP_SPACE_NAME} attribute`
        );
      }
    }
  });
});
