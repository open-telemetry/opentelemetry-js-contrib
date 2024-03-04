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

const MEASUREMENT_INTERVAL = 10;

const metricExporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: MEASUREMENT_INTERVAL * 2,
});
const meterProvider = new MeterProvider();
meterProvider.addMetricReader(metricReader);

const instrumentation = new PerfHooksInstrumentation({
  eventLoopUtilizationMeasurementInterval: MEASUREMENT_INTERVAL,
});

instrumentation.setMeterProvider(meterProvider);

describe('nodejs.event_loop.utilization', () => {
  beforeEach(async () => {
    instrumentation.disable(); // Stops future metrics from being collected
    metricExporter.reset(); // Remove existing collected metrics
  });

  after(() => {
    instrumentation.disable();
    meterProvider.shutdown();
  });

  it('should stop exporting metrics when disabled', async () => {
    // Wait for the ELU data to be collected and exported
    // MEASUREMENT_INTERVAL * 2 is the export interval, plus MEASUREMENT_INTERVAL as a buffer
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 3));
    // Retrieve exported metrics
    const resourceMetrics = metricExporter.getMetrics();
    const scopeMetrics =
      resourceMetrics[resourceMetrics.length - 1].scopeMetrics;
    assert.strictEqual(scopeMetrics.length, 0);
  });

  it('should not export immediately after enable', async () => {
    instrumentation.enable();
    assert.deepEqual(metricExporter.getMetrics(), []);
  });

  it('can use default eventLoopUtilizationMeasurementInterval', async () => {
    // Repeat of 'should not export immediately after enable' but with defaults
    const localInstrumentation = new PerfHooksInstrumentation();
    localInstrumentation.setMeterProvider(meterProvider);
    localInstrumentation.disable();
    metricExporter.reset();
    localInstrumentation.enable();
    assert.deepEqual(metricExporter.getMetrics(), []);
    localInstrumentation.disable();
  });

  it('should export event loop utilization metrics after eventLoopUtilizationMeasurementInterval', async () => {
    instrumentation.enable();
    // Wait for the ELU data to be collected and exported
    // MEASUREMENT_INTERVAL * 2 is the export interval, plus MEASUREMENT_INTERVAL as a buffer
    await new Promise(resolve => setTimeout(resolve, MEASUREMENT_INTERVAL * 3));
    const resourceMetrics = metricExporter.getMetrics();
    const scopeMetrics =
      resourceMetrics[resourceMetrics.length - 1].scopeMetrics;
    const metrics = scopeMetrics[0].metrics;
    assert.strictEqual(metrics.length, 1, 'one ScopeMetrics');
    assert.strictEqual(metrics[0].dataPointType, DataPointType.GAUGE, 'gauge');
    assert.strictEqual(metrics[0].dataPoints.length, 1, 'one data point');
    const val = metrics[0].dataPoints[0].value;
    assert.strictEqual(val > 0, true, `val (${val}) > 0`);
    assert.strictEqual(val < 1, true, `val (${val}) < 1`);
    assert.strictEqual(
      metrics[0].descriptor.name,
      'nodejs.event_loop.utilization',
      'descriptor.name'
    );
    assert.strictEqual(
      metrics[0].descriptor.description,
      'Event loop utilization'
    );
    assert.strictEqual(metrics[0].descriptor.unit, '1');
  });
});
