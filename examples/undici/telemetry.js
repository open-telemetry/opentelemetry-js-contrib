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

// Setup telemetry for tracing and Bunyan logging.
//
// This writes OTel spans and log records to the console for simplicity. In a
// real setup you would configure exporters to send to remote observability apps
// for viewing and analysis.

'use strict';

const { NodeSDK, tracing } = require('@opentelemetry/sdk-node');

const { UndiciInstrumentation } = require('@opentelemetry/instrumentation-undici');

const sdk = new NodeSDK({
  serviceName: 'undici-example',
  spanProcessor: new tracing.SimpleSpanProcessor(new tracing.ConsoleSpanExporter()),
  instrumentations: [
    new UndiciInstrumentation(),
  ],
});

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(
      () => {},
      (err) => console.log('warning: error shutting down OTel SDK', err),
    )
    .finally(() => process.exit(0));
});
sdk.start();
