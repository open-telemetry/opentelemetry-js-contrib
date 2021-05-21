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

/* eslint-disable no-console */

// The following block is required to make 'window' available within the service worker, since opentelemetry-core getEnv() depends on it.
export type {};
interface MyServiceWorkerGlobalScope extends ServiceWorkerGlobalScope {
  window: unknown;
}
declare const self: MyServiceWorkerGlobalScope;
if (self.constructor.name !== 'Window') {
  self.window = self;
}

import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import { WebTracerProvider } from '@opentelemetry/web';

// the following two 'require' are here for webpack.
require('../manifest.json5');
require('../icons/otel-logo.png');

try {
  chrome.tabs.onUpdated.addListener(
    (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status !== 'loading') {
        return;
      }

      chrome.tabs.get(tabId, (tab: chrome.tabs.Tab) => {
        console.log(tab);
        if (tab.url) {
          if (chrome.scripting) {
            chrome.scripting.executeScript({
              target: {
                allFrames: true,
                tabId,
              },
              files: ['contentScript.js'],
            });
          } else {
            console.log('execute');
            chrome.tabs.executeScript(tabId, {
              file: 'contentScript.js',
              allFrames: true,
            });
          }
        }
      });
    }
  );

  chrome.runtime.onMessage.addListener((request, sender) => {
    if (
      request.type === 'OTEL_EXTENSION_SPANS' &&
      request.extensionId === chrome.runtime.id &&
      sender.id === chrome.runtime.id
    ) {
      const spans = JSON.parse(request.spans);
      const consoleExporter = new ConsoleSpanExporter();
      const provider = new WebTracerProvider();
      provider.addSpanProcessor(new SimpleSpanProcessor(consoleExporter));
      consoleExporter.export(spans, r => console.log(r));
    }
  });
} catch (e) {
  console.log(e);
}
