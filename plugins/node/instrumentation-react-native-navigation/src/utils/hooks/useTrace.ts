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
import { MutableRefObject, useLayoutEffect, useRef } from 'react';
import { trace, Tracer, TracerProvider } from '@opentelemetry/api';

interface ConfigArgs {
  name: string;
  version: string;
}

export type TracerRef = MutableRefObject<Tracer | null>;

const useTrace = (config: ConfigArgs, provider?: TracerProvider): TracerRef => {
  const { name, version } = config;
  const tracerRef = useRef<Tracer | null>(null);

  // using the layout effect to make sure the tracer is initialized before the component is rendered
  useLayoutEffect(() => {
    if (tracerRef.current === null) {
      tracerRef.current = provider
        ? provider.getTracer(name, version)
        : trace.getTracer(name, version);
    }
  }, [name, provider, version]);

  return tracerRef;
};

export default useTrace;
