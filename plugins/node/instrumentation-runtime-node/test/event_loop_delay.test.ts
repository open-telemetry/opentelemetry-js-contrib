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
import { MeterProvider, DataPointType } from '@opentelemetry/sdk-metrics';

import { RuntimeNodeInstrumentation } from '../src';
import * as assert from 'assert';
import { TestMetricReader } from './testMetricsReader';
import { metricNames } from '../src/metrics/eventLoopDelayCollector';
import { ConventionalNamePrefix } from '../src/types/ConventionalNamePrefix';


describe(`${ConventionalNamePrefix.NodeJs}.eventloop`, function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider();
    meterProvider.addMetricReader(metricReader);
  });

  for (const metricName in metricNames) {
    it(`should write ${ConventionalNamePrefix.NodeJs}.${metricName} after monitoringPrecision`, async function () {
      // arrange
      const instrumentation = new RuntimeNodeInstrumentation({
        monitoringPrecision: 10,
      });
      instrumentation.setMeterProvider(meterProvider);

      // act
      await new Promise(resolve =>
        setTimeout(resolve, 100)
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
        x =>
          x.descriptor.name === `${ConventionalNamePrefix.NodeJs}.${metricName}`
      );

      assert.notEqual(
        metric,
        undefined,
        `${ConventionalNamePrefix.NodeJs}.${metricName} not found`
      );

      assert.strictEqual(
        metric!.dataPointType,
        DataPointType.GAUGE,
        'expected gauge'
      );

      assert.strictEqual(
        metric!.descriptor.name,
        `${ConventionalNamePrefix.NodeJs}.${metricName}`,
        'descriptor.name'
      );
    });
  }
});
