/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { MeterProvider } from '@opentelemetry/sdk-metrics';

import { RuntimeNodeInstrumentation } from '../src/index';
import * as assert from 'assert';
import { TestMetricReader } from './testMetricsReader';

const MEASUREMENT_INTERVAL = 10;

describe('instrumentation', function () {
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
      captureUncaughtException: false,
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
      captureUncaughtException: false,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 5));
    const firstCollections = await metricReader.collect();

    // assert
    assert.deepEqual(firstCollections.errors, []);
    const scopeMetrics = firstCollections.resourceMetrics.scopeMetrics;
    assert.strictEqual(scopeMetrics.length, 0);

    assert.equal(instrumentation.isEnabled(), false);
    instrumentation.enable();
    assert.equal(instrumentation.isEnabled(), true);
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
});
