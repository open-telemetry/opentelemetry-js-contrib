import { context, trace } from '@opentelemetry/api';
import { events } from '@opentelemetry/api-events';
import { EventLoggerProvider } from '@opentelemetry/sdk-events';
import { LoggerProvider,SimpleLogRecordProcessor,ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { PageViewInstrumentation } from "@opentelemetry/instrumentation-page-view";

const loggerProvider = new LoggerProvider({resource: new Resource({[SEMRESATTRS_SERVICE_NAME]: 'web-service-dl'})});

loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()));
loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(new OTLPLogExporter()));
const eventLoggerProvider = new EventLoggerProvider(loggerProvider);
events.setGlobalEventLoggerProvider(eventLoggerProvider);

registerInstrumentations({
  instrumentations: [
    new PageViewInstrumentation({enabled:false})
  ],
});

// Define routes and their content
const routes = {
  '/page-view/route1': '<h2>Welcome to Route 1</h2><p>This is the content for Route 1.</p>',
  '/page-view/route2': '<h2>Welcome to Route 2</h2><p>This is the content for Route 2.</p>'
};

// Function to navigate to a route
function navigateTo(url) {
  console.log('Navigating to', url);
  history.pushState(null, null, url);
  handleRouteChange();
}

// Function to handle the route change
function handleRouteChange() {
  const path = window.location.pathname; // Get current path
  const routeContent = routes[path] || `<h2>Not on Route </h2>`;
  document.getElementById('content').innerHTML = routeContent;
}

// Attach event listeners to navigation links

const attachEventListenersToLinks = () => {
  document.querySelectorAll('a[data-link]').forEach(link => {
    console.log('attach event listener to link', link.href)
    link.addEventListener('click', (event) => {
      console.log('Link clicked', event.target.href)
      event.preventDefault();
      navigateTo(event.target.href);
    });
  });
}

window.addEventListener('popstate', handleRouteChange);
const loadTimeSetup = () => {
  handleRouteChange();
  attachEventListenersToLinks();
}
window.addEventListener('load', loadTimeSetup);
