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
