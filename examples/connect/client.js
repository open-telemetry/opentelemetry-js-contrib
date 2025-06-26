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

// eslint-disable-next-line import/order
const tracing = require('./tracing')('example-connect-client');

const { tracer } = tracing;
const api = require('@opentelemetry/api');
const axios = require('axios').default;

function makeRequest() {
  tracing.log('starting');
  const span = tracer.startSpan('client.makeRequest()', {
    kind: api.SpanKind.CLIENT,
  });

  api.context.with(api.trace.setSpan(api.ROOT_CONTEXT, span), async () => {
    try {
      const res = await axios.post('http://localhost:8080/run_test');
      tracing.log('status:', res.statusText);
      span.setStatus({ code: api.SpanStatusCode.OK });
    } catch (e) {
      tracing.log('failed:', e.message);
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: e.message });
    }
    span.end();
    tracing.log('forcing spans to be exported');
    await tracing.provider.shutdown();
    tracing.log('all spans exported successfully.');
  });
}

makeRequest();
