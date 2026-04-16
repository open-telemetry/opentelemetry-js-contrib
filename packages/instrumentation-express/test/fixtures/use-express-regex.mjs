/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use express from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-express-regex.mjs

import { promisify } from 'util';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-express-regex',
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
});
sdk.start();

import express from 'express';
import * as http from 'http';

const app = express();

app.use(async function simpleMiddleware(req, res, next) {
  // Wait a short delay to ensure this "middleware - ..." span clearly starts
  // before the "router - ..." span. The test rely on a start-time-based sort
  // of the produced spans. If they start in the same millisecond, then tests
  // can be flaky.
  await promisify(setTimeout)(10);
  next();
});

app.get(
  [
    '/test/arr/:id',
    /\/test\/arr[0-9]*\/required(path)?(\/optionalPath)?\/(lastParam)?/,
  ],
  (_req, res) => {
    res.send({ response: 'response' });
  }
);

app.get(/\/test\/regex/, (_req, res) => {
  res.send({ response: 'response 2' });
});

app.get(['/test/array1', /\/test\/array[2-9]/], (_req, res) => {
  res.send({ response: 'response 3' });
});

app.get(['/test', '6', /test/], (_req, res) => {
  res.send({ response: 'response 4' });
});

const server = http.createServer(app);
await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;

await new Promise(resolve => {
  http.get(`http://localhost:${port}${process.env.TEST_REGEX_ROUTE}`, res => {
    res.resume();
    res.on('end', () => {
      resolve();
    });
  });
});

await new Promise(resolve => server.close(resolve));
await sdk.shutdown();
