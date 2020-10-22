'use strict';

const { RCAMetrics } = require('@opentelemetry/rca-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { MeterProvider } = require('@opentelemetry/metrics');

const exporter = new PrometheusExporter(
  {
    startServer: true,
  },
  () => {
    console.log('prometheus scrape endpoint: http://localhost:9464/metrics');
  },
);

const meterProvider = new MeterProvider({
  exporter,
  interval: 2000,
});

const rcaMetrics = new RCAMetrics({ meterProvider, name: 'example-rca-metrics' });
rcaMetrics.start();
