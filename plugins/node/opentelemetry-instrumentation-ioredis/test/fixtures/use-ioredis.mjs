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

// Use ioredis from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-ioredis.mjs [REDIS_URL]

// ---
// TODO: Move this block to @opentelemetry/contrib-test-utils and import as:
//    import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';
import { NodeSDK, tracing, api } from '@opentelemetry/sdk-node';
function createTestNodeSdk(opts) {
  // Typically, when run via `runTestFixture`, OTEL_EXPORTER_OTLP_ENDPOINT will
  // be set to export to a test collector. Fallback to writing to the console
  // for dev usage.
  const spanProcessor = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? undefined
    : new tracing.SimpleSpanProcessor(new tracing.ConsoleSpanExporter()));
  const sdk = new NodeSDK({
    serviceName: opts.serviceName || 'test-service',
    spanProcessor,
    instrumentations: opts.instrumentations
  });
  return sdk;
}
// ---

import { IORedisInstrumentation } from '../../build/src/index.js';
const sdk = createTestNodeSdk({
  serviceName: 'use-ioredis',
  instrumentations: [
    new IORedisInstrumentation()
  ]
})
sdk.start();

import assert from 'assert';
import Redis from 'ioredis';

const REDIS_URL = process.argv[2] || '';
const redis = new Redis(REDIS_URL);

// Randomize the key to avoid collisions with parallel testing.
const randomId = ((Math.random() * 2 ** 32) >>> 0).toString(16);
const testKeyName = `test-${randomId}`;

const tracer = api.trace.getTracer();
await tracer.startActiveSpan('manual', async (span) => {
  redis.set(testKeyName, 'bar');
  let val = await redis.get(testKeyName);
  assert(val === 'bar');
  span.end();
});

await redis.quit();
await sdk.shutdown();
