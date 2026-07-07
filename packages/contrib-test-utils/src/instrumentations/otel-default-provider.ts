/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { context, propagation, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import type { Resource } from '@opentelemetry/resources';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import {
  getTestMemoryExporter,
  setTestMemoryExporter,
} from './otel-provider-api';

export function registerInstrumentationTestingProvider(config?: {
  resource: Resource;
}): TracerProvider {
  const spanProcessors = [];

  setTestMemoryExporter(new InMemorySpanExporter());

  spanProcessors.push(
    new SimpleSpanProcessor({ exporter: getTestMemoryExporter()! })
  );

  if (process.env.OTEL_EXPORTER_JAEGER_AGENT_HOST) {
    spanProcessors.push(
      new SimpleSpanProcessor({ exporter: new JaegerExporter() })
    );
  }

  const tracerProvider = new TracerProvider({
    ...config,
    spanProcessors,
  });
  trace.setGlobalTracerProvider(tracerProvider);

  context.setGlobalContextManager(new AsyncLocalStorageContextManager());

  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });
  propagation.setGlobalPropagator(propagator);

  return tracerProvider;
}
