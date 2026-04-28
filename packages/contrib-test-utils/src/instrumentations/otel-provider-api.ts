/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  InMemorySpanExporter,
  ReadableSpan,
} from '@opentelemetry/sdk-trace-base';

const OTEL_TESTING_MEMORY_EXPORTER = Symbol.for(
  'opentelemetry.testing.memory_exporter'
);

type OTelProviderApiGlobal = {
  [OTEL_TESTING_MEMORY_EXPORTER]?: InMemorySpanExporter;
};
const _global = global as OTelProviderApiGlobal;

export const getTestMemoryExporter = (): InMemorySpanExporter | undefined => {
  return _global[OTEL_TESTING_MEMORY_EXPORTER];
};

export const setTestMemoryExporter = (memoryExporter: InMemorySpanExporter) => {
  _global[OTEL_TESTING_MEMORY_EXPORTER] = memoryExporter;
};

export const getTestSpans = (): ReadableSpan[] => {
  return getTestMemoryExporter()!.getFinishedSpans();
};

export const resetMemoryExporter = () => {
  getTestMemoryExporter()?.reset();
};
