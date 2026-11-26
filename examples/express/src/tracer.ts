/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  trace,
  SpanKind,
  Attributes,
  context,
  propagation,
} from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import {
  Sampler,
  AlwaysOnSampler,
  SamplingDecision,
  BatchSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import {
  ATTR_SERVICE_NAME,
  ATTR_HTTP_ROUTE,
} from '@opentelemetry/semantic-conventions';
import {
  defaultResource,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

export const setupTracing = (serviceName: string) => {
  const exporter = new OTLPTraceExporter();
  const tracerProvider = new TracerProvider({
    resource: defaultResource().merge(
      resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName })
    ),
    spanProcessors: [new BatchSpanProcessor({ exporter })],
    sampler: filterSampler(ignoreHealthCheck, new AlwaysOnSampler()),
  });
  trace.setGlobalTracerProvider(tracerProvider);
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable()
  );
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    })
  );

  registerInstrumentations({
    tracerProvider,
    instrumentations: [
      // Express instrumentation expects HTTP layer to be instrumented
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
    ],
  });

  // This shutdown is important to ensure that buffered tracing data is
  // flushed on process shutdown (e.g. for `npm run client`).
  process.once('beforeExit', async () => {
    await tracerProvider.shutdown();
  });

  return trace.getTracer(serviceName);
};

type FilterFunction = (
  spanName: string,
  spanKind: SpanKind,
  attributes: Attributes
) => boolean;

function filterSampler(filterFn: FilterFunction, parent: Sampler): Sampler {
  return {
    shouldSample(ctx, tid, spanName, spanKind, attr, links) {
      if (!filterFn(spanName, spanKind, attr)) {
        return { decision: SamplingDecision.NOT_RECORD };
      }
      return parent.shouldSample(ctx, tid, spanName, spanKind, attr, links);
    },
    toString() {
      return `FilterSampler(${parent.toString()})`;
    },
  };
}

function ignoreHealthCheck(
  spanName: string,
  spanKind: SpanKind,
  attributes: Attributes
) {
  return (
    spanKind !== SpanKind.SERVER || attributes[ATTR_HTTP_ROUTE] !== '/health'
  );
}
