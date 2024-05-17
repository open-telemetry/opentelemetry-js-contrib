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
import { ConventionalNamePrefix } from '../src/types/ConventionalNamePrefix';
import {
  NODE_JS_VERSION_ATTRIBUTE,
  V8_HEAP_SIZE,
  V8_HEAP_SIZE_STATE_ATTRIBUTE,
} from '../src/consts/attributes';
import { HeapSizes } from '../src/types/heapSizes';

const MEASUREMENT_INTERVAL = 10;

describe(`${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE}`, function () {
  let metricReader: TestMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider();
    meterProvider.addMetricReader(metricReader);
  });

  it(`should write ${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE} after monitoringPrecision`, async function () {
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
      x =>
        x.descriptor.name ===
        `${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE}`
    );

    assert.notEqual(
      metric,
      undefined,
      `${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE} not found`
    );

    assert.strictEqual(
      metric!.dataPointType,
      DataPointType.GAUGE,
      'expected gauge'
    );

    assert.strictEqual(
      metric!.descriptor.name,
      `${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE}`,
      'descriptor.name'
    );
  });

  it(`should write ${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE} version attribute`, async function () {
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
      x =>
        x.descriptor.name ===
        `${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE}`
    );

    assert.strictEqual(
      metric!.dataPoints[0].attributes[NODE_JS_VERSION_ATTRIBUTE],
      process.version,
      `version attribute ${NODE_JS_VERSION_ATTRIBUTE} not found`
    );
  });

  it(`should write ${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE} ${HeapSizes.Total}  attribute`, async function () {
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
      x =>
        x.descriptor.name ===
        `${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE}`
    );

    assert.strictEqual(
      metric!.dataPoints[0].attributes[
        `${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE_STATE_ATTRIBUTE}`
      ],
      HeapSizes.Total,
      `${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE_STATE_ATTRIBUTE} attribute ${NODE_JS_VERSION_ATTRIBUTE} not found`
    );
  });

  it(`should write ${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE} ${HeapSizes.Used} attribute`, async function () {
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
      x =>
        x.descriptor.name ===
        `${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE}`
    );

    assert.strictEqual(
      metric!.dataPoints[1].attributes[
        `${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE_STATE_ATTRIBUTE}`
      ],
      HeapSizes.Used,
      `${ConventionalNamePrefix.V8EnjineRuntime}.${V8_HEAP_SIZE_STATE_ATTRIBUTE} attribute not found`
    );
  });
});
