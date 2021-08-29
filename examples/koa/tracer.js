'use strict';

const { KoaInstrumentation } = require('@opentelemetry/instrumentation-koa');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');

const api = require('@opentelemetry/api');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');

const EXPORTER = process.env.EXPORTER || '';

module.exports = (serviceName) => {
  const provider = new NodeTracerProvider();

  let exporter;
  if (EXPORTER === 'jaeger') {
    exporter = new JaegerExporter({ serviceName });
  } else {
    exporter = new ZipkinExporter({ serviceName });
  }
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

  registerInstrumentations({
    instrumentations: [
      new KoaInstrumentation(),
      new HttpInstrumentation(),
    ],
    tracerProvider: provider,
  });

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register();

  return api.trace.getTracer('koa-example');
};
