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

import {InMemoryMetricExporter, ResourceMetrics} from '@opentelemetry/sdk-metrics';

const OTEL_TRACING_TESTING_MEMORY_EXPORTER = Symbol.for(
  'opentelemetry.tracing.testing.memory_exporter'
);

const OTEL_METRICS_TESTING_MEMORY_EXPORTER = Symbol.for(
  'opentelemetry.metrics.testing.memory_exporter'
);

type OTelProvidersApiGlobal = {
  [OTEL_TRACING_TESTING_MEMORY_EXPORTER]?: InMemorySpanExporter;
  [OTEL_METRICS_TESTING_MEMORY_EXPORTER]?: InMemoryMetricExporter;
};

const _global = global as OTelProvidersApiGlobal;

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

export const setMetricsTestMemoryExporter = (
  memoryExporter: InMemoryMetricExporter
) => {
  _global[OTEL_METRICS_TESTING_MEMORY_EXPORTER] = memoryExporter;
};

export const setTracingTestMemoryExporter = (
  memoryExporter: InMemorySpanExporter
) => {
  _global[OTEL_TRACING_TESTING_MEMORY_EXPORTER] = memoryExporter;
};

export const getTestSpans = (): ReadableSpan[] => {
  return getTracingTestMemoryExporter()!.getFinishedSpans();
};

export const getTestMetrics = (): ResourceMetrics[] => {
  return getMetricsTestMemoryExporter()!.getMetrics();
};

export const resetTracingMemoryExporter = () => {
  getTracingTestMemoryExporter()?.reset();
};

export const resetMetricsMemoryExporter = () => {
  getMetricsTestMemoryExporter()?.reset();
};
