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
import { metricNames } from '../src/metrics/heapSpacesSizeAndUsedCollector';
import { ConventionalNamePrefix } from '../src/types/ConventionalNamePrefix';
import { V8_HEAP_SIZE_NAME_ATTRIBUTE } from '../src/consts/attributes';

const MEASUREMENT_INTERVAL = 10;

describe('nodejs.heap_space', function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider();
    meterProvider.addMetricReader(metricReader);
  });

  for (const metricName in metricNames) {
    it(`should write ${ConventionalNamePrefix.V8js}.${metricName} after monitoringPrecision`, async function () {
      // arrange
      const instrumentation = new RuntimeNodeInstrumentation({
        monitoringPrecision: MEASUREMENT_INTERVAL,
      });
      instrumentation.setMeterProvider(meterProvider);

      // act
      await new Promise(resolve =>
        setTimeout(resolve, MEASUREMENT_INTERVAL * 5)
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
          x.descriptor.name ===
          `${ConventionalNamePrefix.V8js}.${metricName}`
      );

      assert.notEqual(
        metric,
        undefined,
        `${ConventionalNamePrefix.V8js}.${metricName} not found`
      );

      assert.strictEqual(
        metric!.dataPointType,
        DataPointType.GAUGE,
        'expected gauge'
      );

      assert.strictEqual(
        metric!.descriptor.name,
        `${ConventionalNamePrefix.V8js}.${metricName}`,
        'descriptor.name'
      );
    });

    for (const space of [
      'new_space',
      'old_space',
      'code_space',
      'large_object_space',
    ]) {
      it(`should write ${ConventionalNamePrefix.V8js}.${metricName} ${space} attribute`, async function () {
        // arrange
        const instrumentation = new RuntimeNodeInstrumentation({
          monitoringPrecision: MEASUREMENT_INTERVAL,
        });
        instrumentation.setMeterProvider(meterProvider);
        const map = [...Array(10).keys()].map(x => x + 10);
        map.indexOf(1);
        // act
        await new Promise(resolve =>
          setTimeout(resolve, MEASUREMENT_INTERVAL * 5)
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
            x.descriptor.name ===
            `${ConventionalNamePrefix.V8js}.${metricName}`
        );
        const spaceAttribute = metric!.dataPoints.find(
          x =>
            x.attributes[
              `${ConventionalNamePrefix.V8js}.${V8_HEAP_SIZE_NAME_ATTRIBUTE}`
            ] === space
        );

        assert.notEqual(
          spaceAttribute,
          undefined,
          `${ConventionalNamePrefix.V8js}.${metricName} space: ${space} not found`
        );
      });
    }
  }
});
