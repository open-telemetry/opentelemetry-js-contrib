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

// Use fastify from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-fastify.mjs

import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { FastifyInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-fastify',
  instrumentations: [
    new FastifyInstrumentation()
  ]
})
sdk.start();

import Fastify from 'fastify';
import http from 'http';

// Start a fastify server.
const app = Fastify();
app.get('/a-route', function aRoute(_request, reply) {
  reply.send({ hello: 'world' });
})
const addr = await app.listen({ port: 0 });

// Make a single request to it.
await new Promise(resolve => {
  http.get(addr + '/a-route', (res) => {
    res.resume();
    res.on('end', () => {
      resolve();
    });
  })
})

await app.close();
await sdk.shutdown();
