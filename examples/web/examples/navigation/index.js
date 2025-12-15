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

const loggerProvider = new LoggerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'navigation-example-app',
  }),
});

loggerProvider.addLogRecordProcessor(
  new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())
);
loggerProvider.addLogRecordProcessor(
  new SimpleLogRecordProcessor(new OTLPLogExporter())
);
logs.setGlobalLoggerProvider(loggerProvider);

registerInstrumentations({
  instrumentations: [
    new BrowserNavigationInstrumentation({
      enabled: true,
      useNavigationApiIfAvailable: true,
      applyCustomLogRecordData: logRecord => {
        if (!logRecord.attributes) {
          logRecord.attributes = {};
        }
        // Add custom attributes to navigation events
        logRecord.attributes['app.feature'] = 'navigation-tracking';
      },
    }),
  ],
});

// Define routes and their content
const routes = {
  '/navigation/route1':
    '<h2>Welcome to Route 1</h2><p>This is the content for Route 1.</p>',
  '/navigation/route2':
    '<h2>Welcome to Route 2</h2><p>This is the content for Route 2.</p>',
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
  const routeContent =
    routes[path] ||
    '<h2>Navigation Example</h2><p>Use the buttons above to test different navigation events.</p>';
  document.getElementById('content').innerHTML = routeContent;
}

// Attach event listeners to navigation links

const attachEventListenersToLinks = () => {
  document.querySelectorAll('a[data-link]').forEach(link => {
    console.log('attach event listener to link', link.href);
    link.addEventListener('click', event => {
      console.log('Link clicked', event.target.href);
      event.preventDefault();
      navigateTo(event.target.href);
    });
  });
};

// Hash change functionality
let hashCounter = 0;
function testHashChange() {
  hashCounter++;
  const newHash = `section-${hashCounter}`;
  location.hash = newHash;

  document.getElementById('hash-content').innerHTML = `<div class="nav-result">
      <h4>🔗 Hash Navigation</h4>
      <p><strong>New Hash:</strong> <code>#${newHash}</code></p>
      <p><strong>Method:</strong> location.hash assignment</p>
      <p><strong>Expected Instrumentation:</strong></p>
      <ul>
        <li>✓ same_document: true</li>
        <li>✓ hash_change: true</li>
        <li>✓ type: traverse or push</li>
      </ul>
      <p class="console-note">📊 Check console for navigation events!</p>
    </div>`;
}

// Back button functionality
function goBack() {
  if (window.history.length > 1) {
    window.history.back();

    // Update content to show back navigation happened
    setTimeout(() => {
      const contentDiv = document.getElementById('content') || document.body;
      const backIndicator = document.createElement('div');
      backIndicator.className = 'nav-result';
      // Create elements safely to avoid XSS
      const resultDiv = document.createElement('div');
      resultDiv.className = 'nav-result';

      const title = document.createElement('h4');
      title.textContent = '⬅️ Back Navigation';

      const method = document.createElement('p');
      method.innerHTML = '<strong>Method:</strong> history.back()';

      const urlPara = document.createElement('p');
      urlPara.innerHTML = '<strong>Current URL:</strong> <code></code>';
      urlPara.querySelector('code').textContent = location.href; // Safe text assignment

      const expectedTitle = document.createElement('p');
      expectedTitle.innerHTML = '<strong>Expected Instrumentation:</strong>';

      const list = document.createElement('ul');
      list.innerHTML = `
        <li>✓ same_document: true</li>
        <li>✓ hash_change: depends on URL change</li>
        <li>✓ type: traverse</li>
      `;

      const consoleNote = document.createElement('p');
      consoleNote.className = 'console-note';
      consoleNote.textContent = '📊 Check console for navigation events!';

      resultDiv.appendChild(title);
      resultDiv.appendChild(method);
      resultDiv.appendChild(urlPara);
      resultDiv.appendChild(expectedTitle);
      resultDiv.appendChild(list);
      resultDiv.appendChild(consoleNote);

      backIndicator.appendChild(resultDiv);
      contentDiv.appendChild(backIndicator);

      // Remove the indicator after 5 seconds
      setTimeout(() => backIndicator.remove(), 5000);
    }, 100);
  } else {
    alert('No history to go back to!');
  }
}

// Navigation API navigate functionality
let navApiCounter = 0;

function testNavigationApiHash() {
  navApiCounter++;
  // Only change the hash part
  const url = new URL(window.location);
  url.hash = `nav-api-section-${navApiCounter}`;
  testNavigationApiRoute(url.href, 'Hash Navigation');
}

