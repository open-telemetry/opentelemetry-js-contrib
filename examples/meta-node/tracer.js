'use strict';

const {
  diag, trace, DiagConsoleLogger, DiagLogLevel,
} = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector');
const { SimpleSpanProcessor } = require('@opentelemetry/tracing');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

module.exports = () => {
  // enable  diag to see all messages
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL);

  const exporter = new CollectorTraceExporter({
    serviceName: 'basic-service',
  });

  const provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();

  registerInstrumentations({
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          applyCustomAttributesOnSpan: (span) => {
            span.setAttribute('foo2', 'bar2');
          },
        },
      }),
      // disable old plugins - this can be removed once plugins are deprecated
      // and removed from registerInstrumentations
      {
        plugins: {
          mongodb: { enabled: false, path: '@opentelemetry/plugin-mongodb' },
          grpc: { enabled: false, path: '@opentelemetry/plugin-grpc' },
          '@grpc/grpc-js': { enabled: false, path: '@opentelemetry/plugin-grpc-js' },
          http: { enabled: false, path: '@opentelemetry/plugin-http' },
          https: { enabled: false, path: '@opentelemetry/plugin-httsps' },
          mysql: { enabled: false, path: '@opentelemetry/plugin-mysql' },
          pg: { enabled: false, path: '@opentelemetry/plugin-pg' },
          redis: { enabled: false, path: '@opentelemetry/plugin-redis' },
          ioredis: { enabled: false, path: '@opentelemetry/plugin-ioredis' },
          'pg-pool': { enabled: false, path: '@opentelemetry/plugin-pg-pool' },
          express: { enabled: false, path: '@opentelemetry/plugin-express' },
          '@hapi/hapi': { enabled: false, path: '@opentelemetry/hapi-instrumentation' },
          koa: { enabled: false, path: '@opentelemetry/koa-instrumentation' },
          dns: { enabled: false, path: '@opentelemetry/plugin-dns' },
        },
      },
    ],
    tracerProvider: provider,
  });

  return trace.getTracer('meta-node-example');
};
