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
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { OTLPTraceExporter as OTLPHttpTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  Exporters,
  ExporterType,
  InstrumentationConfiguration,
  InstrumentationType,
} from '../types';

export class WebInstrumentation {
  withZoneContextManager: boolean;
  provider: WebTracerProvider;
  exporters: Exporters;
  logger: Console;
  instrumentations: {
    [InstrumentationType.DOCUMENT_LOAD]: { enabled: boolean };
    [InstrumentationType.FETCH]: { enabled: boolean };
    [InstrumentationType.XML_HTTP_REQUEST]: { enabled: boolean };
    [InstrumentationType.USER_INTERACTION]: { enabled: boolean };
  };
  constructor(
    config: InstrumentationConfiguration,
    provider: WebTracerProvider,
    logger: Console
  ) {
    this.exporters = config.exporters;
    this.instrumentations = config.instrumentations;
    this.provider = provider;
    this.withZoneContextManager = config.withZoneContextManager;
    this.logger = logger;
  }

  addExporters() {
    if (this.exporters[ExporterType.CONSOLE].enabled) {
      this.logger.info(
        '[otel-extension] Logging spans to the console with ConsoleSpanExporter'
      );
      this.provider.addSpanProcessor(
        new SimpleSpanProcessor(new ConsoleSpanExporter())
      );
    }

    if (this.exporters[ExporterType.ZIPKIN].enabled) {
      const options = this.exporters[ExporterType.ZIPKIN].url
        ? {
            url: this.exporters[ExporterType.ZIPKIN].url,
          }
        : {};
      this.logger.info(
        '[otel-extension] Logging spans to the console with ZipkinExporter(',
        options,
        ')'
      );
      this.provider.addSpanProcessor(
        new BatchSpanProcessor(new ZipkinExporter(options))
      );
    }

    if (this.exporters[ExporterType.TRACE_OTLP_HTTP].enabled) {
      const options = this.exporters[ExporterType.TRACE_OTLP_HTTP].url
        ? {
            url: this.exporters[ExporterType.TRACE_OTLP_HTTP].url,
          }
        : {};
      this.logger.info(
        '[otel-extension] Logging spans to the console with OTLPHttpTraceExporter(',
        options,
        ')'
      );
      this.provider.addSpanProcessor(
        new BatchSpanProcessor(new OTLPHttpTraceExporter(options))
      );
    }
  }

  registerInstrumentations() {
    const instrumentations = [];

    if (this.instrumentations[InstrumentationType.DOCUMENT_LOAD].enabled) {
      instrumentations.push(new DocumentLoadInstrumentation());
    }

    if (this.instrumentations[InstrumentationType.FETCH].enabled) {
      instrumentations.push(new FetchInstrumentation());
    }

    if (this.instrumentations[InstrumentationType.XML_HTTP_REQUEST].enabled) {
      instrumentations.push(new XMLHttpRequestInstrumentation());
    }

    if (this.instrumentations[InstrumentationType.USER_INTERACTION].enabled) {
      instrumentations.push(new UserInteractionInstrumentation());
    }

    registerInstrumentations({
      instrumentations,
      tracerProvider: this.provider,
    });
  }

  register() {
    this.addExporters();

    if (this.withZoneContextManager) {
      this.provider.register({
        contextManager: new ZoneContextManager(),
      });
    }

    this.registerInstrumentations();
  }
}
