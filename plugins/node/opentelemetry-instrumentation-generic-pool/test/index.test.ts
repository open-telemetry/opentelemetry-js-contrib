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

import { context, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

import { GenericPoolInstrumentation } from '../src';
const plugin = new GenericPoolInstrumentation();

import * as util from 'util';
import * as genericPool from 'generic-pool';
import * as assert from 'assert';
import * as semver from 'semver';

const CLIENT = '_client_';

const version = require('generic-pool/package.json').version;
const isOldVersion = semver.satisfies(version, '2');

const createPool = {
  v3: () => {
    const pool = genericPool.createPool({
      create: () => {
        return Promise.resolve(CLIENT);
      },
      destroy: () => {
        return Promise.resolve();
      },
    });
    return () => {
      return pool.acquire();
    };
  },
  v2: () => {
    const Pool: any = genericPool.Pool;
    const pool = Pool({
      create: (cb: Function) => {
        return cb(CLIENT);
      },
      destroy: () => {},
    });
    return () => {
      // We need to do that on the fly every time, because the instrumentation
      // changes the prototype and thus the function as well.
      const acquire = util.promisify(pool.acquire).bind(pool);
      return acquire();
    };
  },
}[isOldVersion ? 'v2' : 'v3'];

describe('GenericPool instrumentation', () => {
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  const provider = new NodeTracerProvider({
    spanProcessors: [spanProcessor],
  });
  plugin.setTracerProvider(provider);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncLocalStorageContextManager;
  let acquire: Function;

  beforeEach(async () => {
    plugin.enable();
    acquire = createPool();
    contextManager = new AsyncLocalStorageContextManager();
    context.setGlobalContextManager(contextManager.enable());
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    plugin.disable();
  });

  it('should create a span for acquire', async () => {
    assert.strictEqual(await acquire(), CLIENT);
    const [span] = memoryExporter.getFinishedSpans();
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
    assert.strictEqual(span.name, 'generic-pool.acquire');
  });

  it('should attach it to the parent span', async () => {
    const rootSpan: any = tracer.startSpan('clientSpan');

    await context.with(trace.setSpan(context.active(), rootSpan), async () => {
      assert.strictEqual(await acquire(), CLIENT);
      rootSpan.end();

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 2);

      const [span] = memoryExporter.getFinishedSpans();
      assert.strictEqual(span.name, 'generic-pool.acquire');
      assert.strictEqual(
        span.parentSpanContext?.spanId,
        rootSpan.spanContext().spanId
      );
    });
  });

  it('should not create anything if disabled', async () => {
    plugin.disable();
    assert.strictEqual(await acquire(), CLIENT);
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });
});