function testNavigationApiRoute(route, navigationType) {
  try {
    // Check if Navigation API is available
    const hasNavigationAPI = 'navigation' in window;
    if (hasNavigationAPI) {
      // Access Navigation API through bracket notation to avoid linting issues
      const nav = window['navigation'];
      const activation = nav['activation'];

      // Log current navigation.activation.navigationType before navigation
      console.log('🧭 Before Navigation API navigate():', {
        currentNavigationType: activation?.navigationType,
        targetRoute: route,
        method: navigationType,
      });

      // Use Navigation API navigate method
      nav['navigate'](route);

      // Log navigation.activation.navigationType after navigation
      setTimeout(() => {
        const currentActivation = nav['activation'];
        console.log('🧭 After Navigation API navigate():', {
          newNavigationType: currentActivation?.navigationType,
          currentUrl: location.href,
          expectedInstrumentation: {
            'browser.navigation.type':
              currentActivation?.navigationType || 'push',
          },
        });
      }, 50);
    } else {
      // Fallback to history API for browsers without Navigation API
      console.log(
        '🧭 Navigation API not available, using history API fallback'
      );
      if (navigationType === 'replace') {
        history.replaceState({}, '', route);
      } else {
        history.pushState({}, '', route);
      }
    }

    // Update content after navigation
    setTimeout(() => {
      const contentElement = document.getElementById('nav-api-content');

      // Create elements safely to avoid XSS
      const resultDiv = document.createElement('div');
      resultDiv.className = 'nav-result';

      const title = document.createElement('h4');
      title.textContent = `✅ ${navigationType} Completed`;

      const targetPara = document.createElement('p');
      targetPara.innerHTML = '<strong>Target:</strong> <code></code>';
      targetPara.querySelector('code').textContent = route; // Safe text assignment

      const urlPara = document.createElement('p');
      urlPara.innerHTML = '<strong>Current URL:</strong> <code></code>';
      urlPara.querySelector('code').textContent = window.location.href; // Safe text assignment

      const apiPara = document.createElement('p');
      apiPara.innerHTML =
        '<strong>Navigation API:</strong> ' +
        ('navigation' in window ? 'Supported ✓' : 'Not Available ❌');

      const button = document.createElement('button');
      button.id = 'navApiHashBtn';
      button.style.display = 'none';
      button.textContent = 'Nav API: Hash';

      const consoleNote = document.createElement('p');
      consoleNote.className = 'console-note';
      consoleNote.textContent =
        '📊 Check console for detailed navigation events and instrumentation data!';

      resultDiv.appendChild(title);
      resultDiv.appendChild(targetPara);
      resultDiv.appendChild(urlPara);
      resultDiv.appendChild(apiPara);
      resultDiv.appendChild(button);
      resultDiv.appendChild(consoleNote);

      contentElement.innerHTML = ''; // Clear existing content
      contentElement.appendChild(resultDiv);
    }, 100);
  } catch (error) {
    console.error(`❌ Navigation API error for ${navigationType}:`, error);
    // Fallback to history API
    const fallbackRoute = route.startsWith('#')
      ? route
      : `?fallback=${Date.now()}`;
    history.pushState({}, '', fallbackRoute);

    // Create error content safely
    const contentElement = document.getElementById('nav-api-content');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'nav-result error';

    const title = document.createElement('h4');
    title.textContent = '⚠️ Navigation API Failed';

    const fallbackPara = document.createElement('p');
    fallbackPara.innerHTML = '<strong>Fallback used:</strong> <code></code>';
    fallbackPara.querySelector('code').textContent = fallbackRoute;

    const errorPara = document.createElement('p');
    errorPara.innerHTML = '<strong>Error:</strong> ';
    const errorSpan = document.createElement('span');
    errorSpan.textContent = error.message;
    errorPara.appendChild(errorSpan);

    errorDiv.appendChild(title);
    errorDiv.appendChild(fallbackPara);
    errorDiv.appendChild(errorPara);

    contentElement.innerHTML = '';
    contentElement.appendChild(errorDiv);
  }
}

window.addEventListener('popstate', handleRouteChange);

// Add event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  attachEventListenersToLinks();

  // Hash change button
  document
    .getElementById('hashChangeBtn')
    .addEventListener('click', testHashChange);

  // Back button
  document.getElementById('backBtn').addEventListener('click', goBack);

  // Navigation API hash button - only show if Navigation API is available
  const navApiHashBtn = document.getElementById('navApiHashBtn');
  if ('navigation' in window) {
    navApiHashBtn.addEventListener('click', testNavigationApiHash);
  } else {
    navApiHashBtn.style.display = 'none';
  }
});

const loadTimeSetup = () => {
  handleRouteChange();
};
window.addEventListener('load', loadTimeSetup);
