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
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { RuntimeNodeInstrumentation } from '../src';
import { TestMetricReader } from './testMetricsReader';
import { METRIC_NODEJS_EVENTLOOP_UTILIZATION } from '../src/semconv';

const MEASUREMENT_INTERVAL = 10;

describe('nodejs.eventloop.utilization', function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
  });

  it('should not export before being enabled', async function () {
    // arrange
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
      enabled: false,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 5));
    const { resourceMetrics, errors } = await metricReader.collect();

    // assert
    assert.deepEqual(errors, []);
    const scopeMetrics = resourceMetrics.scopeMetrics;
    assert.strictEqual(scopeMetrics.length, 0);
  });

  it('should write nodejs.eventloop.utilization', async function () {
    // arrange
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
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
    const utilizationMetric = scopeMetrics[0].metrics.find(
      x => x.descriptor.name === METRIC_NODEJS_EVENTLOOP_UTILIZATION
    );

    assert.notEqual(utilizationMetric, undefined, 'metric not found');

    assert.strictEqual(
      utilizationMetric!.descriptor.name,
      METRIC_NODEJS_EVENTLOOP_UTILIZATION,
      'descriptor.name'
    );

    assert.strictEqual(
      utilizationMetric!.descriptor.description,
      'Event loop utilization'
    );

    assert.strictEqual(
      utilizationMetric!.descriptor.unit,
      '1',
      'expected default unit'
    );

    assert.strictEqual(
      utilizationMetric!.dataPoints.length,
      1,
      'expected one data point'
    );
  });

  it('should correctly calculate utilization deltas across multiple measurements', async function () {
    // This test ensures the bug where delta of deltas was observed instead of deltas of absolute values
    // does not regress. See https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3118
    // This bug would surface on the third callback invocation.

    const instrumentation = new RuntimeNodeInstrumentation({});
    instrumentation.setMeterProvider(meterProvider);

    // Helper function to create blocking work that results in high utilization
    const createBlockingWork = (durationMs: number) => {
      const start = Date.now();
      while (Date.now() - start < durationMs) {
        // Busy wait to block the event loop
      }
    };

    // Helper function to collect metrics and extract utilization value
    const collectUtilization = async (): Promise<number> => {
      const { resourceMetrics } = await metricReader.collect();
      const scopeMetrics = resourceMetrics.scopeMetrics;
      const utilizationMetric = scopeMetrics[0].metrics.find(
      x => x.descriptor.name === METRIC_NODEJS_EVENTLOOP_UTILIZATION
    );

      assert.notEqual(utilizationMetric, undefined, 'metric not found');
      assert.strictEqual(
        utilizationMetric!.dataPoints.length,
        1,
        'expected one data point'
      );

      return utilizationMetric!.dataPoints[0].value as number;
    };

    // Wait for some time to establish baseline utilization
    await new Promise(resolve => setTimeout(resolve, 200));

    // First collection
    const firstUtilization = await collectUtilization();
    assert.notStrictEqual(
      firstUtilization,
      1,
      'Expected utilization in first measurement to be not 1'
    );

    // Second measurement: Create blocking work and measure
    createBlockingWork(50);
    const secondUtilization = await collectUtilization();
    assert.strictEqual(
      secondUtilization,
      1,
      'Expected utilization in second measurement to be 1'
    );

    // Third measurement: Create blocking work again and measure
    // This is where the bug would manifest - if we were observing delta of deltas,
    // this measurement would not be 1
    createBlockingWork(50);
    const thirdUtilization = await collectUtilization();
    assert.strictEqual(
      thirdUtilization,
      1,
      'Expected utilization in third measurement to be 1'
    );

    // Fourth measurement (should be the same as the third measurement, just a sanity check)
    createBlockingWork(50);
    const fourthUtilization = await collectUtilization();
    assert.strictEqual(
      fourthUtilization,
      1,
      'Expected utilization in fourth measurement to be 1'
    );

    // Fifth measurement: Do some NON-blocking work (sanity check, should be low)
    await new Promise(resolve => setTimeout(resolve, 50));
    const fifthUtilization = await collectUtilization();
    assert.ok(
      fifthUtilization < 1,
      `Expected utilization in fifth measurement to be less than 1, but got ${fifthUtilization}`
    );
  });
});
