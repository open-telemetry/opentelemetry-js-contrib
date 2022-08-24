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

const Tracer = require('opentelemetry-fastly-ce-instrumentation-lib');
const tracer = new Tracer();

addEventListener('fetch', event =>
  event.respondWith(tracer.wrapper(handleRequest, event))
);

const FASTLY_BACKEND_MY_SERVICE = 'httpbin';
const FASTLY_BACKEND_COLLECTOR = 'otel_collector_backend';

async function handleRequest(event) {
  // start time
  const START_TIME = Date.now();

  // define secret dictionary
  const secretsDictionary = new Dictionary('secrets');
  // get OpenTelemetry collector hostname
  const OTEL_COLLECTOR_URL = secretsDictionary.get('OTEL_COLLECTOR_URL');
  // get OpenTelemetry collector credentials (base64 encoded)
  const BASIC_AUTH_CREDENTIALS = secretsDictionary.get(
    'BASIC_AUTH_CREDENTIALS'
  );

  // set resource attributes for the tracing (optional)
  tracer.setResourceAttribute('service.name', 'compute@edge-example'); // override default value

  // set collector url, user details and fastly backend (url and backend required, user details optional)
  tracer.setOtelCollectorUrl(OTEL_COLLECTOR_URL);
  tracer.setOtelCollectorUserCredentials(BASIC_AUTH_CREDENTIALS);
  tracer.setOtelCollectorBackend(FASTLY_BACKEND_COLLECTOR);

  tracer.outputTracetoStdOut(true);

  let mySpan = tracer.startSpan('Calculation');
  let intNumber = await slowlyReturnNumber();
  mySpan.setAttribute('number', intNumber);
  mySpan.end();

  // sends a request to httpbin.org
  let cacheOverride = new CacheOverride('pass');
  let myExtRequestHeaders = new Headers({});
  let myExtRequest = new Request('https://httpbin.org/json', {
    method: 'GET',
    headers: myExtRequestHeaders,
  });
  let myExtResponse = await fetch(myExtRequest, {
    backend: FASTLY_BACKEND_MY_SERVICE,
    cacheOverride,
  });

  console.log('SpanId from the fetch: ' + myExtResponse.spanId);

  let myResponse = {
    traceid: tracer.getTraceId(),
    number: intNumber,
    startTime: START_TIME,
  };
  let headers = new Headers();
  headers.set('Content-Type', 'application/json; charset=utf-8');

  return new Response(JSON.stringify(myResponse), {
    status: 200,
    headers,
  });
}

/**
 * Returns a random number.
 */

function slowlyReturnNumber() {
  return new Promise(function (resolve) {
    for (let i = 1; i < 10 ** Math.floor(Math.random() * (7 - 5 + 1) + 5); i++);
    resolve(parseInt(Math.floor(Math.random() * 1e16)));
  });
}
