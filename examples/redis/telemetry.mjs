/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context, propagation, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';

// Uncomment for OTel SDK diagnostic information.
// import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const serviceName = process.env.OTEL_SERVICE_NAME;

const exporter = new OTLPTraceExporter();
const tracerProvider = new TracerProvider({
  resource: defaultResource().merge(
    resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName })
  ),
  spanProcessors: [new BatchSpanProcessor({ exporter })],
});
trace.setGlobalTracerProvider(tracerProvider);
context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
propagation.setGlobalPropagator(new CompositePropagator({
  propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
}));

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new RedisInstrumentation(),
    // Node.js fetch() is implemented via the `undici` module.
    new UndiciInstrumentation(),
  ],
  tracerProvider,
});

// This shutdown is important to ensure that buffered tracing data is
// flushed on process shutdown (e.g. for `npm run client`).
process.once('beforeExit', async () => {
  await tracerProvider.shutdown();
});
