/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { MeterProvider, DataPointType } from '@opentelemetry/sdk-metrics';
import { RuntimeNodeInstrumentation } from '../src';
import { TestMetricReader } from './testMetricsReader';
import * as semconv from '../src/semconv';

describe('nodejs.eventloop.delay.*', function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
  });

  const metricNames = Object.keys(semconv)
    .filter(k => k.startsWith('METRIC_NODEJS_EVENTLOOP_DELAY_'))
    .map(k => (semconv as any)[k]);
  for (const metricName of metricNames) {
    it(`should write ${metricName} after monitoringPrecision`, async function () {
      // arrange
      const instrumentation = new RuntimeNodeInstrumentation({
        monitoringPrecision: 10,
      });
      instrumentation.setMeterProvider(meterProvider);

      // act
      await new Promise(resolve => setTimeout(resolve, 1000));
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
        DataPointType.GAUGE,
        'expected gauge'
      );

      assert.strictEqual(
        metric!.descriptor.name,
        metricName,
        'descriptor.name'
      );
    });
  }
});
