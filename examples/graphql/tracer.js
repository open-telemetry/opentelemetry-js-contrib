'use strict';

const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { GraphQLInstrumentation } = require('@opentelemetry/instrumentation-graphql');
const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/tracing');
const { NodeTracerProvider } = require('@opentelemetry/node');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector');

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
    {
      plugins: {
        http: { enabled: false, path: '@opentelemetry/plugin-http' },
        https: { enabled: false, path: '@opentelemetry/plugin-https' },
        express: { enabled: false, path: '@opentelemetry/plugin-express' },
      },
    },
  ],
});
