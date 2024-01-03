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

const opentelemetry = require('@opentelemetry/sdk-node');
const { DiagConsoleLogger, diag } = require('@opentelemetry/api');

diag.setLogger(
  new DiagConsoleLogger(),
  opentelemetry.core.getEnv().OTEL_LOG_LEVEL
);

const sdk = new opentelemetry.NodeSDK({
  // Notably instrumentation fastify and pino are not in here
  instrumentations: [],
});

try {
  sdk.start();
  diag.info('OpenTelemetry automatic instrumentation started successfully');
} catch (error) {
  diag.error(
    'Error initializing OpenTelemetry SDK. Your application is not instrumented and will not produce telemetry',
    error
  );
}

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => diag.debug('OpenTelemetry SDK terminated'))
    .catch(error => diag.error('Error terminating OpenTelemetry SDK', error));
});
