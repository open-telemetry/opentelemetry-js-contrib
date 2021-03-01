'use strict';

const opentelemetry = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/node');
const { SimpleSpanProcessor } = require('@opentelemetry/tracing');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');

const provider = new NodeTracerProvider();

const exporter = new JaegerExporter({ serviceName: 'ioredis-example' });

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

// Initialize the OpenTelemetry APIs to use the BasicTracer bindings
provider.register();

// eslint-disable-next-line no-new
new IORedisInstrumentation();

module.exports = opentelemetry.trace.getTracer('ioredis-example');
