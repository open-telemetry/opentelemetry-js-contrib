import * as api from "@opentelemetry/api";

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';


export const setupTracing = (serviceName: string): api.Tracer => {
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

  return api.trace.getTracer('mysql-example');
};
