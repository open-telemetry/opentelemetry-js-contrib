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

import { context } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NestInstrumentation } from '../src';

process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http/dup';

export const instrumentation = new NestInstrumentation();
export const memoryExporter = new InMemorySpanExporter();

const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
});

export const tracer = provider.getTracer('test-nestjs-instrumentation');

instrumentation.setTracerProvider(provider);

export function enableInstrumentation() {
  const contextManager = new AsyncLocalStorageContextManager();
  context.setGlobalContextManager(contextManager.enable());
  instrumentation.setConfig({});
  instrumentation.enable();
  return contextManager;
}

export function disableInstrumentation() {
  memoryExporter.reset();
  context.disable();
  instrumentation.disable();
}
