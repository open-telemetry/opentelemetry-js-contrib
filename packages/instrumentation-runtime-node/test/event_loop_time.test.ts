/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { RuntimeNodeInstrumentation } from '../src';
import { TestMetricReader } from './testMetricsReader';
import { METRIC_NODEJS_EVENTLOOP_TIME } from '../src/semconv';

const MEASUREMENT_INTERVAL = 10;

describe('nodejs.eventloop.time', function () {
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

  it("should write 'nodejs.eventloop.time'", async function () {
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
      x => x.descriptor.name === METRIC_NODEJS_EVENTLOOP_TIME
    );

    assert.notEqual(timeMetric, undefined, 'metric not found');

    assert.strictEqual(
      timeMetric!.descriptor.name,
      METRIC_NODEJS_EVENTLOOP_TIME,
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
