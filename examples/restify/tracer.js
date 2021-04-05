'use strict';

const opentelemetry = require('@opentelemetry/api');

const { diag, DiagConsoleLogger, DiagLogLevel } = opentelemetry;
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE);

const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require('@opentelemetry/node');
const { SimpleSpanProcessor } = require('@opentelemetry/tracing');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');

const { RestifyInstrumentation: Instrumentation } = require('../../plugins/node/opentelemetry-instrumentation-restify/build/src');
const { HttpInstrumentation } = require('../../../opentelemetry-js/packages/opentelemetry-instrumentation-http');

module.exports = (serviceName) => {
  const provider = new NodeTracerProvider();
  registerInstrumentations({
    tracerProvider: provider,
    // when boostraping with lerna for testing purposes
    instrumentations: [
      HttpInstrumentation,
      Instrumentation,
    ],
  });

  const exporter = new JaegerExporter({
    serviceName,
  });

  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register();

  return opentelemetry.trace.getTracer('restify-example');
};
