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

const tracer = require('./tracer')('example-hapi-client');

const api = require('@opentelemetry/api');
const axios = require('axios').default;

function makeRequest() {
  const span = tracer.startSpan('client.makeRequest()', {
    kind: api.SpanKind.CLIENT,
  });

  api.context.with(api.trace.setSpan(api.ROOT_CONTEXT, span), async () => {
    try {
      const res = await axios.get('http://localhost:8081/run_test');
      span.setStatus({ code: api.SpanStatusCode.OK });
      console.log(res.statusText);
    } catch (e) {
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: e.message });
    }
    span.end();
    console.log(
      'Sleeping 5 seconds before shutdown to ensure all records are flushed.'
    );
    setTimeout(() => {
      console.log('Completed.');
    }, 5000);
  });
}

makeRequest();
