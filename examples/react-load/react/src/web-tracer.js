import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BaseOpenTelemetryComponent } from '@opentelemetry/plugin-react-load';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector';
const opentelemetry = require('@opentelemetry/api');
const { diag, DiagConsoleLogger } = opentelemetry;

export default (serviceName) => {
  const provider = new WebTracerProvider();

  const exporter = new CollectorTraceExporter({
    url: 'http://localhost:55678/v1/trace',
  });

  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

  provider.register({
    contextManager: new ZoneContextManager(),
  });

  const tracer = provider.getTracer(serviceName);
  
  BaseOpenTelemetryComponent.setTracer(serviceName)
  diag.setLogger(new DiagConsoleLogger());

  return tracer;
}
