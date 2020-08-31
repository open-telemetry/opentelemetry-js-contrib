'use strict';

const opentelemetry = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/node');
const { SimpleSpanProcessor } = require('@opentelemetry/tracing');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');

const EXPORTER = process.env.EXPORTER || '';

module.exports = (serviceName) => {
  const provider = new NodeTracerProvider({
    plugins: {
      '@hapi/hapi': {
        enabled: true,
        path: '@opentelemetry/hapi-instrumentation',
        enhancedDatabaseReporting: true,
      },
      http: {
        enabled: true,
        path: '@opentelemetry/plugin-http',
      },
    },
  });

  let exporter;
  if (EXPORTER === 'jaeger') {
    exporter = new JaegerExporter({ serviceName });
  } else {
    exporter = new ZipkinExporter({ serviceName });
  }
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register();

  return opentelemetry.trace.getTracer('hapi-example');
};
