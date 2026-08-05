/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use ioredis from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-ioredis.mjs [REDIS_URL]

import { trace } from '@opentelemetry/api';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { IORedisInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-ioredis',
  instrumentations: [new IORedisInstrumentation()],
});
sdk.start();

import assert from 'assert';
import Redis from 'ioredis';

const REDIS_URL = process.argv[2] || '';
const redis = new Redis(REDIS_URL);

// Randomize the key to avoid collisions with parallel testing.
const randomId = ((Math.random() * 2 ** 32) >>> 0).toString(16);
const testKeyName = `test-${randomId}`;

const tracer = trace.getTracer();
await tracer.startActiveSpan('manual', async span => {
  redis.set(testKeyName, 'bar');
  let val = await redis.get(testKeyName);
  assert(val === 'bar');
  span.end();
});

await redis.quit();
await sdk.shutdown();
