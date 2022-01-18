'use strict';

const opentelemetry = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');

const EXPORTER = process.env.EXPORTER || '';

module.exports = (serviceName) => {
  const provider = new NodeTracerProvider();

  let exporter;
  if (EXPORTER.toLowerCase().startsWith('z')) {
    exporter = new ZipkinExporter({
      serviceName,
    });
  } else {
    exporter = new JaegerExporter({
      serviceName,
      // The default flush interval is 5 seconds.
      flushInterval: 2000,
    });
  }

  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

  // Initialize the OpenTelemetry APIs to use the BasicTracer bindings
  provider.register();

  registerInstrumentations({
    instrumentations: [
      new PgInstrumentation(),
      new HttpInstrumentation(),
    ],
  });

  return opentelemetry.trace.getTracer('example-postgres');
};
