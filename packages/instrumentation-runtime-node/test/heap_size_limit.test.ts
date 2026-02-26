/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import { DataPointType, MeterProvider } from '@opentelemetry/sdk-metrics';
import { RuntimeNodeInstrumentation } from '../src';
import { TestMetricReader } from './testMetricsReader';
import { METRIC_V8JS_MEMORY_HEAP_MAX } from '../src/semconv';

const MEASUREMENT_INTERVAL = 10;

describe('v8js.memory.heap.max', function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
  });

  it(`should write ${METRIC_V8JS_MEMORY_HEAP_MAX} after monitoringPrecision`, async function () {
    // arrange
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
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
      x => x.descriptor.name === METRIC_V8JS_MEMORY_HEAP_MAX
    );

    assert.notEqual(metric, undefined, `${METRIC_V8JS_MEMORY_HEAP_MAX} not found`);

    assert.strictEqual(
      metric!.dataPointType,
      DataPointType.GAUGE,
      'expected gauge'
    );

    assert.strictEqual(
      metric!.descriptor.name,
      METRIC_V8JS_MEMORY_HEAP_MAX,
      'descriptor.name'
    );
  });

  it('should have a positive value representing the heap size limit', async function () {
    // arrange
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act
    await new Promise(resolve =>
      setTimeout(resolve, MEASUREMENT_INTERVAL * 5)
    );
    const { resourceMetrics, errors } = await metricReader.collect();

    // assert
    assert.deepEqual(errors, []);
    const scopeMetrics = resourceMetrics.scopeMetrics;
    const metric = scopeMetrics[0].metrics.find(
      x => x.descriptor.name === METRIC_V8JS_MEMORY_HEAP_MAX
    );

    assert.notEqual(metric, undefined, `${METRIC_V8JS_MEMORY_HEAP_MAX} not found`);

    if (metric!.dataPointType === DataPointType.GAUGE) {
      assert.strictEqual(metric!.dataPoints.length, 1, 'expected exactly one data point (global, not per-space)');
      const value = metric!.dataPoints[0].value as number;
      assert.ok(value > 0, `expected positive heap_size_limit, got ${value}`);
    }
  });

  it('should not have v8js.heap.space.name attribute (global metric)', async function () {
    // arrange
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act
    await new Promise(resolve =>
      setTimeout(resolve, MEASUREMENT_INTERVAL * 5)
    );
    const { resourceMetrics, errors } = await metricReader.collect();

    // assert
    assert.deepEqual(errors, []);
    const scopeMetrics = resourceMetrics.scopeMetrics;
    const metric = scopeMetrics[0].metrics.find(
      x => x.descriptor.name === METRIC_V8JS_MEMORY_HEAP_MAX
    );

    assert.notEqual(metric, undefined);

    if (metric!.dataPointType === DataPointType.GAUGE) {
      for (const dp of metric!.dataPoints) {
        assert.strictEqual(
          dp.attributes['v8js.heap.space.name'],
          undefined,
          'v8js.memory.heap.max should not have v8js.heap.space.name attribute'
        );
      }
    }
  });
});
