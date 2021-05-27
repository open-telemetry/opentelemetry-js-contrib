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

import { DomAttributes, MessageType } from '../types';

/* eslint-disable no-console */

chrome.storage.local.get('settings', ({ settings }) => {
  // Define label of badge.
  const urlFilter = settings.urlFilter;
  if (
    urlFilter !== '' &&
    (urlFilter === '*' || document.location.href.includes(urlFilter))
  ) {
    console.log(
      `[otel-extension] ${document.location.href} includes ${urlFilter}`
    );
    const script = chrome.runtime.getURL('instrumentation.js');
    console.log('[otel-extension] injecting instrumentation.js');
    const tag = document.createElement('script');
    tag.setAttribute('src', script);
    tag.setAttribute('id', 'open-telemetry-instrumentation');
    // Config is based via this data attribute, since CSP might not allow inline script tags, so this is more robust.
    tag.setAttribute(
      `data-${DomAttributes['CONFIG']}`,
      JSON.stringify(settings)
    );
    tag.setAttribute(
      `data-${DomAttributes['EXTENSION_ID']}`,
      chrome.runtime.id
    );
    document.head.appendChild(tag);

    window.addEventListener('message', event => {
      if (
        event.data.type === MessageType['OTEL_EXTENSION_SPANS'] &&
        event.data.extensionId === chrome.runtime.id
      ) {
        chrome.runtime.sendMessage(event.data);
      }
    });

    console.log('[otel-extension] instrumentation.js injected');
  } else {
    console.log(
      `[otel-extension] ${document.location.href} does not include ${urlFilter}`
    );
  }
});
