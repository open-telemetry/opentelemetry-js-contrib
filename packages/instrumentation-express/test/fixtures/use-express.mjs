/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use express from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-express.mjs

import { promisify } from 'util';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-express',
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

app.get('/post/:id', (req, res) => {
  res.send(`Post id: ${req.params.id}`);
});

const server = http.createServer(app);
await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;

await new Promise(resolve => {
  http.get(`http://localhost:${port}/post/0`, res => {
    res.resume();
    res.on('end', () => {
      resolve();
    });
  });
});

await new Promise(resolve => server.close(resolve));
await sdk.shutdown();
