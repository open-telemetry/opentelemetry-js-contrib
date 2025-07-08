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

'use strict';

import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const providerWithZone = new WebTracerProvider({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'web-service-meta',
  }),
  spanProcessors: [
    new SimpleSpanProcessor(new ConsoleSpanExporter()),
    new SimpleSpanProcessor(new OTLPTraceExporter()),
  ],
});

providerWithZone.register({
  contextManager: new ZoneContextManager(),
  propagator: new B3Propagator(),
});
const instrumentations = getWebAutoInstrumentations({
  '@opentelemetry/instrumentation-xml-http-request': {
    ignoreUrls: [/localhost/],
    propagateTraceHeaderCorsUrls: ['http://localhost:8090'],
  },
});

registerInstrumentations({
  instrumentations,
  tracerProvider: providerWithZone,
});

let lastButtonId = 0;

function btnAddClick() {
  lastButtonId += 1;
  const btn = document.createElement('button');
  // for easier testing of element xpath
  let navigate = false;
  if (lastButtonId % 2 === 0) {
    btn.setAttribute('id', `button${lastButtonId}`);
    navigate = true;
  }
  btn.setAttribute('class', `buttonClass${lastButtonId}`);
  btn.append(document.createTextNode(`Click ${lastButtonId}`));
  btn.addEventListener('click', onClick.bind(this, navigate));
  document.querySelector('#buttons').append(btn);
}

function prepareClickEvents() {
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < 5; i++) {
    btnAddClick();
  }
  const btnAdd = document.getElementById('btnAdd');
  btnAdd.addEventListener('click', btnAddClick);
}

function onClick(navigate) {
  if (navigate) {
    window.history.pushState(
      { test: 'testing' },
      '',
      `${window.location.pathname}`
    );
    window.history.pushState(
      { test: 'testing' },
      '',
      `${window.location.pathname}#foo=bar1`
    );
  }
  getData('https://httpbin.org/get?a=1').then(() => {
    getData('https://httpbin.org/get?a=1').then(() => {
      console.log('data downloaded 2');
    });
    getData('https://httpbin.org/get?a=1').then(() => {
      console.log('data downloaded 3');
    });
    console.log('data downloaded 1');
  });
}

function getData(url) {
  return new Promise((resolve, _reject) => {
    const req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.setRequestHeader('Content-Type', 'application/json');
    req.setRequestHeader('Accept', 'application/json');
    req.send();
    req.onload = function onLoad() {
      resolve();
    };
  });
}

window.addEventListener('load', prepareClickEvents);
