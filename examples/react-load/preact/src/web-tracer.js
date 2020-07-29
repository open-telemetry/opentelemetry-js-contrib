import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { WebTracerProvider } from '@opentelemetry/web';
import { BaseOpenTelemetryComponent } from '@opentelemetry/plugin-react-load';
import { ZoneContextManager } from '@opentelemetry/context-zone';

export default (serviceName) => {
    const provider = new WebTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

    provider.register({
    contextManager: new ZoneContextManager(),
    });

    const tracer = provider.getTracer(serviceName);

    BaseOpenTelemetryComponent.setTracer(serviceName)
    BaseOpenTelemetryComponent.setLogger(provider.logger)

    return tracer;
}
