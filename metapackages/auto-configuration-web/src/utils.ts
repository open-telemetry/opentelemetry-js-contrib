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

import { ContextManager, TextMapPropagator } from '@opentelemetry/api';
import { events } from '@opentelemetry/api-events';
import {
  Instrumentation,
  registerInstrumentations,
} from '@opentelemetry/instrumentation';
import {
  DetectorSync,
  detectResourcesSync,
  IResource,
  Resource,
  ResourceDetectionConfig,
  browserDetector as processRuntimeBrowserDetector,
} from '@opentelemetry/resources';
import { EventLoggerProvider } from '@opentelemetry/sdk-events';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
  LoggerProviderConfig,
  LogRecordExporter,
  LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  BatchSpanProcessor,
  SpanExporter,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  WebTracerConfig,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { browserDetector } from '@opentelemetry/opentelemetry-browser-detector';

export interface ResourceConfiguration {
  serviceName?: string;
  resource?: IResource;
  detectors?: DetectorSync[];
}

export interface TraceSDKConfiguration {
  tracerConfig?: WebTracerConfig;
  contextManager?: ContextManager;
  textMapPropagator?: TextMapPropagator;
  spanProcessors?: SpanProcessor[];
  spanExporter?: SpanExporter;
  resource?: Resource;
}

export interface EventSDKConfiguration {
  loggerProviderConfig?: LoggerProviderConfig;
  logRecordProcessors?: LogRecordProcessor[];
  logRecordExporter?: LogRecordExporter;
  resource?: Resource;
}

export function configureWebSDK(
  config: TraceSDKConfiguration & EventSDKConfiguration,
  instrumentations: Instrumentation[]
) {
  registerInstrumentations({
    instrumentations: instrumentations,
  });

  const traceSdkShutdown = configureTraceSDK(config);
  const eventSdkShutdown = configureEventsSDK(config);

  return () => {
    return Promise.all([traceSdkShutdown(), eventSdkShutdown()]);
  };
}

export function getResource(config?: ResourceConfiguration): Resource {
  let resource = config?.resource ?? new Resource({});
  const detectors = config?.detectors ?? [
    processRuntimeBrowserDetector,
    browserDetector,
  ];

  if (detectors) {
    const internalConfig: ResourceDetectionConfig = {
      detectors: detectors,
    };
    resource = resource.merge(detectResourcesSync(internalConfig));
  }

  resource =
    config?.serviceName === undefined
      ? resource
      : resource.merge(
          new Resource({
            [ATTR_SERVICE_NAME]: config.serviceName,
          })
        );

  return resource;
}

export function configureTraceSDK(
  config?: TraceSDKConfiguration,
  instrumentations?: Instrumentation[]
) {
  if (!config || (!config.spanProcessors && !config?.spanExporter)) {
    return () => {
      return Promise.resolve();
    };
  }

  if (instrumentations) {
    registerInstrumentations({
      instrumentations: instrumentations,
    });
  }

  const tracerConfig = {
    ...config?.tracerConfig,
  };
  if (!tracerConfig.resource && config.resource) {
    tracerConfig.resource = config.resource;
  }
  const tracerProvider = new WebTracerProvider(tracerConfig);

  const processors = config.spanProcessors ?? [
    new BatchSpanProcessor(config.spanExporter!),
  ];

  for (const processor of processors) {
    tracerProvider.addSpanProcessor(processor);
  }

  tracerProvider.register({
    contextManager: config?.contextManager,
    propagator: config?.textMapPropagator,
  });

  return () => {
    return tracerProvider.shutdown();
  };
}

export function configureEventsSDK(
  config?: EventSDKConfiguration,
  instrumentations?: Instrumentation[]
) {
  if (!config || (!config.logRecordProcessors && !config?.logRecordExporter)) {
    return () => {
      return Promise.resolve();
    };
  }

  if (instrumentations) {
    registerInstrumentations({
      instrumentations: instrumentations,
    });
  }

  const loggerProviderConfig = {
    ...config?.loggerProviderConfig,
  };
  if (!loggerProviderConfig.resource && config.resource) {
    loggerProviderConfig.resource = config.resource;
  }
  const loggerProvider = new LoggerProvider(loggerProviderConfig);

  const processors = config.logRecordProcessors ?? [
    new BatchLogRecordProcessor(config.logRecordExporter!),
  ];

  for (const processor of processors) {
    loggerProvider.addLogRecordProcessor(processor);
  }

  const eventLoggerProvider = new EventLoggerProvider(loggerProvider);
  events.setGlobalEventLoggerProvider(eventLoggerProvider);

  return () => {
    return loggerProvider.shutdown();
  };
}
