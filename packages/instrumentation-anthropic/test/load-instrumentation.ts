/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { AnthropicInstrumentation } from '../src';

export const instrumentation = new AnthropicInstrumentation();
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
instrumentation.disable();
