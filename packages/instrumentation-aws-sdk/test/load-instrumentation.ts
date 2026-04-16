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
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { AwsInstrumentation } from '../src';

// This is a meagre testing of just a single value of
// OTEL_SEMCONV_STABILITY_OPT_IN, because testing multiple configurations of
// `AwsInstrumentation` in this all-in-one-process test setup is difficult.
process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http/dup,database/dup';

export const instrumentation = new AwsInstrumentation();
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
registerInstrumentationTesting(instrumentation);
