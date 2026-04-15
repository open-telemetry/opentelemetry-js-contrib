/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use koa from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-koa.mjs

import { promisify } from 'util';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { KoaInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-koa',
  instrumentations: [new KoaInstrumentation(), new HttpInstrumentation()],
});
sdk.start();

import Koa from 'koa';
import KoaRouter from '@koa/router';
import * as http from 'http';

const app = new Koa();

app.use(async function simpleMiddleware(ctx, next) {
  // Wait a short delay to ensure this "middleware - ..." span clearly starts
  // before the "router - ..." span. The test rely on a start-time-based sort
  // of the produced spans. If they start in the same millisecond, then tests
  // can be flaky.
  await promisify(setTimeout)(10);
  await next();
});

const router = new KoaRouter();
router.get('/post/:id', ctx => {
  ctx.body = `Post id: ${ctx.params.id}`;
});

app.use(router.routes());

const server = http.createServer(app.callback());
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
