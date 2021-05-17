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

import { context, setSpan } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';

import Instrumentation from '../src';
const plugin = new Instrumentation();

import * as util from 'util';
import * as genericPool from 'generic-pool';
import * as assert from 'assert';

const CLIENT = '_client_';

const createPool = {
  v3: () => {
    return genericPool.createPool({
      create: () => {
        return Promise.resolve(CLIENT);
      },
      destroy: () => {
        return Promise.resolve();
      },
    });
  },
  v2: () => {
    const Pool: any = genericPool.Pool;
    const pool = Pool({
      create: (cb: Function) => {
        return cb(CLIENT);
      },
      destroy: () => {},
    });
    pool.acquire = util.promisify(pool.acquire).bind(pool);
    return pool;
  },
};

describe('GenericPool instrumentation', () => {
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  plugin.setTracerProvider(provider);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncHooksContextManager;
  let pool: genericPool.Pool<unknown>;

  beforeEach(async () => {
    plugin.enable();
    pool = createPool.v2();
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    plugin.disable();
  });

  describe('Instrumenting handler calls', () => {
    it('should create a span for acquire', async () => {
      assert.strictEqual(await pool.acquire(), CLIENT);
      const [span] = memoryExporter.getFinishedSpans();
      assert.strictEqual(span.name, 'generic-pool.aquire');
    });

    it('should attach it to the parent span', async () => {
      const rootSpan: any = tracer.startSpan('clientSpan');

      await context.with(setSpan(context.active(), rootSpan), async () => {
        assert.strictEqual(await pool.acquire(), CLIENT);
        rootSpan.end();

        assert.strictEqual(memoryExporter.getFinishedSpans().length, 2);

        const [span] = memoryExporter.getFinishedSpans();
        assert.strictEqual(span.name, 'generic-pool.aquire');
        assert.strictEqual(span.parentSpanId, rootSpan.spanContext.spanId);
      });
    });
  });
});
