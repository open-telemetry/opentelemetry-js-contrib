'use strict';

import { setupTracing } from "./tracer";
const tracer = setupTracing('example-koa-client');
import {trace, context,ROOT_CONTEXT,SpanKind,SpanStatusCode} from '@opentelemetry/api';
import { default as axios } from 'axios';

function makeRequest() {
  const span = tracer.startSpan('client.makeRequest()', {
    kind: SpanKind.CLIENT,
  });

  context.with(trace.setSpan(ROOT_CONTEXT, span), async () => {
    try {
      const res = await axios.get('http://localhost:8081/run_test');
      span.setStatus({ code: SpanStatusCode.OK });
      console.log(res.statusText);
    } catch (e) {
      if(e instanceof Error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
      }
    }
    span.end();
    console.log('Sleeping 5 seconds before shutdown to ensure all records are flushed.');
    setTimeout(() => { console.log('Completed.'); }, 5000);
  });
}

makeRequest();
