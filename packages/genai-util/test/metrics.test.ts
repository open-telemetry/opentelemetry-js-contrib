/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import {
  createDurationHistogram,
  createTokenUsageHistogram,
  createTimeToFirstChunkHistogram,
  createTimePerOutputChunkHistogram,
} from '../src/metrics';

class TestMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

describe('GenAI Metrics Helpers', () => {
  let meterProvider: MeterProvider;
  let metricReader: TestMetricReader;

  beforeEach(() => {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({ readers: [metricReader] });
  });

  afterEach(async () => {
    await meterProvider.shutdown();
  });

  it('should create duration and token usage histograms', () => {
    const meter = meterProvider.getMeter('test-meter');
    const durationHistogram = createDurationHistogram(meter);
    const tokenUsageHistogram = createTokenUsageHistogram(meter);

    assert.ok(durationHistogram);
    assert.ok(tokenUsageHistogram);
  });

  it('should create time to first chunk histogram', () => {
    const meter = meterProvider.getMeter('test-meter');
    const ttftHistogram = createTimeToFirstChunkHistogram(meter);

    assert.ok(ttftHistogram);
  });

  it('should create time per output chunk histogram', () => {
    const meter = meterProvider.getMeter('test-meter');
    const histogram = createTimePerOutputChunkHistogram(meter);

    assert.ok(histogram);
  });
});
