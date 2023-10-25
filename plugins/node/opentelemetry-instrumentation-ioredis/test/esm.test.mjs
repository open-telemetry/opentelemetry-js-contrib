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

import assert from 'assert';

import { context } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import testUtils from '@opentelemetry/contrib-test-utils';
import Redis from 'ioredis';

import { IORedisInstrumentation } from '../build/src/index.js';

const CONFIG = {
  host: process.env.OPENTELEMETRY_REDIS_HOST || 'localhost',
  port: parseInt(process.env.OPENTELEMETRY_REDIS_PORT || '63790', 10),
};
const REDIS_URL = `redis://${CONFIG.host}:${CONFIG.port}`;

describe('ioredis ESM', () => {
  const shouldTestLocal = process.env.RUN_REDIS_TESTS_LOCAL;
  const shouldTest = process.env.RUN_REDIS_TESTS || shouldTestLocal;
  const memoryExporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider();
  let instrumentation;
  let contextManager;
  let client;

  before(() => {
    if (!shouldTest) {
      this.skip();
    }
    if (shouldTestLocal) {
      testUtils.startDocker('redis');
    }

    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new IORedisInstrumentation();
    instrumentation.setTracerProvider(provider);

    client = new Redis(REDIS_URL);
  });

  after(async () => {
    await client.quit();
    if (shouldTestLocal) {
      testUtils.cleanUpDocker('redis');
    }
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });
  afterEach(() => {
    context.disable();
  });

  it('should create spans', async () => {
    // Use a random part in key names because redis instance is used for parallel running tests.
    const randomId = ((Math.random() * 2 ** 32) >>> 0).toString(16);
    const testKeyName = `test-${randomId}`;

    const tracer = provider.getTracer('ioredis-test');
    await tracer.startActiveSpan('manual', async (span) => {
      client.set(testKeyName, 'bar');
      let val = await client.get(testKeyName);
      assert(val === 'bar');
      span.end();
    });

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3);
    assert.strictEqual(spans[0].name, 'set');
    assert.strictEqual(spans[0].attributes['db.system'], 'redis');
    assert.strictEqual(spans[1].name, 'get');
    assert.strictEqual(spans[1].attributes['db.system'], 'redis');
    assert.strictEqual(spans[2].name, 'manual');
  });
});

