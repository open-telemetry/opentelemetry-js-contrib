'use strict';

import opentelemetry from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const EXPORTER = process.env.EXPORTER || '';

export const setupTracing = (serviceName: string) => {
  const provider = new NodeTracerProvider({
    resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
  }),});

  if (EXPORTER.toLowerCase().startsWith('z')) {
    provider.addSpanProcessor(new SimpleSpanProcessor(new ZipkinExporter()));
  } else {
    provider.addSpanProcessor(new SimpleSpanProcessor(new JaegerExporter()));
  }

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register();

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation(),
      new MySQLInstrumentation(),
    ],
    tracerProvider: provider,
  });

  return opentelemetry.trace.getTracer('mysql-example');
};
