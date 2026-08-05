/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as api from '@opentelemetry/api';
import * as axios from 'axios';
import { setupTracing } from './tracer';

const tracer = setupTracing('example-koa-client');

async function makeRequest() {
  const span = tracer.startSpan('client.makeRequest()', {
    kind: api.SpanKind.CLIENT,
  });

  await api.context.with(
    api.trace.setSpan(api.ROOT_CONTEXT, span),
    async () => {
      try {
        const res = await axios.get('http://localhost:8081/run_test');
        span.setStatus({ code: api.SpanStatusCode.OK });
        console.log(res.statusText);
      } catch (e) {
        if (e instanceof Error) {
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
