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
import { MeterProvider } from '@opentelemetry/sdk-metrics';

import { RuntimeNodeInstrumentation } from '../src';
import * as assert from 'assert';
import { TestMetricReader } from './testMetricsReader';
import { ConventionalNamePrefix } from '../src/types/ConventionalNamePrefix';
import { ATTR_NODEJS_EVENT_LOOP_TIME } from '../src/metrics/eventLoopTimeCollector';

const MEASUREMENT_INTERVAL = 10;

describe(`${ConventionalNamePrefix.NodeJs}.${ATTR_NODEJS_EVENT_LOOP_TIME}`, function () {
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

  it(`should write ${ConventionalNamePrefix.NodeJs}.${ATTR_NODEJS_EVENT_LOOP_TIME}`, async function () {
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
    const timeMetric = scopeMetrics[0].metrics.find(
      x =>
        x.descriptor.name ===
        `${ConventionalNamePrefix.NodeJs}.${ATTR_NODEJS_EVENT_LOOP_TIME}`
    );

    assert.notEqual(timeMetric, undefined, 'metric not found');

    assert.strictEqual(
      timeMetric!.descriptor.name,
      `${ConventionalNamePrefix.NodeJs}.${ATTR_NODEJS_EVENT_LOOP_TIME}`,
      'descriptor.name'
    );

    assert.strictEqual(
      timeMetric!.descriptor.description,
      'Cumulative duration of time the event loop has been in each state.'
    );

    assert.strictEqual(
      timeMetric!.descriptor.unit,
      's',
      'expected default unit'
    );
  });
});
