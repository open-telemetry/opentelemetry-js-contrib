'use strict';

const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { GraphQLInstrumentation } = require('@opentelemetry/instrumentation-graphql');
const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');

const exporter = new CollectorTraceExporter({
  serviceName: 'basic-service',
});

const provider = new NodeTracerProvider();

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

registerInstrumentations({
  instrumentations: [
    new GraphQLInstrumentation({
      // allowAttributes: true,
      // depth: 2,
      // mergeItems: true,
    }),
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
  ],
});
