'use strict';

const {
  diag, trace, DiagConsoleLogger, DiagLogLevel,
} = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

module.exports = () => {
  // enable  diag to see all messages
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL);

  const exporter = new CollectorTraceExporter({
    serviceName: 'basic-service',
  });

  const provider = new NodeTracerProvider({
    spanProcessors: [
      new SimpleSpanProcessor(exporter),
    ],
  });
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
    ],
    tracerProvider: provider,
  });

  return trace.getTracer('meta-node-example');
};
