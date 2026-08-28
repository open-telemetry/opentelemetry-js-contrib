/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const {
  OTLPMetricExporter,
} = require('@opentelemetry/exporter-metrics-otlp-grpc');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-grpc');
const {
  MeterProvider,
  PeriodicExportingMetricReader,
} = require('@opentelemetry/sdk-metrics');
const {
  SimpleSpanProcessor,
  TracerProvider,
} = require('@opentelemetry/sdk-trace');

function configureTelemetry(instrumentation) {
  const tracerProvider = new TracerProvider({
    spanProcessors: [
      new SimpleSpanProcessor({ exporter: new OTLPTraceExporter() }),
    ],
  });
  const meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: 100,
      }),
    ],
  });
  instrumentation.setTracerProvider(tracerProvider);
  instrumentation.setMeterProvider(meterProvider);

  return async () => {
    await tracerProvider.forceFlush();
    await meterProvider.forceFlush();
    instrumentation.disable();
    await tracerProvider.shutdown();
    await meterProvider.shutdown();
  };
}

module.exports = { configureTelemetry };
