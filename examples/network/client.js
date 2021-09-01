'use strict';

const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { NetInstrumentation } = require('@opentelemetry/instrumentation-net');
const { DnsInstrumentation } = require('@opentelemetry/instrumentation-dns');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { SimpleSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');

const provider = new NodeTracerProvider();

provider.addSpanProcessor(new SimpleSpanProcessor(new JaegerExporter({
  serviceName: 'http-client',
})));

provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

provider.register();

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL);

registerInstrumentations({
  instrumentations: [
    new NetInstrumentation(),
    new HttpInstrumentation(),
    new DnsInstrumentation({
      // Avoid dns lookup loop with http zipkin calls
      ignoreHostnames: ['localhost'],
    }),
  ],
  tracerProvider: provider,
});

require('net');
require('dns');
const https = require('https');
const http = require('http');

http.get('http://opentelemetry.io/', () => {}).on('error', (e) => {
  console.error(e);
});

https.get('https://opentelemetry.io/', () => {}).on('error', (e) => {
  console.error(e);
});

https.get('https://opentelemetry.io/', { ca: [] }, () => {}).on('error', (e) => {
  console.error(e);
});
