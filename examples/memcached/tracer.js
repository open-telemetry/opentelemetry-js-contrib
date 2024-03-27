'use strict';

const opentelemetry = require('@opentelemetry/api');

const { diag, DiagConsoleLogger, DiagLogLevel } = opentelemetry;
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE);

const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { Resource } = require('@opentelemetry/resources');

const { MemcachedInstrumentation } = require('@opentelemetry/instrumentation-memcached');

module.exports = (serviceName) => {
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
    }),
  });
  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new MemcachedInstrumentation(),
    ],
  });

  const exporter = new ConsoleSpanExporter();

  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register();

  return opentelemetry.trace.getTracer('memcached-example');
};
