/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Because all tests in this folder are run in the same process, if instantiating
 * instrumentation within tests with different configurations such as metrics support,
 * it can be difficult to ensure the correct instrumentation is applied during the
 * specific test. We instead instantiate a single instrumentation instance here to
 * use within all tests.
 */
import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { OpenAIInstrumentation } from '../src';

export const instrumentation = new OpenAIInstrumentation();
export const metricExporter = new InMemoryMetricExporter(
  AggregationTemporality.DELTA
);
export const meterProvider = new MeterProvider({
  readers: [
    new PeriodicExportingMetricReader({
      exporter: metricExporter,
    }),
  ],
});
instrumentation.setMeterProvider(meterProvider);

export const logsExporter = new InMemoryLogRecordExporter();
export const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(logsExporter)],
});
instrumentation.setLoggerProvider(loggerProvider);

registerInstrumentationTesting(instrumentation);
instrumentation.disable();

export const contentCaptureInstrumentation = new OpenAIInstrumentation({
  captureMessageContent: true,
});
contentCaptureInstrumentation.setMeterProvider(meterProvider);
contentCaptureInstrumentation.setLoggerProvider(loggerProvider);
contentCaptureInstrumentation.disable();
