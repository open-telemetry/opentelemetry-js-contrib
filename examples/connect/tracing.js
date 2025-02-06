'use strict';

const opentelemetry = require('@opentelemetry/api');

const { diag, DiagConsoleLogger, DiagLogLevel } = opentelemetry;
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector');

const { ConnectInstrumentation } = require('@opentelemetry/instrumentation-connect');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');

function log() {
  const args = Array.from(arguments) || [];
  args.unshift(new Date());
  console.log.apply(this, args);
}

module.exports = (serviceName) => {
  const exporter = new CollectorTraceExporter();
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
    }),
    spanProcessors: [
      new SimpleSpanProcessor(exporter),
    ],
  });
  const connectInstrumentation = new ConnectInstrumentation();
  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      // Connect instrumentation expects HTTP layer to be instrumented
      HttpInstrumentation,
      connectInstrumentation,
    ],
  });

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register({});
  return {
    log,
    connectInstrumentation,
    provider,
    tracer: opentelemetry.trace.getTracer('connect-example'),
  };
};
