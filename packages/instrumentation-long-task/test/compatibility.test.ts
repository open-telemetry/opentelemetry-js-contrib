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
import { trace } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import * as tracing from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { LongTaskInstrumentation } from '../src';
import { DummySpanExporter } from './util';

/* eslint-disable node/no-unsupported-features/es-builtins */
const _globalThis: typeof globalThis =
  typeof globalThis === 'object'
    ? globalThis
    : typeof self === 'object'
    ? self
    : typeof window === 'object'
    ? window
    : typeof global === 'object'
    ? global
    : ({} as typeof globalThis);
/* eslint-enable node/no-unsupported-features/es-builtins */

describe("LongTaskInstrumentation doesn't throw in unsupported environments", () => {
  let webTracerProvider: WebTracerProvider;
  let dummySpanExporter: DummySpanExporter;

  before(() => {
    dummySpanExporter = new DummySpanExporter();
    webTracerProvider = new WebTracerProvider({
      spanProcessors: [new tracing.SimpleSpanProcessor(dummySpanExporter)],
    });
    webTracerProvider.register();
  });

  after(() => {
    trace.disable();
  });

  // Do cleanup for environment changes here so even with test fails won't affect other tests
  const perfObsDesc = Object.getOwnPropertyDescriptor(
    _globalThis,
    'PerformanceObserver'
  );
  const supportedDesc = Object.getOwnPropertyDescriptor(
    PerformanceObserver,
    'supportedEntryTypes'
  );
  afterEach(() => {
    Object.defineProperty(_globalThis, 'PerformanceObserver', perfObsDesc!);
    Object.defineProperty(
      PerformanceObserver,
      'supportedEntryTypes',
      supportedDesc!
    );
  });

  // tests based on different browser targets in
  // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver#browser_compatibility
  it('No support for PerformanceObserver', async () => {
    // @ts-expect-error Non-optional in types
    delete _globalThis.PerformanceObserver;

    const longTaskInstrumentation = new LongTaskInstrumentation({
      enabled: false,
    });

    const deregister = registerInstrumentations({
      instrumentations: [longTaskInstrumentation],
    });

    deregister();
  });

  it('No supportedEntryTypes', async () => {
    // @ts-expect-error Non-optional in types
    delete PerformanceObserver.supportedEntryTypes;

    const longTaskInstrumentation = new LongTaskInstrumentation({
      enabled: false,
    });

    const deregister = registerInstrumentations({
      instrumentations: [longTaskInstrumentation],
    });

    deregister();
  });

  it('longtask not supported', async () => {
    Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', {
      get() {
        return [];
      },
      configurable: true,
      enumerable: false,
    });

    const longTaskInstrumentation = new LongTaskInstrumentation({
      enabled: false,
    });

    const deregister = registerInstrumentations({
      instrumentations: [longTaskInstrumentation],
    });

    deregister();
  });
});
