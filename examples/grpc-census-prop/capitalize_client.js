'use strict';

const api = require('@opentelemetry/api');
/* eslint-disable global-require */
const binaryPropagator = process.env.BINARY_PROPAGATOR === 'true';
const censusTracer = process.env.CENSUS_TRACER === 'true';
let tracer;
if (censusTracer) {
  tracer = require('./tracer_census')();
} else {
  tracer = require('./tracer')('example-grpc-capitalize-client', binaryPropagator);
}

const path = require('path');
const grpc = require('grpc');

const PROTO_PATH = path.join(__dirname, 'protos/defs.proto');

// Even though grpc.load is deprecated in favor of @grpc/proto-loader, it
// appears @opencensus/instrumentation-grpc only gets to set the
// grpc-trace-bin header if we use grpc.load
const { Fetch } = grpc.load(PROTO_PATH).rpc;

/**
 * Creates a gRPC client, makes a gRPC call and waits before shutting down
 */
function main() {
  const client = new Fetch(
    'localhost:50051',
    grpc.credentials.createInsecure(),
  );
  const data = process.argv[2] || 'opentelemetry';
  console.log('> ', data);

  if (censusTracer) {
    capitalizeWithCensusTracing(client, data);
  } else {
    capitalizeWithOTelTracing(client, data);
  }

  // The process must live for at least the interval past any traces that
  // must be exported, or some risk being lost if they are recorded after the
  // last export.
  console.log('Sleeping 5 seconds before shutdown to ensure all records are flushed.');
  setTimeout(() => { console.log('Completed.'); }, 5000);
}

/**
 * Makes the gRPC call wrapped in an OpenCensus-style span
 */
function capitalizeWithCensusTracing(client, data) {
  tracer.startRootSpan({ name: 'tutorialsClient.capitalize' }, (rootSpan) => {
    client.capitalize({ data: Buffer.from(data) }, (err, response) => {
      if (err) {
        console.log('could not get grpc response');
        rootSpan.end();
        return;
      }
      console.log('< ', response.data.toString('utf8'));

      rootSpan.end();
    });
  });
}

/**
 * Makes the gRPC call wrapped in an OpenTelemetry-style span
 */
function capitalizeWithOTelTracing(client, data) {
  const span = tracer.startSpan('tutorialsClient.capitalize');
  api.context.with(api.trace.setSpan(api.ROOT_CONTEXT, span), () => {
    client.capitalize({ data: Buffer.from(data) }, (err, response) => {
      if (err) {
        console.log('could not get grpc response');
        return;
      }
      console.log('< ', response.data.toString('utf8'));
      // display traceid in the terminal
      console.log(`traceid: ${span.spanContext().traceId}`);
      span.end();
    });
  });
}

main();
