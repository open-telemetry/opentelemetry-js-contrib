'use strict';

const opentelemetry = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();

const exporter = new JaegerExporter({ serviceName: 'ioredis-example' });

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

// Initialize the OpenTelemetry APIs to use the BasicTracer bindings
provider.register();

registerInstrumentations({
  instrumentations: [
    new IORedisInstrumentation(),
  ],
  tracerProvider: provider,
});

module.exports = opentelemetry.trace.getTracer('ioredis-example');
