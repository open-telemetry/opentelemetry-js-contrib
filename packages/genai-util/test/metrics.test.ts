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
  createServerTimeToFirstTokenHistogram,
  recordOperationDuration,
  recordTokenUsage,
  recordTimeToFirstChunk,
  recordServerTimeToFirstToken,
  GENAI_OPERATION_DURATION_BUCKETS,
  GENAI_TOKEN_USAGE_BUCKETS,
  GENAI_TIME_TO_FIRST_CHUNK_BUCKETS,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
} from '../src';

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

  it('should define standard bucket boundaries', () => {
    assert.strictEqual(GENAI_OPERATION_DURATION_BUCKETS[0], 0.01);
    assert.strictEqual(GENAI_TOKEN_USAGE_BUCKETS[0], 1);
    assert.strictEqual(GENAI_TIME_TO_FIRST_CHUNK_BUCKETS[0], 0.001);
  });

  it('should create duration and token usage histograms', () => {
    const meter = meterProvider.getMeter('test-meter');
    const durationHistogram = createDurationHistogram(meter);
    const tokenUsageHistogram = createTokenUsageHistogram(meter);

    assert.ok(durationHistogram);
    assert.ok(tokenUsageHistogram);
  });

  it('should record operation duration without errors', () => {
    const meter = meterProvider.getMeter('test-meter');
    const durationHistogram = createDurationHistogram(meter);

    recordOperationDuration(durationHistogram, 0.42, {
      [ATTR_GEN_AI_PROVIDER_NAME]: 'openai',
      [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
    });

    // Should ignore invalid values
    recordOperationDuration(durationHistogram, -1);
    recordOperationDuration(undefined, 0.5);
  });

  it('should record token usage for input and output tokens', () => {
    const meter = meterProvider.getMeter('test-meter');
    const tokenUsageHistogram = createTokenUsageHistogram(meter);

    recordTokenUsage(
      tokenUsageHistogram,
      { inputTokens: 100, outputTokens: 250 },
      {
        [ATTR_GEN_AI_PROVIDER_NAME]: 'openai',
        [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
      }
    );

    // Should ignore undefined usage / histogram
    recordTokenUsage(undefined, { inputTokens: 10 });
    recordTokenUsage(tokenUsageHistogram, undefined);
  });

  it('should create and record time to first chunk histogram', () => {
    const meter = meterProvider.getMeter('test-meter');
    const ttftHistogram = createTimeToFirstChunkHistogram(meter);

    assert.ok(ttftHistogram);
    recordTimeToFirstChunk(ttftHistogram, 0.123, {
      [ATTR_GEN_AI_PROVIDER_NAME]: 'openai',
    });
    recordTimeToFirstChunk(undefined, 0.123);
    recordTimeToFirstChunk(ttftHistogram, -1);
  });

  it('should create and record server time to first token histogram', () => {
    const meter = meterProvider.getMeter('test-meter');
    const ttftHistogram = createServerTimeToFirstTokenHistogram(meter);

    assert.ok(ttftHistogram);
    recordServerTimeToFirstToken(ttftHistogram, 0.123, {
      [ATTR_GEN_AI_PROVIDER_NAME]: 'openai',
    });
    recordServerTimeToFirstToken(undefined, 0.123);
    recordServerTimeToFirstToken(ttftHistogram, -1);
  });
});
