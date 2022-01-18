'use strict';

const opentelemetry = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { GrpcInstrumentation } = require('@opentelemetry/instrumentation-grpc');

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
    });
  }

  // It is recommended to use this `BatchSpanProcessor` for better performance
  // and optimization, especially in production.
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register();

  registerInstrumentations({
    instrumentations: [
      new GrpcInstrumentation(),
    ],
  });

  return opentelemetry.trace.getTracer('grpc-dynamic-codegen-example');
};
