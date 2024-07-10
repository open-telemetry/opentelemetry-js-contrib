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

// Usage:
//    node use-gcp-detector.js

const { createTestNodeSdk } = require('@opentelemetry/contrib-test-utils');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { gcpDetector } = require('../../build/src/index.js');


const sdk = createTestNodeSdk({
  serviceName: 'use-detector-gcp',
  instrumentations: [
    new HttpInstrumentation(),
  ],
  resourceDetectors: [gcpDetector],
});

sdk.start();

const http = require('http');

const server = http.createServer((req, res) => {
  console.log('incoming request: %s %s %s', req.method, req.url, req.headers);

  req.resume();
  req.on('end', function () {
    const body = 'pong';
    res.writeHead(200, {
      'content-type': 'text/plain',
      'content-length': body.length,
    });
    res.end(body);
  });
});

server.listen(0, '127.0.0.1', async function () {
  const port = server.address().port;

  // First request to show a client error.
  const startTime = Date.now();
  await new Promise((resolve) => {
    const clientReq = http.request(
      `http://127.0.0.1:${port}/ping`,
      function (cres) {
        console.log(
          'client response: %s %s',
          cres.statusCode,
          cres.headers
        );
        const chunks = [];
        cres.on('data', function (chunk) {
          chunks.push(chunk);
        });
        cres.on('end', function () {
          const body = chunks.join('');
          console.log('client response body: %j', body);
          resolve();
        });
      }
    );
    clientReq.write('ping');
    clientReq.end();
  });

  // flush any left spans
  await sdk.shutdown();
  await new Promise(resolve => server.close(resolve));
});
