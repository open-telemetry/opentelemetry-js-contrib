/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const { HostMetrics } = require('@opentelemetry/host-metrics');
// const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { MeterProvider } = require('@opentelemetry/sdk-metrics-base');
const {
  CollectorMetricExporter,
} = require('@opentelemetry/exporter-collector');

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

const hostMetrics = new HostMetrics({
  meterProvider,
  name: 'example-host-metrics',
});
hostMetrics.start();

// keep running
(function wait() {
  setTimeout(wait, 1000);
})();
