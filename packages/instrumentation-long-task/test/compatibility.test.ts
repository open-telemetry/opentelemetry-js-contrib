/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { trace } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import * as tracing from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { LongTaskInstrumentation } from '../src';
import { DummySpanExporter } from './util';

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
