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

const api = require('@opentelemetry/api');
const tracer = require('./tracer')('example-dns');
const dns = require('dns').promises;

/** A function which makes a dns lookup and handles response. */
function makeLookup() {
  // span corresponds to dns lookup. Here, we have manually created
  // the span, which is created to track work that happens outside of the
  // dns lookup query.
  const span = tracer.startSpan('dnsLookup');
  api.context.with(api.trace.setSpan(api.ROOT_CONTEXT, span), async () => {
    try {
      await dns.lookup('montreal.ca');
    } catch (error) {
      span.setAttributes({
        'error.name': error.name,
        'error.message': error.message,
      });
    } finally {
      console.log(`traceid: ${span.spanContext().traceId}`);
      span.end();
    }
  });

  // The process must live for at least the interval past any traces that
  // must be exported, or some risk being lost if they are recorded after the
  // last export.
  console.log(
    'Sleeping 5 seconds before shutdown to ensure all records are flushed.'
  );
  setTimeout(() => {
    console.log('Completed.');
  }, 5000);
}

makeLookup();
