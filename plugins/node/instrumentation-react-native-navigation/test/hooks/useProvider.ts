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
import { useCallback, useEffect, useRef } from 'react';
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

/**
 * Example of a Span:
    {
        "resource": {
            "attributes": {
                "service.name": "unknown_service",
                "telemetry.sdk.language": "nodejs",
                "telemetry.sdk.name": "opentelemetry",
                "telemetry.sdk.version": "1.24.1"
            }
        },
        "traceId": "5cdeae1beab7108c77fa52b5aab30d22",
        "name": "index",
        "id": "4ee77c180c6f1027",
        "kind": 0,
        "timestamp": 1717536927797000,
        "duration": 2820542.167,
        "attributes": {
            "launch": true,
            "state.end": 'active'
        },
        "status": {
            "code": 0
        },
        "events": [],
        "links": []
    }
 */
const useProvider = (shouldShutDown = false) => {
  const provider = useRef(new BasicTracerProvider());

  const configure = useCallback(() => {
    const exporter = new ConsoleSpanExporter();
    const processor = new SimpleSpanProcessor(exporter);

    provider.current.addSpanProcessor(processor);
    provider.current.register();
  }, []);

  useEffect(() => {
    const providerRef = provider.current;

    try {
      configure();
    } catch (e) {
      console.warn('Provider was not initialized', e);
    }

    return () => {
      const shutdown = async () => {
        if (shouldShutDown) {
          // this is important if we are creating more than one instance of a Provider
          await providerRef.shutdown();
        }
      };

      shutdown();
    };
  }, [configure, shouldShutDown]);

  return provider;
};

export default useProvider;
