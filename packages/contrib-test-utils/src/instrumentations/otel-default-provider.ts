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
  NodeTracerProvider,
  NodeTracerConfig,
} from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  getTestMemoryExporter,
  setTestMemoryExporter,
} from './otel-provider-api';

export const registerInstrumentationTestingProvider = (
  config?: NodeTracerConfig
): NodeTracerProvider => {
  const spanProcessors = config?.spanProcessors
    ? [...config.spanProcessors]
    : [];

  setTestMemoryExporter(new InMemorySpanExporter());

  spanProcessors.push(new SimpleSpanProcessor(getTestMemoryExporter()!));

  if (process.env.OTEL_EXPORTER_JAEGER_AGENT_HOST) {
    spanProcessors.push(new SimpleSpanProcessor(new JaegerExporter()));
  }

  const otelTestingProvider = new NodeTracerProvider({
    ...config,
    spanProcessors,
  });

  otelTestingProvider.register();
  return otelTestingProvider;
};
