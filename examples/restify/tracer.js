'use strict';

const opentelemetry = require('@opentelemetry/api');

const { diag, DiagConsoleLogger, DiagLogLevel } = opentelemetry;
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE);

const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');

const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { RestifyInstrumentation } = require('@opentelemetry/instrumentation-restify');

const Exporter = ((exporterParam) => {
  if (typeof exporterParam === 'string') {
    const exporterString = exporterParam.toLowerCase();
    if (exporterString.startsWith('z')) {
      return ZipkinExporter;
    }
    if (exporterString.startsWith('j')) {
      return JaegerExporter;
    }
  }
  return ConsoleSpanExporter;
})(process.env.EXPORTER);

module.exports = (serviceName) => {
  const exporter = new Exporter({
    serviceName,
  });

  const provider = new NodeTracerProvider({
    spanProcessors: [
      new SimpleSpanProcessor(exporter),
    ],
  });

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      HttpInstrumentation,
      RestifyInstrumentation,
    ],
  });

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register();

  return opentelemetry.trace.getTracer('restify-example');
};
