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
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const {
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} = require('@opentelemetry/sdk-trace-base');
const { HttpTraceContextPropagator } = require('@opentelemetry/core');
const {
  GrpcCensusPropagator,
} = require('@opentelemetry/propagator-grpc-census-binary');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { GrpcInstrumentation } = require('@opentelemetry/instrumentation-grpc');

/**
 * Return an OpenTelemetry tracer configured to use the gRPC plugin and with the
 * requested propagator
 */
module.exports = (serviceName, binaryPropagator) => {
  const provider = new NodeTracerProvider({
    spanProcessors: [
      // It is recommended to use `BatchSpanProcessor` for better performance
      // and optimization, especially in production.
      new SimpleSpanProcessor(new ConsoleSpanExporter()),
    ],
  });

  if (binaryPropagator) {
    // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
    provider.register({
      propagator: new GrpcCensusPropagator(),
    });
  } else {
    provider.register({
      propagator: new HttpTraceContextPropagator(),
    });
  }

  registerInstrumentations({
    instrumentations: [new GrpcInstrumentation()],
  });

  return opentelemetry.trace.getTracer(serviceName);
};
