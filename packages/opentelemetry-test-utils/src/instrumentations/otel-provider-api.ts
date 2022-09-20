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
  InMemorySpanExporter,
  ReadableSpan,
} from '@opentelemetry/sdk-trace-base';

import {
  InMemoryMetricExporter,
  ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import { TestMetricReader } from '../TestMetricReader';

const OTEL_TRACING_TESTING_MEMORY_EXPORTER = Symbol.for(
  'opentelemetry.tracing.testing.memory_exporter'
);

const OTEL_METRICS_TESTING_MEMORY_EXPORTER = Symbol.for(
  'opentelemetry.metrics.testing.memory_exporter'
);

const OTEL_METRICS_TESTING_READER = Symbol.for(
  'opentelemetry.metrics.testing.reader'
);

type OTelExportersApiGlobal = {
  [OTEL_TRACING_TESTING_MEMORY_EXPORTER]?: InMemorySpanExporter;
  [OTEL_METRICS_TESTING_MEMORY_EXPORTER]?: InMemoryMetricExporter;
  [OTEL_METRICS_TESTING_READER]?: TestMetricReader;
};

const _global = global as OTelExportersApiGlobal;

export const getTracingTestMemoryExporter = ():
  | InMemorySpanExporter
  | undefined => {
  return _global[OTEL_TRACING_TESTING_MEMORY_EXPORTER];
};

export const getMetricsTestMemoryExporter = ():
  | InMemoryMetricExporter
  | undefined => {
  return _global[OTEL_METRICS_TESTING_MEMORY_EXPORTER];
};

export const getMetricsTestReader = (): TestMetricReader | undefined => {
  return _global[OTEL_METRICS_TESTING_READER];
};

export const setMetricsTestMemoryExporter = (
  memoryExporter: InMemoryMetricExporter
) => {
  _global[OTEL_METRICS_TESTING_MEMORY_EXPORTER] = memoryExporter;
};

export const setTestMemorySpanExporter = (
  memoryExporter: InMemorySpanExporter
) => {
  _global[OTEL_TRACING_TESTING_MEMORY_EXPORTER] = memoryExporter;
};

export const getTestSpans = (): ReadableSpan[] => {
  return getTracingTestMemoryExporter()!.getFinishedSpans();
};

export async function getTestMetrics(
  numberOfExports?: number
): Promise<ResourceMetrics[]> {
  numberOfExports = numberOfExports ?? 1;
  if (numberOfExports <= 0) {
    throw new Error('numberOfExports must be greater than or equal to 0');
  }

  const exporter = getMetricsTestMemoryExporter()!;
  const reader = getMetricsTestReader()!;
  let totalExports = 0;
  while (totalExports < numberOfExports) {
    await reader.collectAndExport();
    const exportedMetrics = exporter.getMetrics();
    totalExports = exportedMetrics.length;
  }

  return exporter.getMetrics();
}

export const resetTracingMemoryExporter = () => {
  getTracingTestMemoryExporter()?.reset();
};

export const resetMetricsMemoryExporter = () => {
  getMetricsTestMemoryExporter()?.reset();
};
