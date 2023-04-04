import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BaseOpenTelemetryComponent } from '@opentelemetry/plugin-react-load';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export default (serviceName) => {
  const provider = new WebTracerProvider();
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  const exporter = new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  });

  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

  provider.register({
    contextManager: new ZoneContextManager(),
  });

  const tracer = provider.getTracer(serviceName);

  BaseOpenTelemetryComponent.setTracer(serviceName)

  return tracer;
}
