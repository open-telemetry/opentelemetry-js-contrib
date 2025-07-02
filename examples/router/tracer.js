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
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE);

const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const {
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require('@opentelemetry/sdk-trace-base');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');

const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const {
  RouterInstrumentation,
} = require('@opentelemetry/instrumentation-router');

const Exporter = (exporterParam => {
  if (typeof exporterParam === 'string') {
    const exporterString = exporterParam.toLowerCase();
    if (exporterString.startsWith('z')) {
      return ZipkinExporter;
    }
    if (exporterString.startsWith('j')) {
      return JaegerExporter;
    }
  }
  return ConsoleSpanExporter;
})(process.env.EXPORTER);

module.exports = serviceName => {
  const exporter = new Exporter({
    serviceName,
  });

  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [HttpInstrumentation, RouterInstrumentation],
  });

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  provider.register();

  return opentelemetry.trace.getTracer('router-example');
};
