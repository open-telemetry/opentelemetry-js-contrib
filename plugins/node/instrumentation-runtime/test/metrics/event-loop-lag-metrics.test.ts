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
} from '@opentelemetry/sdk-metrics';
import { RuntimeInstrumentation } from '../../src/instrumentation';
import * as assert from 'assert';
import { TestMetricReader } from '../utils/TestMetricReader';

const instrumentation = new RuntimeInstrumentation({
  monitorEventLoopDelayResolution: 100,
  customMetricAttributes: () => ({
    foo: 'bar',
  }),
});

const meterProvider = new MeterProvider();
const metricsMemoryExporter = new InMemoryMetricExporter(
  AggregationTemporality.DELTA
);
const metricReader = new TestMetricReader(metricsMemoryExporter);

meterProvider.addMetricReader(metricReader);
instrumentation.setMeterProvider(meterProvider);

describe('metrics', () => {
  beforeEach(() => {
    metricsMemoryExporter.reset();
  });

  before(() => {
    instrumentation.enable();
  });

  after(() => {
    instrumentation.disable();
  });

  it('should add required metrics', async () => {
    const requestCount = 3;
    for (let i = 0; i < requestCount; i++) {
      await new Promise<void>(resolve =>
        setTimeout(() => resolve(), (i + 1) * 3)
      );
    }

    await metricReader.collectAndExport();

    const resourceMetrics = metricsMemoryExporter.getMetrics();
    const scopeMetrics = resourceMetrics[0].scopeMetrics;
    assert.strictEqual(scopeMetrics.length, 1, 'scopeMetrics count');
    const metrics = scopeMetrics[0].metrics;
    assert.strictEqual(metrics.length, 11, 'metrics count');
    const eventLoopDelay = metrics[0];
    assert.strictEqual(eventLoopDelay.dataPointType, DataPointType.GAUGE);
    assert.strictEqual(
      eventLoopDelay.descriptor.description,
      'Delay of event loop.'
    );
    assert.strictEqual(eventLoopDelay.descriptor.name, 'node.event_loop_delay');
    assert.strictEqual(eventLoopDelay.descriptor.unit, 'ms');
    assert.strictEqual(eventLoopDelay.dataPoints.length, 1);
    assert.deepStrictEqual(eventLoopDelay.dataPoints[0].attributes, {
      foo: 'bar',
    });

    const eventLoopDelayMin = metrics[1];
    assert.strictEqual(eventLoopDelayMin.dataPointType, DataPointType.GAUGE);
    assert.strictEqual(
      eventLoopDelayMin.descriptor.description,
      'The minimum recorded event loop delay.'
    );
    assert.strictEqual(
      eventLoopDelayMin.descriptor.name,
      'node.event_loop_delay.min'
    );
    assert.strictEqual(eventLoopDelayMin.descriptor.unit, 'ms');
    assert.strictEqual(eventLoopDelayMin.dataPoints.length, 1);
    assert.deepStrictEqual(eventLoopDelayMin.dataPoints[0].attributes, {
      foo: 'bar',
    });

    const eventLoopDelayMax = metrics[2];
    assert.strictEqual(eventLoopDelayMax.dataPointType, DataPointType.GAUGE);
    assert.strictEqual(
      eventLoopDelayMax.descriptor.description,
      'The maximum recorded event loop delay.'
    );
    assert.strictEqual(
      eventLoopDelayMax.descriptor.name,
      'node.event_loop_delay.max'
    );
    assert.strictEqual(eventLoopDelayMax.descriptor.unit, 'ms');
    assert.strictEqual(eventLoopDelayMax.dataPoints.length, 1);
    assert.deepStrictEqual(eventLoopDelayMax.dataPoints[0].attributes, {
      foo: 'bar',
    });

    const eventLoopDelayMean = metrics[3];
    assert.strictEqual(eventLoopDelayMean.dataPointType, DataPointType.GAUGE);
    assert.strictEqual(
      eventLoopDelayMean.descriptor.description,
      'The mean of the recorded event loop delays.'
    );
    assert.strictEqual(
      eventLoopDelayMean.descriptor.name,
      'node.event_loop_delay.mean'
    );
    assert.strictEqual(eventLoopDelayMean.descriptor.unit, 'ms');
    assert.strictEqual(eventLoopDelayMean.dataPoints.length, 1);

    const eventLoopDelayStddev = metrics[4];
    assert.strictEqual(eventLoopDelayStddev.dataPointType, DataPointType.GAUGE);
    assert.strictEqual(
      eventLoopDelayStddev.descriptor.description,
      'The standard deviation of the recorded event loop delays.'
    );
    assert.strictEqual(
      eventLoopDelayStddev.descriptor.name,
      'node.event_loop_delay.stddev'
    );
    assert.strictEqual(eventLoopDelayStddev.descriptor.unit, 'ms');
    assert.strictEqual(eventLoopDelayStddev.dataPoints.length, 1);
    assert.deepStrictEqual(eventLoopDelayStddev.dataPoints[0].attributes, {
      foo: 'bar',
    });

    const eventLoopDelayP50 = metrics[5];
    assert.strictEqual(eventLoopDelayP50.dataPointType, DataPointType.GAUGE);
    assert.strictEqual(
      eventLoopDelayP50.descriptor.description,
      'The 50th percentile of the recorded event loop delays.'
    );
    assert.strictEqual(
      eventLoopDelayP50.descriptor.name,
      'node.event_loop_delay.p50'
    );
    assert.strictEqual(eventLoopDelayP50.descriptor.unit, 'ms');
    assert.strictEqual(eventLoopDelayP50.dataPoints.length, 1);
    assert.deepStrictEqual(eventLoopDelayP50.dataPoints[0].attributes, {
      foo: 'bar',
    });

    const eventLoopDelayP95 = metrics[6];
    assert.strictEqual(eventLoopDelayP95.dataPointType, DataPointType.GAUGE);
    assert.strictEqual(
      eventLoopDelayP95.descriptor.description,
      'The 95th percentile of the recorded event loop delays.'
    );
    assert.strictEqual(
      eventLoopDelayP95.descriptor.name,
      'node.event_loop_delay.p95'
    );
    assert.strictEqual(eventLoopDelayP95.descriptor.unit, 'ms');
    assert.strictEqual(eventLoopDelayP95.dataPoints.length, 1);
    assert.deepStrictEqual(eventLoopDelayP95.dataPoints[0].attributes, {
      foo: 'bar',
    });

    const eventLoopDelayP99 = metrics[7];
    assert.strictEqual(eventLoopDelayP99.dataPointType, DataPointType.GAUGE);
    assert.strictEqual(
      eventLoopDelayP99.descriptor.description,
      'The 99th percentile of the recorded event loop delays.'
    );
    assert.strictEqual(
      eventLoopDelayP99.descriptor.name,
      'node.event_loop_delay.p99'
    );
    assert.strictEqual(eventLoopDelayP99.descriptor.unit, 'ms');
    assert.strictEqual(eventLoopDelayP99.dataPoints.length, 1);
    assert.deepStrictEqual(eventLoopDelayP99.dataPoints[0].attributes, {
      foo: 'bar',
    });

    const eventLoopUtilization = metrics[8];
    assert.strictEqual(eventLoopUtilization.dataPointType, DataPointType.GAUGE);
    assert.strictEqual(
      eventLoopUtilization.descriptor.description,
      'The percentage utilization of the event loop.'
    );
    assert.strictEqual(
      eventLoopUtilization.descriptor.name,
      'node.event_loop_utilization'
    );
    assert.strictEqual(eventLoopUtilization.descriptor.unit, 'percent');
    assert.strictEqual(eventLoopUtilization.dataPoints.length, 1);
    assert.deepStrictEqual(eventLoopUtilization.dataPoints[0].attributes, {
      foo: 'bar',
    });

    const eventLoopUtilizationIdle = metrics[9];
    assert.strictEqual(
      eventLoopUtilizationIdle.dataPointType,
      DataPointType.GAUGE
    );
    assert.strictEqual(
      eventLoopUtilizationIdle.descriptor.description,
      'The idle time utilization of event loop.'
    );
    assert.strictEqual(
      eventLoopUtilizationIdle.descriptor.name,
      'node.event_loop_utilization.idle'
    );
    assert.strictEqual(eventLoopUtilizationIdle.descriptor.unit, 'ms');
    assert.strictEqual(eventLoopUtilizationIdle.dataPoints.length, 1);
    assert.deepStrictEqual(eventLoopUtilizationIdle.dataPoints[0].attributes, {
      foo: 'bar',
    });

    const eventLoopUtilizationActive = metrics[10];
    assert.strictEqual(
      eventLoopUtilizationActive.dataPointType,
      DataPointType.GAUGE
    );
    assert.strictEqual(
      eventLoopUtilizationActive.descriptor.description,
      'The active time utilization of event loop.'
    );
    assert.strictEqual(
      eventLoopUtilizationActive.descriptor.name,
      'node.event_loop_utilization.active'
    );
    assert.strictEqual(eventLoopUtilizationActive.descriptor.unit, 'ms');
    assert.strictEqual(eventLoopUtilizationActive.dataPoints.length, 1);
    assert.deepStrictEqual(
      eventLoopUtilizationActive.dataPoints[0].attributes,
      {
        foo: 'bar',
      }
    );
  });
});
