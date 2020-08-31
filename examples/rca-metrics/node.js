'use strict';

const { RCAMetrics } = require('@opentelemetry/rca-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const exporter = new PrometheusExporter(
  {
    startServer: true,
  },
  () => {
    console.log('prometheus scrape endpoint: http://localhost:9464/metrics');
  },
);

const rcaMetrics = new RCAMetrics({
  exporter,
  interval: 2000,
});
rcaMetrics.start();
