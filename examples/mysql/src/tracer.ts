'use strict';

import opentelemetry from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');

const EXPORTER = process.env.EXPORTER || '';

export const setupTracing = (serviceName: string) => {

  //metrics:
  const metricExporter = new OTLPMetricExporter();
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 100,
    exportTimeoutMillis: 100,
  });
  const meterProvider = new MeterProvider({
    readers: [metricReader],
  });

  //traces:
  const spanProcessors: SpanProcessor[] = [];

  if (EXPORTER.toLowerCase().startsWith('z')) {
    spanProcessors.push(new SimpleSpanProcessor(new ZipkinExporter()));
  }

  const tracerProvider = new NodeTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    spanProcessors,
  });

  // Initialize the OpenTelemetry APIs to use the NodeTracerProvider bindings
  tracerProvider.register();

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation(),
      new MySQLInstrumentation(),
    ],
    tracerProvider: tracerProvider,
    meterProvider: meterProvider,
  });

  return opentelemetry.trace.getTracer('mysql-example');
};
