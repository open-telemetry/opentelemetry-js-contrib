/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use hapi from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-hapi.mjs

import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { HapiInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-hapi',
  instrumentations: [new HttpInstrumentation(), new HapiInstrumentation()],
});
sdk.start();

import Hapi from '@hapi/hapi';
import http from 'http';

// Start a Hapi server.
const server = new Hapi.Server({
  port: 0,
  host: 'localhost',
});

server.route({
  method: 'GET',
  path: '/route/{param}',
  handler: function () {
    return { hello: 'world' };
  },
});

await server.start();

// Make a single request to it.
await new Promise(resolve => {
  http.get(`http://${server.info.host}:${server.info.port}/route/test`, res => {
    res.resume();
    res.on('end', () => {
      resolve();
    });
  });
});

await server.stop();
await sdk.shutdown();
