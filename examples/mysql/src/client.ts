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

import * as api from '@opentelemetry/api';
import * as http from 'http';
import { setupTracing } from './tracer';

const tracer = setupTracing('example-mysql-client');

/** A function which makes requests and handles response. */
function makeRequest() {
  // span corresponds to outgoing requests. Here, we have manually created
  // the span, which is created to track work that happens outside of the
  // request lifecycle entirely.
  const span = tracer.startSpan('makeRequest');

  let queries = 0;
  let responses = 0;

  api.context.with(api.trace.setSpan(api.ROOT_CONTEXT, span), () => {
    queries += 1;
    http.get(
      {
        host: 'localhost',
        port: 8080,
        path: '/connection/query',
      },
      response => {
        const body: any[] = [];
        response.on('data', chunk => body.push(chunk));
        response.on('end', () => {
          responses += 1;
          console.log(body.toString());
          if (responses === queries) span.end();
        });
      }
    );
  });
  api.context.with(api.trace.setSpan(api.ROOT_CONTEXT, span), () => {
    queries += 1;
    http.get(
      {
        host: 'localhost',
        port: 8080,
        path: '/pool/query',
      },
      response => {
        const body: any[] = [];
        response.on('data', chunk => body.push(chunk));
        response.on('end', () => {
          responses += 1;
          console.log(body.toString());
          if (responses === queries) span.end();
        });
      }
    );
  });
  api.context.with(api.trace.setSpan(api.ROOT_CONTEXT, span), () => {
    queries += 1;
    http.get(
      {
        host: 'localhost',
        port: 8080,
        path: '/pool/query-with-2-connections',
      },
      response => {
        const body: any[] = [];
        response.on('data', chunk => body.push(chunk));
        response.on('end', () => {
          responses += 1;
          console.log(body.toString());
          if (responses === queries) span.end();
        });
      }
    );
  });
  api.context.with(api.trace.setSpan(api.ROOT_CONTEXT, span), () => {
    queries += 1;
    http.get(
      {
        host: 'localhost',
        port: 8080,
        path: '/pool/query-2-pools',
      },
      response => {
        const body: any[] = [];
        response.on('data', chunk => body.push(chunk));
        response.on('end', () => {
          responses += 1;
          console.log(body.toString());
          if (responses === queries) span.end();
        });
      }
    );
  });
  api.context.with(api.trace.setSpan(api.ROOT_CONTEXT, span), () => {
    queries += 1;
    http.get(
      {
        host: 'localhost',
        port: 8080,
        path: '/cluster/query',
      },
      response => {
        const body: any[] = [];
        response.on('data', chunk => body.push(chunk));
        response.on('end', () => {
          responses += 1;
          console.log(body.toString());
          if (responses === queries) span.end();
        });
      }
    );
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

makeRequest();
