/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import type { TracerConfig } from '@opentelemetry/sdk-trace-base';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  getTestMemoryExporter,
  setTestMemoryExporter,
} from './otel-provider-api';

export const registerInstrumentationTestingProvider = (
  config?: TracerConfig
): BasicTracerProvider => {
  const spanProcessors = config?.spanProcessors
    ? [...config.spanProcessors]
    : [];

  setTestMemoryExporter(new InMemorySpanExporter());

  spanProcessors.push(new SimpleSpanProcessor(getTestMemoryExporter()!));

  if (process.env.OTEL_EXPORTER_JAEGER_AGENT_HOST) {
    spanProcessors.push(new SimpleSpanProcessor(new JaegerExporter()));
  }

  const otelTestingProvider = new BasicTracerProvider({
    ...config,
    spanProcessors,
  });
  trace.setGlobalTracerProvider(otelTestingProvider);
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    })
  );
  const defaultContextManager = new AsyncLocalStorageContextManager();
  defaultContextManager.enable();
  context.setGlobalContextManager(defaultContextManager);

  return otelTestingProvider;
};
