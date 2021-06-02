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
import { DomAttributes, DomElements, ExporterType, Settings } from '../types';

const configTag = document.getElementById(DomElements['CONFIG_TAG']);
const { exporters }: Settings = configTag
  ? JSON.parse(String(configTag.dataset[DomAttributes['CONFIG']]))
  : {};

const provider = new WebTracerProvider();

if (exporters[ExporterType.CONSOLE].enabled) {
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
}

if (exporters[ExporterType.ZIPKIN].enabled) {
  provider.addSpanProcessor(
    new BatchSpanProcessor(
      new ZipkinExporter({
        url: exporters[ExporterType.ZIPKIN].url,
        serviceName: window.location.href,
      })
    )
  );
}

if (exporters[ExporterType.COLLECTOR_TRACE].enabled) {
  provider.addSpanProcessor(
    new BatchSpanProcessor(
      new CollectorTraceExporter({
        url: exporters[ExporterType.COLLECTOR_TRACE].url,
        serviceName: window.location.href,
      })
    )
  );
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
