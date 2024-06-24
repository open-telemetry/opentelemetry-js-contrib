import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {ResourceTimingInstrumentation} from '@opentelemetry/instrumentation-resource-timing';
import {EventLoggerProvider} from '@opentelemetry/sdk-events';
import {LoggerProvider, SimpleLogRecordProcessor, ConsoleLogRecordExporter} from '@opentelemetry/sdk-logs';
import { events } from '@opentelemetry/api-events';

import {FetchInstrumentation} from '@opentelemetry/instrumentation-fetch2';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

const loggerProvider = new LoggerProvider({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'fetch-web-service',
  }),
});
const eventProvider = new EventLoggerProvider(loggerProvider);
loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()));
events.setGlobalEventLoggerProvider(eventProvider);


const tracerProvider = new WebTracerProvider({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'fetch-web-service'
  })
});
tracerProvider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
tracerProvider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter()));
tracerProvider.register({
  propagator: new W3CTraceContextPropagator()
});

registerInstrumentations({
  instrumentations: [
    new ResourceTimingInstrumentation(provider),
    new FetchInstrumentation({
      propagateTraceHeaderCorsUrls: [
        'http://localhost:8090',
      ],
    }),
  ],
  tracerProvider: tracerProvider,
});

