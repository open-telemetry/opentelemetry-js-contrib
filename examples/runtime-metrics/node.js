'use strict';

const { RuntimeMetrics } = require('@opentelemetry/runtime-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { MeterProvider } = require('@opentelemetry/metrics');

const exporter = new PrometheusExporter(
  {
    port: 9465,
    startServer: true,
  },
  () => {
    console.log('prometheus scrape endpoint: http://localhost:9465/metrics');
  },
);

const meterProvider = new MeterProvider({
  exporter,
  interval: 2000,
});

const runtimeMetrics = new RuntimeMetrics({ meterProvider, name: 'example-runtime-metrics' });
runtimeMetrics.start();
