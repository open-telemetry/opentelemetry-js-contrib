/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { DataPointType, MeterProvider } from '@opentelemetry/sdk-metrics';
import { GaugeMetricData } from '@opentelemetry/sdk-metrics/build/src/export/MetricData';
import { RuntimeNodeInstrumentation } from '../src';
import { TestMetricReader } from './testMetricsReader';
import {
  ATTR_V8JS_RESOURCE_TYPE,
  METRIC_V8JS_RESOURCE_ACTIVE,
} from '../src/semconv';

import * as net from 'node:net';

const MEASUREMENT_INTERVAL = 10;

describe('v8js.resource.active', function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
  });

  it(`should write ${METRIC_V8JS_RESOURCE_ACTIVE} after monitoringPrecision`, async function () {
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
    const metric = scopeMetrics[0].metrics.find(
      x => x.descriptor.name === METRIC_V8JS_RESOURCE_ACTIVE
    );

    assert.notEqual(
      metric,
      undefined,
      `${METRIC_V8JS_RESOURCE_ACTIVE} not found`
    );

    assert.strictEqual(
      metric!.dataPointType,
      DataPointType.GAUGE,
      'expected gauge'
    );

    assert.strictEqual(
      metric!.descriptor.name,
      METRIC_V8JS_RESOURCE_ACTIVE,
      'descriptor.name'
    );
  });

  it(`should write ${METRIC_V8JS_RESOURCE_ACTIVE} ${ATTR_V8JS_RESOURCE_TYPE} attribute`, async function () {
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
    });
    instrumentation.setMeterProvider(meterProvider);

    // We need a Timout to really exist for this test.
    const keepAlive = setTimeout(() => {}, 60_000);
    try {
      await new Promise(resolve =>
        setTimeout(resolve, MEASUREMENT_INTERVAL * 5)
      );
      const { resourceMetrics, errors } = await metricReader.collect();

      assert.deepEqual(
        errors,
        [],
        'expected no errors from the callback during collection'
      );
      const scopeMetrics = resourceMetrics.scopeMetrics;
      let metric: GaugeMetricData | undefined = undefined;
      const foundMetric = scopeMetrics[0].metrics.find(
        x => x.descriptor.name === METRIC_V8JS_RESOURCE_ACTIVE
      );
      if (foundMetric?.dataPointType === DataPointType.GAUGE) {
        metric = foundMetric;
      }
      const typeAttribute = metric?.dataPoints.find(
        x => x.attributes[ATTR_V8JS_RESOURCE_TYPE] === 'Timeout'
      );

      assert.notEqual(
        typeAttribute,
        undefined,
        `${METRIC_V8JS_RESOURCE_ACTIVE} space "${ATTR_V8JS_RESOURCE_TYPE}" not found`
      );

      assert.ok(typeAttribute!.value >= 1);
    } finally {
      clearTimeout(keepAlive);
    }
  });

  it(`should write set ${ATTR_V8JS_RESOURCE_TYPE} attribute to zero`, async function () {
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
    });
    instrumentation.setMeterProvider(meterProvider);

    const server = net.createServer((socket: net.Socket) => {
      socket.on('error', () => {});
    });

    server.listen(4000, '127.0.0.1', () => {});

    await new Promise(resolve => setTimeout(resolve, 100));

    await metricReader.collect();

    server.close();

    await new Promise(resolve => setTimeout(resolve, 100));

    const { resourceMetrics, errors } = await metricReader.collect();

    assert.deepEqual(
      errors,
      [],
      'expected no errors from the callback during collection'
    );
    const scopeMetrics = resourceMetrics.scopeMetrics;

    let metric: GaugeMetricData | undefined = undefined;

    const foundMetric = scopeMetrics[0].metrics.find(
      x => x.descriptor.name === METRIC_V8JS_RESOURCE_ACTIVE
    );

    if (foundMetric?.dataPointType === DataPointType.GAUGE) {
      metric = foundMetric;
    }
    const typeAttribute = metric?.dataPoints.find(
      x => x.attributes[ATTR_V8JS_RESOURCE_TYPE] === 'TCPServerWrap'
    );

    assert.notEqual(
      typeAttribute,
      undefined,
      `${METRIC_V8JS_RESOURCE_ACTIVE} space "${ATTR_V8JS_RESOURCE_TYPE}" not found`
    );
    assert.ok(typeAttribute!.value === 0);
  });
});
