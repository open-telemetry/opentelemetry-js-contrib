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

import { setupTracing } from './tracer';

// Initialize tracing before importing other moduless
const tracer = setupTracing('example-express-client');

import * as api from '@opentelemetry/api';
import * as axios from 'axios';

async function makeRequest() {
  const span = tracer.startSpan('client.makeRequest()', {
    kind: api.SpanKind.CLIENT,
  });

  await api.context.with(
    api.trace.setSpan(api.ROOT_CONTEXT, span),
    async () => {
      try {
        const res = await axios.get('http://localhost:8080/run_test');
        console.log('status:', res.statusText);
        span.setStatus({ code: api.SpanStatusCode.OK });
      } catch (e) {
        if (e instanceof Error) {
          console.log('failed:', e.message);
          span.setStatus({
            code: api.SpanStatusCode.ERROR,
            message: e.message,
          });
        }
      }
      span.end();
      console.log(
        'Sleeping 5 seconds before shutdown to ensure all records are flushed.'
      );
      setTimeout(() => {
        console.log('Completed.');
      }, 5000);
    }
  );
}

makeRequest().catch(err => console.log(err));
