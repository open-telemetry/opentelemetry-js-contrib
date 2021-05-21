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
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { WebTracerProvider } from '@opentelemetry/web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import { Settings } from '../types';
import { EventEmitterSpanExporter } from '../utils/EventEmitterSpanExporter';

const configTag = document.getElementById('open-telemetry-instrumentation');
const { exporters }: Settings = configTag
  ? JSON.parse(String(configTag.dataset.config))
  : {};

const extensionId = configTag?.dataset.extensionId;

// Minimum required setup - supports only synchronous operations
const provider = new WebTracerProvider();

if (exporters.console.enabled) {
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
}

if (exporters.zipkin.enabled) {
  provider.addSpanProcessor(
    new BatchSpanProcessor(
      new ZipkinExporter({
        url: exporters.zipkin.url,
        serviceName: window.location.href,
      })
    )
  );
}

if (exporters.collectorTrace.enabled) {
  provider.addSpanProcessor(
    new BatchSpanProcessor(
      new CollectorTraceExporter({
        url: exporters.collectorTrace.url,
        serviceName: window.location.href,
      })
    )
  );
}

// This is not yet working, the idea is to submit spans to the background service worker
// and send spans to exporters from there to work around CSP without removing it completely.
if (exporters.background.enabled && extensionId) {
  const eventEmitterExporter = new EventEmitterSpanExporter();
  eventEmitterExporter.addEventListener('onSpans', ((event: CustomEvent) => {
    window.postMessage(
      {
        type: 'OTEL_EXTENSION_SPANS',
        extensionId,
        spans: JSON.stringify(event.detail),
      },
      window.location.protocol +
        '//' +
        window.location.hostname +
        ':' +
        window.location.port
    );
  }) as EventListener);
  provider.addSpanProcessor(new BatchSpanProcessor(eventEmitterExporter));
}

provider.register({
  contextManager: new ZoneContextManager(),
});

registerInstrumentations({
  instrumentations: [
    new DocumentLoadInstrumentation(),
    new FetchInstrumentation(),
    new XMLHttpRequestInstrumentation(),
  ],
  tracerProvider: provider,
});
