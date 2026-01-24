'use strict';

const {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
} = require('@opentelemetry/api');

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { FastifyInstrumentation } = require('@opentelemetry/instrumentation-fastify');

const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
const { NodeSDK, metrics } = require('@opentelemetry/sdk-node');

const sdk = new NodeSDK({
  instrumentations: [
    HttpInstrumentation,
    new FastifyInstrumentation(),
  ],
  traceExporter: new OTLPTraceExporter(),
  metricReader: new metrics.PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
  }),
});

process.on('beforeExit', async () => {
  await sdk.shutdown();
});

sdk.start();
