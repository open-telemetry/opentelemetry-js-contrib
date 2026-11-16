/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

// Setup telemetry for tracing and Bunyan logging.
//
// This writes OTel spans and log records to the console for simplicity. In a
// real setup you would configure exporters to send to remote observability apps
// for viewing and analysis.

const { NodeSDK } = require('@opentelemetry/sdk-node');
const {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} = require('@opentelemetry/sdk-trace');
const {
  ConsoleLogRecordExporter,
  SimpleLogRecordProcessor,
} = require('@opentelemetry/sdk-logs');
const {
  envDetector,
  hostDetector,
  processDetector,
} = require('@opentelemetry/resources');
// api.diag.setLogger(new api.DiagConsoleLogger(), api.DiagLogLevel.DEBUG);

const {
  BunyanInstrumentation,
} = require('@opentelemetry/instrumentation-bunyan');

const sdk = new NodeSDK({
  serviceName: 'bunyan-example',
  resourceDetectors: [
    envDetector,
    // ProcessDetector adds `process.pid` (among other resource attributes),
    // which replaces the usual Bunyan `pid` field.
    processDetector,
    // The HostDetector adds `host.name` and `host.arch` fields. `host.name`
    // replaces the usual Bunyan `hostname` field. HostDetector is *not* a
    // default detector of the `NodeSDK`.
    hostDetector,
  ],
  spanProcessors: [
    new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() }),
  ],
  logRecordProcessors: [
    new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() }),
  ],
  instrumentations: [new BunyanInstrumentation()],
});
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(
      () => {},
      err => console.log('warning: error shutting down OTel SDK', err)
    )
    .finally(() => process.exit(0));
});
sdk.start();
