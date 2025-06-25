'use strict';

const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { GraphQLInstrumentation } = require('@opentelemetry/instrumentation-graphql');
const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-otlp-http');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');

const provider = new NodeTracerProvider({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'graphql-service',
  }),
  spanProcessors: [
    new SimpleSpanProcessor(new OTLPTraceExporter()),
    new SimpleSpanProcessor(new ConsoleSpanExporter()),
  ],
});

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
