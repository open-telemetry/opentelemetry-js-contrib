'use strict';

const opentelemetry = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { HttpTraceContextPropagator } = require('@opentelemetry/core');
const { GrpcCensusPropagator } = require('@opentelemetry/propagator-grpc-census-binary');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { GrpcInstrumentation } = require('@opentelemetry/instrumentation-grpc');

/**
 * Return an OpenTelemetry tracer configured to use the gRPC plugin and with the
 * requested propagator
 */
module.exports = (serviceName, binaryPropagator) => {
  const provider = new NodeTracerProvider({
    spanProcessors: [
      // It is recommended to use `BatchSpanProcessor` for better performance
      // and optimization, especially in production.
      new SimpleSpanProcessor(new ConsoleSpanExporter()),
    ],
  });

  if (binaryPropagator) {
    // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
    provider.register({
      propagator: new GrpcCensusPropagator(),
    });
  } else {
    provider.register({
      propagator: new HttpTraceContextPropagator(),
    });
  }

  registerInstrumentations({
    instrumentations: [
      new GrpcInstrumentation(),
    ],
  });

  return opentelemetry.trace.getTracer(serviceName);
};
