'use strict';

const { HostMetrics } = require('@opentelemetry/host-metrics');
// const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { MeterProvider } = require('@opentelemetry/sdk-metrics-base');
const { CollectorMetricExporter } = require('@opentelemetry/exporter-collector');

const exporter = new CollectorMetricExporter({
  headers: {},
  serviceName: 'test-host-metrics',
  // url: '',
});

// for testing purposes if you don't want to use CollectorMetricExporter
// const exporter = new PrometheusExporter(
//   {
//     startServer: true,
//   },
//   () => {
//     console.log('prometheus scrape endpoint: http://localhost:9464/metrics');
//   },
// );

const meterProvider = new MeterProvider({
  exporter,
  interval: 2000,
});

const hostMetrics = new HostMetrics({ meterProvider, name: 'example-host-metrics' });
hostMetrics.start();

// keep running
(function wait() {
  setTimeout(wait, 1000);
}());
