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
import {
  MeterProvider,
  DataPointType,
  MetricReader,
} from '@opentelemetry/sdk-metrics';

import { RuntimeNodeInstrumentation } from '../src';
import { deepEqual, strictEqual } from 'assert';

const MEASUREMENT_INTERVAL = 10;

class TestMetricReader extends MetricReader {
  constructor() {
    super();
  }

  protected async onForceFlush(): Promise<void> {}

  protected async onShutdown(): Promise<void> {}
}

describe('nodejs.event_loop.utilization', function () {
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
      eventLoopUtilizationMeasurementInterval: MEASUREMENT_INTERVAL,
      enabled: false,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 5));
    const { resourceMetrics, errors } = await metricReader.collect();

    // assert
    deepEqual(errors, []);
    const scopeMetrics = resourceMetrics.scopeMetrics;
    strictEqual(scopeMetrics.length, 0);
  });

  it('should not record result when collecting immediately with custom config', async function () {
    const instrumentation = new RuntimeNodeInstrumentation({
      eventLoopUtilizationMeasurementInterval: MEASUREMENT_INTERVAL,
    });
    instrumentation.setMeterProvider(meterProvider);

    deepEqual((await metricReader.collect()).resourceMetrics.scopeMetrics, []);
  });

  it('should not record result when collecting immediately with default config', async function () {
    const instrumentation = new RuntimeNodeInstrumentation();
    instrumentation.setMeterProvider(meterProvider);

    deepEqual((await metricReader.collect()).resourceMetrics.scopeMetrics, []);
  });

  it('should write event loop utilization metrics after eventLoopUtilizationMeasurementInterval', async function () {
    // arrange
    const instrumentation = new RuntimeNodeInstrumentation({
      eventLoopUtilizationMeasurementInterval: MEASUREMENT_INTERVAL,
    });
    instrumentation.setMeterProvider(meterProvider);

    // act
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 5));
    const { resourceMetrics, errors } = await metricReader.collect();

    // assert
    deepEqual(
      errors,
      [],
      'expected no errors from the callback during collection'
    );
    const scopeMetrics = resourceMetrics.scopeMetrics;
    strictEqual(
      scopeMetrics.length,
      1,
      'expected one scope (one meter created by instrumentation)'
    );
    const metrics = scopeMetrics[0].metrics;
    strictEqual(
      metrics.length,
      1,
      'expected one metric (one metric created by instrumentation)'
    );
    strictEqual(
      metrics[0].dataPointType,
      DataPointType.GAUGE,
      'expected gauge'
    );
    strictEqual(
      metrics[0].descriptor.name,
      'nodejs.event_loop.utilization',
      'descriptor.name'
    );
    strictEqual(metrics[0].descriptor.description, 'Event loop utilization');
    strictEqual(metrics[0].descriptor.unit, '1', 'expected default unit');
    strictEqual(metrics[0].dataPoints.length, 1, 'expected one data point');
    const val = metrics[0].dataPoints[0].value;
    strictEqual(val > 0, true, `val (${val}) > 0`);
    strictEqual(val <= 1, true, `val (${val}) <= 1`);
  });
});
