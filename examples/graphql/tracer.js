'use strict';

const { GraphQLInstrumentation } = require('@opentelemetry/instrumentation-graphql');

const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/tracing');
const { NodeTracerProvider } = require('@opentelemetry/node');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector');

const exporter = new CollectorTraceExporter({
  serviceName: 'basic-service',
});

const provider = new NodeTracerProvider({
  plugins: {
    http: { enabled: false, path: '@opentelemetry/plugin-http' },
    https: { enabled: false, path: '@opentelemetry/plugin-https' },
    express: { enabled: false, path: '@opentelemetry/plugin-express' },
  },
});

const graphQLInstrumentation = new GraphQLInstrumentation({
  // allowAttributes: true,
  // depth: 2,
  // mergeItems: true,
});

graphQLInstrumentation.setTracerProvider(provider);

graphQLInstrumentation.enable();

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();
