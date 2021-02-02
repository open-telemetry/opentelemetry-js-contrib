'use strict';

const api = require('@opentelemetry/api');
// eslint-disable-next-line import/order
const tracer = require('./tracer')('example-hapi-client');
const axios = require('axios').default;

function makeRequest() {
  const span = tracer.startSpan('client.makeRequest()', {
    kind: api.SpanKind.CLIENT,
  });

  api.context.with(api.setSpan(api.ROOT_CONTEXT, span), async () => {
    try {
      const res = await axios.get('http://localhost:8081/run_test');
      span.setStatus({ code: api.StatusCode.OK });
      console.log(res.statusText);
    } catch (e) {
      span.setStatus({ code: api.StatusCode.ERROR, message: e.message });
    }
    span.end();
    console.log('Sleeping 5 seconds before shutdown to ensure all records are flushed.');
    setTimeout(() => { console.log('Completed.'); }, 5000);
  });
}

makeRequest();
