/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const { trace, SpanStatusCode } = require('@opentelemetry/api');
const axios = require('axios');

const tracer = trace.getTracer('example-redis-client');

async function makeRequest() {
  await tracer.startActiveSpan('client.makeRequest', async (span) => {
    try {
      const res = await axios.get('http://localhost:8080/run_test');
      span.setStatus({ code: SpanStatusCode.OK });
      console.log(res.statusText);
    } catch (e) {
      if (e instanceof Error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: e.message,
        });
      }
    }
    span.end();
  });
}

makeRequest().catch(err => console.log(err));
