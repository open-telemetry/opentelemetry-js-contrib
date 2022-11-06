import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { IntervalHistogram } from "perf_hooks";
import { createEventLoopLagMetrics } from "../../src/metrics/event-loop-lag";
import assert = require("assert");
import { Meter } from "@opentelemetry/api-metrics";

const mockHistogram = (
  override: {
    min?: number;
    max?: number;
    mean?: number;
    stddev?: number;
  } = {}
): IntervalHistogram => ({
  enable: () => true,
  disable: () => true,
  reset: () => {},
  percentile: () => 0,

  min: 0,
  max: 0,
  mean: 0,
  stddev: 0,
  exceeds: 0,

  percentiles: new Map(),

  ...override,
});

describe("createEventLoopLagMetrics", () => {
  let exporter: InMemoryMetricExporter;
  let meterReader: PeriodicExportingMetricReader;
  let meter: Meter;
  let meterProvider: MeterProvider;

  beforeEach(async () => {
    exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    meterProvider = new MeterProvider();
    meter = meterProvider.getMeter("test");
    meterReader = new PeriodicExportingMetricReader({
      exporter,
      exportTimeoutMillis: 1,
      exportIntervalMillis: 1,
    });
    meterProvider.addMetricReader(meterReader);
  });

  afterEach(async () => {
    await exporter.shutdown();
    await meterReader.shutdown();
  });

  it("should export all metrics", async () => {
    createEventLoopLagMetrics(meter, mockHistogram());

    await meterReader.collect();
    await meterReader.collect();

    assert.ok(exporter.getMetrics()[0].scopeMetrics[0].metrics.length === 8);
  });
});
