/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelemetryHandler } from '@opentelemetry/genai-util';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { OpenAIAgentsTracingProcessor } from '../src/processor';
import type { OpenAIAgentsSpan } from '../src/internal-types';
import type { ContentCaptureMode } from '../src/semconv';

export class TestMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

export const noopDiag = {
  debug() {},
  error() {},
  info() {},
  verbose() {},
  warn() {},
};

export function createSpan(
  traceId: string,
  spanId: string,
  type: string,
  parentId?: string,
  data: Record<string, unknown> = {}
): OpenAIAgentsSpan {
  return {
    traceId,
    spanId,
    parentId,
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:01.000Z',
    spanData: { type, ...data },
  };
}

export interface ProcessorTestContext {
  exporter: InMemorySpanExporter;
  metricReader: TestMetricReader;
  processor: OpenAIAgentsTracingProcessor;
  setCaptureMode(mode: ContentCaptureMode): void;
  cleanup(): Promise<void>;
}

export function createProcessorTestContext(): ProcessorTestContext {
  const exporter = new InMemorySpanExporter();
  const tracerProvider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  const metricReader = new TestMetricReader();
  const meterProvider = new MeterProvider({
    readers: [metricReader],
  });

  const buildHandler = (mode: ContentCaptureMode) =>
    new TelemetryHandler({
      instrumentationName: 'test',
      instrumentationVersion: '0.0.0',
      tracerProvider,
      meterProvider,
      diag: noopDiag,
      contentCaptureMode: mode,
    });

  let handler = buildHandler('none');
  const processor = new OpenAIAgentsTracingProcessor(() => handler, noopDiag);

  return {
    exporter,
    metricReader,
    processor,
    setCaptureMode(mode: ContentCaptureMode) {
      handler = buildHandler(mode);
    },
    async cleanup() {
      await processor.shutdown();
      await meterProvider.shutdown();
      exporter.reset();
    },
  };
}
