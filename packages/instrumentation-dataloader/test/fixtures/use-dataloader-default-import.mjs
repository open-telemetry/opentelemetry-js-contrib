/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use dataloader from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-dataloader-default-import.mjs

import { trace } from '@opentelemetry/api';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';
import * as crypto from 'crypto';

import { DataloaderInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-dataloader',
  instrumentations: [new DataloaderInstrumentation()],
});
sdk.start();

import Dataloader from 'dataloader';

function getMd5HashFromIdx(idx) {
  return crypto.createHash('md5').update(String(idx)).digest('hex');
}
const dataloader = new Dataloader(
  async keys =>
    keys.map((_, idx) => {
      return getMd5HashFromIdx(idx);
    }),
  { cache: true }
);

const tracer = trace.getTracer();
await tracer.startActiveSpan('manual', async span => {
  await dataloader.load(1);
  span.end();
});

await sdk.shutdown();
