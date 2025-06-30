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

const opentelemetry = require('@opentelemetry/api');

const { diag, DiagConsoleLogger, DiagLogLevel } = opentelemetry;
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector');

const {
  ConnectInstrumentation,
} = require('@opentelemetry/instrumentation-connect');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');

function log() {
  const args = Array.from(arguments) || [];
  args.unshift(new Date());
  console.log.apply(this, args);
}

module.exports = serviceName => {
  const exporter = new CollectorTraceExporter();
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const connectInstrumentation = new ConnectInstrumentation();
  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      // Connect instrumentation expects HTTP layer to be instrumented
      HttpInstrumentation,
      connectInstrumentation,
    ],
  });

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register({});
  return {
    log,
    connectInstrumentation,
    provider,
    tracer: opentelemetry.trace.getTracer('connect-example'),
  };
};
