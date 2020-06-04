'use strict';

const opentelemetry = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/node');
const { SimpleSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/tracing');
const { HttpTraceContext } = require('@opentelemetry/core');
const { GrpcCensusPropagator } = require('@opentelemetry/propagator-grpc-census-binary');

/**
 * Return an OpenTelemetry tracer configured to use the gRPC plugin and with the
 * requested propagator
 */
module.exports = (serviceName, binaryPropagator) => {
  const provider = new NodeTracerProvider({
    plugins: {
      grpc: {
        enabled: true,
        // You may use a package name or absolute path to the file.
        path: '@opentelemetry/plugin-grpc',
      },
    },
  });

  // It is recommended to use this `BatchSpanProcessor` for better performance
  // and optimization, especially in production.
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

  if (binaryPropagator) {
    // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
    provider.register({
      propagator: new GrpcCensusPropagator(),
    });
  } else {
    provider.register({
      propagator: new HttpTraceContext(),
    });
  }

  return opentelemetry.trace.getTracer(serviceName);
};
