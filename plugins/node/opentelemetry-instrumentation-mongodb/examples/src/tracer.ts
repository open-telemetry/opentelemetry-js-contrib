import { Tracer } from "@opentelemetry/api";

const opentelemetry = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { Resource } = require('@opentelemetry/resources');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');


export const setupTracing = (serviceName: string): Tracer => {
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName
    })
  });

  provider.addSpanProcessor(new SimpleSpanProcessor(new ZipkinExporter()));
  provider.addSpanProcessor(new SimpleSpanProcessor(new JaegerExporter()));

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register();

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation(),
      new MongoDBInstrumentation({
        enhancedDatabaseReporting: true,

      }),
    ],
    tracerProvider: provider,
  });

  return opentelemetry.trace.getTracer('mysql-example');
};
