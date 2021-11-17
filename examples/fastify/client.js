'use strict';

// eslint-disable-next-line import/order
const tracing = require('./tracing')('example-fastify-client');

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
      const res = await axios.post('http://localhost:8080/run_test/1', {
      // testing
      // const res = await axios.post('http://localhost:8080/run_test2/1', {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      });
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
