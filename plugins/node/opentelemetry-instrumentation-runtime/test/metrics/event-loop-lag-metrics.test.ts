import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  DataPointType,
} from '@opentelemetry/sdk-metrics';
import { RuntimeInstrumentation } from '../../src/instrumentation';
import * as assert from 'assert';
import { TestMetricReader } from '../utils/TestMetricReader';

const instrumentation = new RuntimeInstrumentation();
instrumentation.enable();
instrumentation.disable();

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

  it('should add event loop delay metrics', async () => {
    const requestCount = 10;
    for (let i = 0; i < requestCount; i++) {
      await new Promise<void>(resolve =>
        setTimeout(() => resolve(), (i + 1) * 10)
      );
    }

    await metricReader.collectAndExport();

    const resourceMetrics = metricsMemoryExporter.getMetrics();
    const scopeMetrics = resourceMetrics[0].scopeMetrics;
    assert.strictEqual(scopeMetrics.length, 1, 'scopeMetrics count');
    const metrics = scopeMetrics[0].metrics;
    assert.strictEqual(metrics.length, 8, 'metrics count');
    const eventLoopDelay = metrics[0];
    assert.strictEqual(eventLoopDelay.dataPointType, DataPointType.GAUGE);
    assert.strictEqual(
      eventLoopDelay.descriptor.description,
      'Lag of event loop.'
    );
    assert.strictEqual(eventLoopDelay.descriptor.name, 'node.event_loop_delay');
    assert.strictEqual(eventLoopDelay.descriptor.unit, 'ms');
    assert.strictEqual(eventLoopDelay.dataPoints.length, 1);

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
  });
});
