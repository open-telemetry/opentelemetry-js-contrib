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

const MEASUREMENT_INTERVAL = 10;

describe('instrumentation', function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider();
    meterProvider.addMetricReader(metricReader);
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

  it('should export after being enabled', async function () {
    // arrange
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
      enabled: false,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 5));
    const firstCollections = await metricReader.collect();

    // assert
    assert.deepEqual(firstCollections.errors, []);
    const scopeMetrics = firstCollections.resourceMetrics.scopeMetrics;
    assert.strictEqual(scopeMetrics.length, 0);

    instrumentation.enable();
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 5));

    const secondCollection = await metricReader.collect();
    assert.deepEqual(
      secondCollection.errors,
      [],
      'expected no errors from the callback during collection'
    );
    const secondScopeMetrics = secondCollection.resourceMetrics.scopeMetrics;
    assert.strictEqual(
      secondScopeMetrics.length,
      1,
      'expected one scope (one meter created by instrumentation)'
    );
  });

  it('should not record result when collecting immediately with custom config', async function () {
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
    });
    instrumentation.setMeterProvider(meterProvider);

    assert.deepEqual(
      (await metricReader.collect()).resourceMetrics.scopeMetrics,
      []
    );
  });

  it('should not record result when collecting immediately with default config', async function () {
    const instrumentation = new RuntimeNodeInstrumentation();
    instrumentation.setMeterProvider(meterProvider);

    assert.deepEqual(
      (await metricReader.collect()).resourceMetrics.scopeMetrics,
      []
    );
  });
});
