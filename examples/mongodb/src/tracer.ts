import * as api from '@opentelemetry/api';

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export const setupTracing = (serviceName: string): api.Tracer => {
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    spanProcessors: [
      new SimpleSpanProcessor(new ZipkinExporter()),
      new SimpleSpanProcessor(new OTLPTraceExporter()),
    ],
  });

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

  return api.trace.getTracer('mongodb-example');
};
