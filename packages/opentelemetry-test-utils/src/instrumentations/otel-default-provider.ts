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
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import {
  NodeTracerConfig,
  NodeTracerProvider,
} from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  getTestMemoryMetricsExporter,
  getTestMemorySpanExporter,
  setTestMetricsMemoryExporter,
  setTestMemorySpanExporter,
} from './otel-provider-api';

import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  MeterProviderOptions,
} from '@opentelemetry/sdk-metrics';

import { metrics } from '@opentelemetry/api-metrics';
import { TestMetricReader } from '../TestMetricReader';

export type OTelProviders = {
  traceProvider: NodeTracerProvider;
  meterProvider: MeterProvider;
};

export const registerInstrumentationTestingProvider = (
  tracerConfig?: NodeTracerConfig,
  meterConfig?: MeterProviderOptions
): OTelProviders => {
  const otelTestingTraceProvider = new NodeTracerProvider(tracerConfig);
  const otelTestingMeterProvider = new MeterProvider(meterConfig);

  setTestMemorySpanExporter(new InMemorySpanExporter());
  setTestMetricsMemoryExporter(
    new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
  );

  otelTestingTraceProvider.addSpanProcessor(
    new SimpleSpanProcessor(getTestMemorySpanExporter()!)
  );

  const meterReader = new TestMetricReader(getTestMemoryMetricsExporter()!);

  otelTestingMeterProvider.addMetricReader(meterReader);

  if (process.env.OTEL_EXPORTER_JAEGER_AGENT_HOST) {
    otelTestingTraceProvider.addSpanProcessor(
      new SimpleSpanProcessor(new JaegerExporter())
    );
  }

  otelTestingTraceProvider.register();
  metrics.setGlobalMeterProvider(otelTestingMeterProvider);

  return {
    traceProvider: otelTestingTraceProvider,
    meterProvider: otelTestingMeterProvider,
  };
};
