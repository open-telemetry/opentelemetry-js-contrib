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
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { BrowserNavigationInstrumentation } from '@opentelemetry/instrumentation-browser-navigation';

const loggerProvider = new LoggerProvider({
  resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: 'web-service-dl' }),
});

loggerProvider.addLogRecordProcessor(
  new SimpleLogRecordProcessor(new ConsoleLogRecordExporter())
);
loggerProvider.addLogRecordProcessor(
  new SimpleLogRecordProcessor(new OTLPLogExporter())
);
logs.setGlobalLoggerProvider(loggerProvider);

registerInstrumentations({
  instrumentations: [new BrowserNavigationInstrumentation({ 
    enabled: true,
    useNavigationApiIfAvailable: true,
    applyCustomLogRecordData: (logRecord) => {
      if (!logRecord.attributes) {
        logRecord.attributes = {};
      }
      logRecord.attributes['customattrid'] = 'customattrValue';
    }
  })],
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
  const routeContent = routes[path] || '<h2>Navigation Example</h2><p>Use the buttons above to test different navigation events.</p>';
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
  
  document.getElementById('hash-content').innerHTML = 
    `<div class="nav-result">
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
      backIndicator.innerHTML = 
        `<div class="nav-result">
          <h4>⬅️ Back Navigation</h4>
          <p><strong>Method:</strong> history.back()</p>
          <p><strong>Current URL:</strong> <code>${location.href}</code></p>
          <p><strong>Expected Instrumentation:</strong></p>
          <ul>
            <li>✓ same_document: true</li>
            <li>✓ hash_change: depends on URL change</li>
            <li>✓ type: traverse</li>
          </ul>
          <p class="console-note">📊 Check console for navigation events!</p>
        </div>`;
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
  if ('navigation' in window) {
    try {
      // Log current navigation.activation.navigationType before navigation
      console.log('🧭 Before Navigation API navigate():', {
        currentNavigationType: window.navigation.activation?.navigationType,
        targetRoute: route,
        method: navigationType
      });
      
      // Use Navigation API navigate method
      window.navigation.navigate(route);
      
      // Log navigation.activation.navigationType after navigation
      setTimeout(() => {
        console.log('🧭 After Navigation API navigate():', {
          newNavigationType: window.navigation.activation?.navigationType,
          currentUrl: location.href,
          expectedInstrumentation: {
            'browser.navigation.type': window.navigation.activation?.navigationType || 'push'
          }
        });
      }, 50);
      
      // Update content after navigation
      setTimeout(() => {
        document.getElementById('nav-api-content').innerHTML = 
          `<div class="nav-result">
            <h4>✅ ${navigationType} Completed</h4>
            <p><strong>Target:</strong> <code>${route}</code></p>
            <p><strong>Current URL:</strong> <code>${window.location.href}</code></p>
            <p><strong>Navigation API:</strong> Supported ✓</p>
            <button id="navApiHashBtn" style="display: none;">Nav API: Hash</button>
            <p class="console-note">📊 Check console for detailed navigation events and instrumentation data!</p>
          </div>`;
      }, 100);
      
    } catch (error) {
      console.error(`❌ Navigation API error for ${navigationType}:`, error);
      // Fallback to history API
      const fallbackRoute = route.startsWith('#') ? route : `?fallback=${Date.now()}`;
      history.pushState({}, '', fallbackRoute);
      document.getElementById('nav-api-content').innerHTML = 
       `<div class="nav-result error">
         <h4>⚠️ Navigation API Failed</h4>
         <p><strong>Fallback used:</strong> <code>${fallbackRoute}</code></p>
         <p><strong>Error:</strong> ${error.message}</p>
       </div>`;
    }
  } else {
    // Fallback for browsers without Navigation API
    const fallbackRoute = route.startsWith('#') ? route : `?fallback=${Date.now()}`;
    history.pushState({}, '', fallbackRoute);
    document.getElementById('nav-api-content').innerHTML = 
     `<div class="nav-result fallback">
       <h4>📱 Navigation API Not Available</h4>
       <p><strong>Fallback used:</strong> <code>${fallbackRoute}</code></p>
       <p><strong>Method:</strong> history.pushState()</p>
       <p class="console-note">📊 Check console for instrumentation data!</p>
     </div>`;
  }
}

window.addEventListener('popstate', handleRouteChange);

// Add event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  attachEventListenersToLinks();
  
  // Hash change button
  document.getElementById('hashChangeBtn').addEventListener('click', testHashChange);
  
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
