/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  NodeTracerProvider,
  NodeTracerConfig,
} from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  getTestMemoryExporter,
  setTestMemoryExporter,
} from './otel-provider-api';

export const registerInstrumentationTestingProvider = (
  config?: NodeTracerConfig
): NodeTracerProvider => {
  const spanProcessors = config?.spanProcessors
    ? [...config.spanProcessors]
    : [];

  setTestMemoryExporter(new InMemorySpanExporter());

  spanProcessors.push(new SimpleSpanProcessor(getTestMemoryExporter()!));

  const otelTestingProvider = new NodeTracerProvider({
    ...config,
    spanProcessors,
  });

  otelTestingProvider.register();
  return otelTestingProvider;
};
