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
