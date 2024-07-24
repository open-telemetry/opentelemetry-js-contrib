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
import { MutableRefObject, useEffect, useRef } from 'react';
import {
  trace,
  Tracer,
  TracerOptions,
  TracerProvider,
} from '@opentelemetry/api';
import { PACKAGE_NAME, PACKAGE_VERSION } from './../../version';

export type TracerRef = MutableRefObject<Tracer | null>;

const useTrace = (
  provider?: TracerProvider,
  tracerOptions?: TracerOptions
): TracerRef => {
  const tracerRef = useRef<Tracer | null>(null);

  // using the layout effect to make sure the tracer is initialized before the component is rendered
  useEffect(() => {
    if (tracerRef.current === null) {
      if (!provider) {
        console.info('No TracerProvider found. Using global tracer instead.');
      } else {
        console.info('TracerProvider. Using custom tracer.');
      }

      tracerRef.current = provider
        ? provider.getTracer(PACKAGE_NAME, PACKAGE_VERSION, tracerOptions)
        : // using global tracer provider
          trace.getTracer(PACKAGE_NAME, PACKAGE_VERSION);
    }

    // this is useful in cases where the provider is passed but it's still `null` or `undefined` (given a re-render or something specific of the lyfecycle of the app that implements the library)
    if (
      tracerRef.current !== null &&
      provider !== undefined &&
      provider !== null
    ) {
      tracerRef.current = provider.getTracer(
        PACKAGE_NAME,
        PACKAGE_VERSION,
        tracerOptions
      );

      console.info('Updated TracerProvider. Switching to the new instance.');
    }
  }, [provider, tracerOptions]);

  return tracerRef;
};

export default useTrace;
