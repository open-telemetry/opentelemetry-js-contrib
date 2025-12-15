import React from 'react';
import ReactDOM from 'react-dom/client';
import { logs } from '@opentelemetry/api-logs';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  ConsoleLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { BrowserNavigationInstrumentation } from '@opentelemetry/instrumentation-browser-navigation';
import App from './src/App';

// Initialize OpenTelemetry logging
const loggerProvider = new LoggerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'react-spa-navigation-demo',
  }),
});

// Add console exporter for development
loggerProvider.addLogRecordProcessor(
  new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())
);

// Add OTLP HTTP exporter to send logs to server
loggerProvider.addLogRecordProcessor(
  new SimpleLogRecordProcessor(
    new OTLPLogExporter({
      url: 'http://localhost:4318/v1/logs', // Standard OTLP endpoint
      headers: {
        'Content-Type': 'application/json',
      },
    })
  )
);

// Set the global logger provider
logs.setGlobalLoggerProvider(loggerProvider);

// Register the browser navigation instrumentation
registerInstrumentations({
  instrumentations: [
    new BrowserNavigationInstrumentation({
      enabled: true,
      useNavigationApiIfAvailable: true, // Re-enable Navigation API
      applyCustomLogRecordData: logRecord => {
        if (!logRecord.attributes) {
          logRecord.attributes = {};
        }
        // Add custom attributes to navigation events
        logRecord.attributes['app.type'] = 'react-spa';
        logRecord.attributes['app.framework'] = 'react';
        logRecord.attributes['app.version'] = '1.0.0';

        // Add timestamp for better tracking
        logRecord.attributes['navigation.timestamp'] = Date.now();
      },
    }),
  ],
});

// Create React root and render the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
