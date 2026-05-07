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
import { MeterProvider, DataPointType } from '@opentelemetry/sdk-metrics';
import { RuntimeNodeInstrumentation } from '../src';
import { TestMetricReader } from './testMetricsReader';
import { METRIC_V8JS_GC_DURATION } from '../src/semconv';

const MEASUREMENT_INTERVAL = 10;

// Helper to trigger GC by allocating memory
function triggerGC() {
  const arrays = [];
  for (let i = 0; i < 100; i++) {
    arrays.push(new Array(10000).fill(i));
  }
  // Allow garbage collection by clearing references
  arrays.length = 0;
  if (global.gc) {
    global.gc();
  }
}

describe('v8js.gc.duration', function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;
  let instrumentation: RuntimeNodeInstrumentation;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
  });

  afterEach(() => {
    instrumentation.disable();
  });

  it('should create histogram with default gcDurationBuckets', async function () {
    // arrange
    instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act - trigger GC
    triggerGC();
    await new Promise(resolve =>
      setTimeout(resolve, MEASUREMENT_INTERVAL * 10)
    );
    triggerGC();
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 5));

    const { resourceMetrics, errors } = await metricReader.collect();

    // assert
    assert.deepEqual(
      errors,
      [],
      'expected no errors from the callback during collection'
    );
    const scopeMetrics = resourceMetrics.scopeMetrics;
    const metric = scopeMetrics[0]?.metrics.find(
      x => x.descriptor.name === METRIC_V8JS_GC_DURATION
    );

    assert.notEqual(metric, undefined, `${METRIC_V8JS_GC_DURATION} not found`);
    assert.strictEqual(
      metric!.dataPointType,
      DataPointType.HISTOGRAM,
      'expected histogram'
    );
    assert.strictEqual(
      metric!.descriptor.unit,
      's',
      'expected unit to be seconds'
    );
  });

  it('should allow custom gcDurationBuckets configuration', async function () {
    // arrange
    const customBuckets = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1];
    instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
      gcDurationBuckets: customBuckets,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act - trigger GC
    triggerGC();
    await new Promise(resolve =>
      setTimeout(resolve, MEASUREMENT_INTERVAL * 10)
    );
    triggerGC();
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 5));

    const { resourceMetrics, errors } = await metricReader.collect();

    // assert
    assert.deepEqual(
      errors,
      [],
      'expected no errors from the callback during collection'
    );
    const scopeMetrics = resourceMetrics.scopeMetrics;
    const metric = scopeMetrics[0]?.metrics.find(
      x => x.descriptor.name === METRIC_V8JS_GC_DURATION
    );

    assert.notEqual(metric, undefined, `${METRIC_V8JS_GC_DURATION} not found`);
    assert.strictEqual(
      metric!.dataPointType,
      DataPointType.HISTOGRAM,
      'expected histogram'
    );
  });
});
