'use strict';

const api = require('@opentelemetry/api');
const axios = require('axios').default;

const tracer = api.trace.getTracer('fastify-client');

function makeRequest() {
  console.log('starting');
  const span = tracer.startSpan('client.makeRequest()', {
    kind: api.SpanKind.CLIENT,
  });

  api.context.with(api.trace.setSpan(api.ROOT_CONTEXT, span), async () => {
    try {
      const res = await axios.post('http://localhost:8080/run_test/1', {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      });
      console.log('status:', res.statusText);
      span.setStatus({ code: api.SpanStatusCode.OK });
    } catch (e) {
      console.log('failed:', e.message);
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: e.message });
    }
    span.end();
  });
}

makeRequest();
