'use strict';

import { setupTracing } from "./tracer";
const tracer = setupTracing('example-koa-client');
import * as api from '@opentelemetry/api';
import { default as axios } from 'axios';

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
      if(e instanceof Error) {
        span.setStatus({ code: api.SpanStatusCode.ERROR, message: e.message });
      }
    }
    span.end();
    console.log('Sleeping 5 seconds before shutdown to ensure all records are flushed.');
    setTimeout(() => { console.log('Completed.'); }, 5000);
  });
}

makeRequest();
