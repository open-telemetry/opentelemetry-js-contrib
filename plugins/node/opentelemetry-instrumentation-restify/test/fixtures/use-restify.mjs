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
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-restify.mjs

import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { RestifyInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-restify',
  instrumentations: [
    new RestifyInstrumentation()
  ]
})
sdk.start();

import restify from 'restify';
import http from 'http';

const app = restify.createServer();
const PORT = 3000;

app.get('/post/:id', (req, res, next) => {
  res.send(`Post id: ${req.params.id}`);
});
app.listen(PORT)

await new Promise(resolve => {
  http.get(`http://localhost:${PORT}/post/0`, (res) => {
    res.resume();
    res.on('end', () => {
      resolve();
    });
  })
});

await app.close();
await sdk.shutdown();
