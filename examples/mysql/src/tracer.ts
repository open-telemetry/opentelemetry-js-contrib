'use strict';

import opentelemetry from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');

const EXPORTER = process.env.EXPORTER || '';

export const setupTracing = (serviceName: string) => {

  //metrics:
  const meterProvider = new MeterProvider()
  const metricExporter = new OTLPMetricExporter();
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 100,
    exportTimeoutMillis: 100,
  });
  meterProvider.addMetricReader(metricReader);

  //traces:
  const tracerProvider = new NodeTracerProvider({
    resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
  }),});

  if (EXPORTER.toLowerCase().startsWith('z')) {
    tracerProvider.addSpanProcessor(new SimpleSpanProcessor(new ZipkinExporter()));
  } else {
    tracerProvider.addSpanProcessor(new SimpleSpanProcessor(new JaegerExporter()));
  }

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
