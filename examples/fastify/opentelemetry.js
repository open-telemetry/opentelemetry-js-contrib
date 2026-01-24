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

const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const {
  FastifyInstrumentation,
} = require('@opentelemetry/instrumentation-fastify');

const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-proto');
const {
  OTLPMetricExporter,
} = require('@opentelemetry/exporter-metrics-otlp-proto');
const { NodeSDK, metrics } = require('@opentelemetry/sdk-node');

const sdk = new NodeSDK({
  instrumentations: [HttpInstrumentation, new FastifyInstrumentation()],
  traceExporter: new OTLPTraceExporter(),
  metricReader: new metrics.PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
  }),
});

process.on('beforeExit', async () => {
  await sdk.shutdown();
});

sdk.start();
