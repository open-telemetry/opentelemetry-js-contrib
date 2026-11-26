/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const { trace, SpanStatusCode } = require('@opentelemetry/api');
const { randomBytes } = require('crypto');

const PORT = 8080;

// Call the example HTTP server to *set*, and then *get* a key.
async function setThenGet() {
  const k = 'myKey';
  const v = randomBytes(16).toString('hex');

  let res = await fetch(`http://localhost:${PORT}/set?args=${k},${v}`);
  await res.bytes(); // consume response body

  res = await fetch(`http://localhost:${PORT}/get?args=${k}`);
  const body = await res.text();

  if (body !== v) {
    throw new Error('`get` value did not match `set` value!');
  }
}

// To group the two `fetch()` calls together into one trace, we can manually
// create a parent span.
const tracer = trace.getTracer('example-redis-client');
tracer.startActiveSpan('setThenGet', async span => {
  try {
    await setThenGet();
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  } finally {
    span.end();
    console.log('Done.');
    console.log('Wait a few seconds for the server to send its tracing data.');
    console.log('Then see the trace in Jaeger:');
    console.log(`  http://localhost:16686/trace/${span.spanContext().traceId}`);
  }
});
