/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { InstrumentationBase } from '@opentelemetry/instrumentation';

const OTEL_TESTING_INSTRUMENTATION_SINGLETON = Symbol.for(
  'opentelemetry.testing.instrumentation_singleton'
);

type OTelInstrumentationSingletonGlobal = {
  [OTEL_TESTING_INSTRUMENTATION_SINGLETON]?: InstrumentationBase;
};
const _global = global as OTelInstrumentationSingletonGlobal;

export const getInstrumentation = <T extends InstrumentationBase>():
  | T
  | undefined => {
  return _global[OTEL_TESTING_INSTRUMENTATION_SINGLETON] as T;
};

export const registerInstrumentationTesting = <T extends InstrumentationBase>(
  instrumentation: T
): T => {
  const existing = getInstrumentation<T>();
  if (existing) {
    // we want to have just a single active instrumentation instance,
    // so in case we do, we disable the current one so it will not get any events
    instrumentation.disable();
    return existing;
  }
  _global[OTEL_TESTING_INSTRUMENTATION_SINGLETON] = instrumentation;
  return instrumentation;
};
