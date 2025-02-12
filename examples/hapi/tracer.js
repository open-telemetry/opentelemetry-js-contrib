'use strict';

const api = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');
const { HapiInstrumentation } = require('@opentelemetry/instrumentation-hapi');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const EXPORTER = process.env.EXPORTER || '';

module.exports = (serviceName) => {
  let exporter;
  if (EXPORTER === 'jaeger') {
    exporter = new JaegerExporter({ serviceName });
  } else {
    exporter = new ZipkinExporter({ serviceName });
  }

  const provider = new NodeTracerProvider({
    spanProcessors: [
      new SimpleSpanProcessor(exporter),
    ],
  });

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register();

  registerInstrumentations({
    instrumentations: [
      new HapiInstrumentation({
        enhancedDatabaseReporting: true,
      }),
      new HttpInstrumentation(),
    ],
  });

  return api.trace.getTracer('hapi-example');
};
