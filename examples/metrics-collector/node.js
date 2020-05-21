'use strict';

const { MetricsCollector } = require('@opentelemetry/metrics-collector');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');

const exporter = new PrometheusExporter(
  {
    startServer: true,
  },
  () => {
    console.log('prometheus scrape endpoint: http://localhost:9464/metrics');
  },
);

const metricsCollector = new MetricsCollector({
  exporter,
  intervalCollect: 1000,
  intervalExport: 5000,
});
metricsCollector.start();
