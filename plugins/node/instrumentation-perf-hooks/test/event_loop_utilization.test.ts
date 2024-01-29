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
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  DataPointType,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';

import { PerfHooksInstrumentation } from '../src';
import * as assert from 'assert';

const EXPORT_INTERVAL = 20;

const metricExporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: EXPORT_INTERVAL,
});
const meterProvider = new MeterProvider();
meterProvider.addMetricReader(metricReader);

const instrumentation = new PerfHooksInstrumentation({
  eventLoopUtilizationMeasurementInterval: EXPORT_INTERVAL / 2,
});

instrumentation.setMeterProvider(meterProvider);

describe('nodejs.event_loop.utilization', () => {
  before(async () => {
    instrumentation.enable();
  });

  after(() => {
    instrumentation.disable();
    meterProvider.shutdown();
  });

  afterEach(() => {
    metricExporter.reset();
  });

  it('should not export immediately after enable', async () => {
    // default interval is 5000, which is much higher than EXPORT_INTERVAL
    const instrumentation = new PerfHooksInstrumentation();
    instrumentation.setMeterProvider(meterProvider);
    instrumentation.disable();
    instrumentation.enable();
    await new Promise(resolve => setTimeout(resolve, EXPORT_INTERVAL / 2));
    assert.deepEqual(metricExporter.getMetrics(), []);
    instrumentation.disable();
  });

  it('should export event loop utilization metrics after eventLoopUtilizationMeasurementInterval', async () => {
    // Wait for the ELU data to be collected and exported
    await new Promise(resolve => setTimeout(resolve, EXPORT_INTERVAL));
    const resourceMetrics = metricExporter.getMetrics();
    const scopeMetrics = resourceMetrics[0].scopeMetrics;
    const metrics = scopeMetrics[0].metrics;
    assert.strictEqual(metrics.length, 1);
    assert.strictEqual(metrics[0].dataPointType, DataPointType.GAUGE);
    assert.strictEqual(metrics[0].dataPoints.length, 1);
    assert.strictEqual(metrics[0].dataPoints[0].value > 0, true);
    assert.strictEqual(metrics[0].dataPoints[0].value < 1, true);
    assert.strictEqual(
      metrics[0].descriptor.name,
      'nodejs.event_loop.utilization'
    );
    assert.strictEqual(
      metrics[0].descriptor.description,
      'Event loop utilization'
    );
    assert.strictEqual(metrics[0].descriptor.unit, '1');
  });

  it('should stop exporting metrics when disabled', async () => {
    instrumentation.disable();
    await new Promise(resolve => setTimeout(resolve, EXPORT_INTERVAL));
    const resourceMetrics = metricExporter.getMetrics();
    const scopeMetrics = resourceMetrics[0].scopeMetrics;
    assert.strictEqual(scopeMetrics.length, 0);
  });
});
