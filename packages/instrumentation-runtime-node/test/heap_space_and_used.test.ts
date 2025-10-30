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
import { DataPointType, MeterProvider } from '@opentelemetry/sdk-metrics';
import { GaugeMetricData } from '@opentelemetry/sdk-metrics/build/src/export/MetricData';
import { RuntimeNodeInstrumentation } from '../src';
import { TestMetricReader } from './testMetricsReader';
import {
  ATTR_V8JS_HEAP_SPACE_NAME,
  METRIC_V8JS_MEMORY_HEAP_LIMIT,
  METRIC_V8JS_MEMORY_HEAP_USED,
} from '../src/semconv';

const MEASUREMENT_INTERVAL = 10;

describe('v8js.memory.heap.*', function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
  });

  const metricNames = [
    METRIC_V8JS_MEMORY_HEAP_LIMIT,
    METRIC_V8JS_MEMORY_HEAP_USED,
    // TODO: fix to use METRIC_V8JS_HEAP_SPACE_AVAILABLE_SIZE (breaking change)
    'v8js.memory.heap.space.available_size',
    // TODO: fix to use METRIC_V8JS_HEAP_SPACE_PHYSICAL_SIZE (breaking change)
    'v8js.memory.heap.space.physical_size',
  ];
  for (const metricName of metricNames) {
    it(`should write ${metricName} after monitoringPrecision`, async function () {
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

    // Hardcoding a minimal set of space names is fine, but v8 does not promise
    // these are stable. See https://github.com/open-telemetry/semantic-conventions/issues/2832
    for (const space of [
      'new_space',
      'old_space',
      'code_space',
      'large_object_space',
    ]) {
      it(`should write ${metricName} ${space} attribute`, async function () {
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
        let metric: GaugeMetricData | undefined = undefined;
        const foundMetric = scopeMetrics[0].metrics.find(
          x => x.descriptor.name === metricName
        );
        if (foundMetric?.dataPointType === DataPointType.GAUGE) {
          metric = foundMetric;
        }
        const spaceAttribute = metric?.dataPoints.find(
          x => x.attributes[ATTR_V8JS_HEAP_SPACE_NAME] === space
        );

        assert.notEqual(
          spaceAttribute,
          undefined,
          `${metricName} space "${space}" not found`
        );
      });
    }
  }
});
