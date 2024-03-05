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

// A small example that shows using OpenTelemetry's instrumentation of
// Undici to get spans for undici and gloabl fetch requests. Usage:
//    node --require ./telemetry.js app.js

'use strict';

const otel = require('@opentelemetry/api');
const { request } = require('undici');

const tracer = otel.trace.getTracer('example');
tracer.startActiveSpan('manual-span', async (span) => {
  // 1st use the global fetch API
  const fetchResponse = await fetch('https://example.com');
  const fetchText = await fetchResponse.text();
  console.log('fetched HTML size', fetchText.length);

  const undiciResponse = await request('https://example.com');
  const undiciText = await undiciResponse.body.text();
  console.log('requested HTML size', undiciText.length);

  // Finish the parent span
  span.end();
});
