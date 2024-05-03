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
import {MeterProvider, DataPointType} from '@opentelemetry/sdk-metrics';

import {RuntimeNodeInstrumentation} from '../src';
import * as assert from 'assert';
import {TestMetricReader} from './testMetricsReader';
import {NODEJS_EVENTLOOP_LAG_ATTRIBUTE_TYPE} from "../src/metrics/eventLoopLagCollector";

const MEASUREMENT_INTERVAL = 10;
const attributesToCheck = ['min', 'max', 'mean', 'stddev', 'p50', 'p90', 'p99']

describe('jsruntime.eventloop.lag', function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider();
    meterProvider.addMetricReader(metricReader);
  });

  it(`should write jsruntime.eventloop.lag after monitoringPrecision`, async function () {
    // arrange
    const instrumentation = new RuntimeNodeInstrumentation({
      monitoringPrecision: MEASUREMENT_INTERVAL,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act
    await new Promise(resolve =>
      setTimeout(resolve, MEASUREMENT_INTERVAL * 5)
    );
    const {resourceMetrics, errors} = await metricReader.collect();

    // assert
    assert.deepEqual(
      errors,
      [],
      'expected no errors from the callback during collection'
    );
    const scopeMetrics = resourceMetrics.scopeMetrics;
    const metric = scopeMetrics[0].metrics.find(
      x => x.descriptor.name === 'jsruntime.eventloop.lag'
    );

    assert.notEqual(metric, undefined, `jsruntime.eventloop.lag not found`);

    assert.strictEqual(
      metric!.dataPointType,
      DataPointType.GAUGE,
      'expected gauge'
    );

    assert.strictEqual(
      metric!.descriptor.name,
      'jsruntime.eventloop.lag',
      'descriptor.name'
    );
  });
  for (const attribute of attributesToCheck) {
    it(`should write jsruntime.eventloop.lag ${attribute} attribute`, async function () {
      // arrange
      const instrumentation = new RuntimeNodeInstrumentation({
        monitoringPrecision: MEASUREMENT_INTERVAL,
      });
      instrumentation.setMeterProvider(meterProvider);

      // act
      await new Promise(resolve =>
        setTimeout(resolve, MEASUREMENT_INTERVAL * 5)
      );
      const {resourceMetrics, errors} = await metricReader.collect();

      // assert
      assert.deepEqual(
        errors,
        [],
        'expected no errors from the callback during collection'
      );
      const scopeMetrics = resourceMetrics.scopeMetrics;
      const metric = scopeMetrics[0].metrics.find(
        x => x.descriptor.name === 'jsruntime.eventloop.lag'
      );

      const metricAttribute = metric!.dataPoints.find(point => point.attributes[`jsruntime.${NODEJS_EVENTLOOP_LAG_ATTRIBUTE_TYPE}`] === attribute)
      assert.notEqual(metricAttribute, undefined, `jsruntime.${NODEJS_EVENTLOOP_LAG_ATTRIBUTE_TYPE} with ${attribute} attribute not found`);
    });
  }

});
