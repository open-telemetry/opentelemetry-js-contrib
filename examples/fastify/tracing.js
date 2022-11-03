'use strict';

const opentelemetry = require('@opentelemetry/api');

const { diag, DiagConsoleLogger, DiagLogLevel } = opentelemetry;
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const { Resource } = require('@opentelemetry/resources');
const {
  SemanticResourceAttributes,
} = require('@opentelemetry/semantic-conventions');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-http');

const {
  FastifyInstrumentation,
} = require('@opentelemetry/instrumentation-fastify');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');

function log() {
  // eslint-disable-next-line prefer-rest-params
  const args = Array.from(arguments) || [];
  args.unshift(new Date());
  console.log.apply(this, args);
}

module.exports = (serviceName) => {
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
  });
  const fastifyInstrumentation = new FastifyInstrumentation();
  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      // Fastify instrumentation expects HTTP layer to be instrumented
      HttpInstrumentation,
      fastifyInstrumentation,
    ],
  });

  const exporter = new OTLPTraceExporter();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register({});
  return {
    log,
    fastifyInstrumentation,
    provider,
    tracer: opentelemetry.trace.getTracer('fastify-example'),
  };
};
