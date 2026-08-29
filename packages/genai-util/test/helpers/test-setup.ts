/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';

export class TestMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

export interface TestTelemetryContext {
  memoryExporter: InMemorySpanExporter;
  tracerProvider: TracerProvider;
  metricReader: TestMetricReader;
  meterProvider: MeterProvider;
  shutdown: () => Promise<void>;
  reset: () => void;
}

export function createTestTelemetryContext(): TestTelemetryContext {
  const memoryExporter = new InMemorySpanExporter();
  const tracerProvider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: memoryExporter })],
  });

  const metricReader = new TestMetricReader();
  const meterProvider = new MeterProvider({ readers: [metricReader] });

  return {
    memoryExporter,
    tracerProvider,
    metricReader,
    meterProvider,
    async shutdown() {
      await meterProvider.shutdown();
      await tracerProvider.shutdown();
    },
    reset() {
      memoryExporter.reset();
    },
  };
}
