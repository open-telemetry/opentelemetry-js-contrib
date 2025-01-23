'use strict';

const opentelemetry = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { DnsInstrumentation } = require('@opentelemetry/instrumentation-dns');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const EXPORTER = process.env.EXPORTER || '';

module.exports = (serviceName) => {
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

  const provider = new NodeTracerProvider({
    spanProcessors: [
      new SimpleSpanProcessor(exporter),
    ],
  });

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register();

  registerInstrumentations({
    instrumentations: [
      new DnsInstrumentation({
        // Avoid dns lookup loop with http zipkin calls
        ignoreHostnames: ['localhost'],
      }),
    ],
  });

  return opentelemetry.trace.getTracer(serviceName);
};
