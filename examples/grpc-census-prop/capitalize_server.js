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

'use strict';

/* eslint-disable global-require */
const binaryPropagator = process.env.BINARY_PROPAGATOR === 'true';
const censusTracer = process.env.CENSUS_TRACER === 'true';

let tracer;
let SpanKind;
if (censusTracer) {
  tracer = require('./tracer_census')();
  ({ SpanKind } = require('@opencensus/core'));
} else {
  tracer = require('./tracer')(
    'example-grpc-capitalize-server',
    binaryPropagator
  );
  ({ SpanKind } = require('@opentelemetry/api'));
}

const path = require('path');
const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = path.join(__dirname, 'protos/defs.proto');
const PROTO_OPTIONS = {
  keepCase: true,
  enums: String,
  defaults: true,
  oneofs: true,
};
const definition = protoLoader.loadSync(PROTO_PATH, PROTO_OPTIONS);
const rpcProto = grpc.loadPackageDefinition(definition).rpc;

/**
 * Implements the Capitalize RPC method.
 */
function capitalize(call, callback) {
  if (call.metadata) {
    // output the gRPC metadata to see headers e.g. traceparent or grpc-trace-bin
    console.dir(call.metadata, { depth: null });
  }

  let capitalized;
  if (censusTracer) {
    capitalized = capitalizeWithCensusTracing(call);
  } else {
    capitalized = capitalizeWithOTelTracing(call);
  }

  callback(null, { data: Buffer.from(capitalized) });
}

/**
 * Capitalize wrapped with Census tracing
 */
function capitalizeWithCensusTracing(call) {
  const currentSpan = tracer.currentRootSpan;
  // display traceid in the terminal
  console.log(`traceid: ${currentSpan.traceId}`);

  const span = tracer.startChildSpan({
    name: 'tutorials.FetchImpl.capitalize',
    kind: SpanKind.SERVER,
  });

  const data = call.request.data.toString('utf8');
  const capitalized = data.toUpperCase();
  for (let i = 0; i < 100000000; i += 1) {
    // empty
  }
  span.end();
  return capitalized;
}

/**
 * Capitalize wrapped with OpenTelemetry tracing
 */
function capitalizeWithOTelTracing(call) {
  const currentSpan = tracer.getCurrentSpan();
  // display traceid in the terminal
  console.log(`traceid: ${currentSpan.spanContext().traceId}`);

  const span = tracer.startSpan('tutorials.FetchImpl.capitalize', {
    kind: SpanKind.SERVER,
  });

  const data = call.request.data.toString('utf8');
  const capitalized = data.toUpperCase();
  for (let i = 0; i < 100000000; i += 1) {
    // empty
  }
  span.end();
  return capitalized;
}

/**
 * Starts an RPC server that receives requests for the Fetch service at the
 * sample server port.
 */
function main() {
  const server = new grpc.Server();
  server.addService(rpcProto.Fetch.service, { capitalize });
  server.bind('0.0.0.0:50051', grpc.ServerCredentials.createInsecure());
  server.start();
}

main();
