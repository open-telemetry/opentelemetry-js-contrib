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

import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type * as Memcached from 'memcached';
import * as assert from 'assert';
import Instrumentation from '../src';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import * as util from 'util';

const instrumentation = new Instrumentation();
const memoryExporter = new InMemorySpanExporter();

const CONFIG = {
  host: process.env.OPENTELEMETRY_MEMCACHED_HOST || 'localhost',
  port: process.env.OPENTELEMETRY_MEMCACHED_PORT || '11211',
};

const DEFAULT_ATTRIBUTES = {
  [SemanticAttributes.DB_SYSTEM]: DbSystemValues.MEMCACHED,
  [SemanticAttributes.NET_PEER_NAME]: CONFIG.host,
  [SemanticAttributes.NET_PEER_PORT]: CONFIG.port,
};

interface ExtendedMemcached extends Memcached {
  getPromise: (key: string) => Promise<unknown>;
  setPromise: (key: string, value: any, lifetime: number) => Promise<unknown>;
  appendPromise: (key: string, value: any) => Promise<unknown>;
}
const getClient = (...args: any[]): ExtendedMemcached => {
  const Memcached = require('memcached');
  const client = new Memcached(...args);
  client.getPromise = util.promisify(client.get.bind(client));
  client.setPromise = util.promisify(client.set.bind(client));
  client.appendPromise = util.promisify(client.append.bind(client));
  return client;
};
const KEY = 'foo';
const VALUE = '_test_value_';
const shouldTestLocal = process.env.RUN_MEMCACHED_TESTS_LOCAL;
const shouldTest = process.env.RUN_MEMCACHED_TESTS || shouldTestLocal;

describe('memcached@2.x', () => {
  const provider = new NodeTracerProvider();
  const tracer = provider.getTracer('default');
  provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
  instrumentation.setTracerProvider(provider);
  let contextManager: AsyncHooksContextManager;

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
    instrumentation.setConfig({});
    instrumentation.enable();
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    instrumentation.disable();
  });

  before(function () {
    // needs to be "function" to have MochaContext "this" context
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    }

    if (shouldTestLocal) {
      testUtils.startDocker('memcached');
    }
  });

  after(() => {
    if (shouldTestLocal) {
      testUtils.cleanUpDocker('memcached');
    }
  });

  describe('default config', () => {
    let client: ExtendedMemcached;
    beforeEach(() => {
      client = getClient(`${CONFIG.host}:${CONFIG.port}`, { retries: 0 });
    });

    afterEach(() => {
      client.end();
    });

    it('should collect basic info', async () => {
      const parentSpan = tracer.startSpan('parentSpan');

      await context.with(
        trace.setSpan(context.active(), parentSpan),
        async () => {
          await client.setPromise(KEY, VALUE, 10);
          const value = await client.getPromise(KEY);

          assert.strictEqual(value, VALUE);
          const instrumentationSpans = memoryExporter.getFinishedSpans();
          assertSpans(instrumentationSpans, [
            {
              op: 'set',
              key: KEY,
              parentSpan,
            },
            {
              op: 'get',
              key: KEY,
              parentSpan,
            },
          ]);
        }
      );
    });

    it('should handle errors', async () => {
      const parentSpan = tracer.startSpan('parentSpan');
      const KEY = 'unset_key';
      const neverError = new Error('Expected to error but did not');

      await context.with(
        trace.setSpan(context.active(), parentSpan),
        async () => {
          try {
            await client.appendPromise(KEY, VALUE);
            assert.fail(neverError);
          } catch (e) {
            assert.notStrictEqual(e, neverError);
          }

          const instrumentationSpans = memoryExporter.getFinishedSpans();
          assertSpans(instrumentationSpans, [
            {
              op: 'append',
              key: KEY,
              parentSpan,
              status: {
                code: SpanStatusCode.ERROR,
                message: 'Item is not stored',
              },
            },
          ]);

          assertMatch(
            instrumentationSpans?.[0]?.events[0]?.attributes?.[
              SemanticAttributes.EXCEPTION_MESSAGE
            ] as 'string',
            /not stored/
          );
        }
      );
    });

    it('should not require callback to be present', done => {
      // want to force an signature without the callback
      (client.get as any)(KEY);

      setTimeout(() => {
        try {
          const instrumentationSpans = memoryExporter.getFinishedSpans();
          assertSpans(instrumentationSpans, [
            {
              op: 'get',
              key: KEY,
            },
          ]);
          done();
        } catch (e) {
          done(e);
        }
      }, 25);
    });

    it('should return to parent context in callback', done => {
      const parentSpan = tracer.startSpan('parentSpan');
      const parentContext = trace.setSpan(context.active(), parentSpan);

      context.with(parentContext, () => {
        client.get(KEY, () => {
          try {
            const cbContext = context.active();
            assert.strictEqual(cbContext, parentContext);
            done();
          } catch (e) {
            done(e);
          }
        });
      });
    });

    it('should collect be able to collect statements', async () => {
      instrumentation.setConfig({
        enhancedDatabaseReporting: true,
      });
      const value = await client.getPromise(KEY);

      assert.strictEqual(value, VALUE);
      const instrumentationSpans = memoryExporter.getFinishedSpans();
      assertSpans(instrumentationSpans, [
        {
          op: 'get',
          key: KEY,
          statement: 'get foo',
        },
      ]);
    });

    it('should not create new spans when disabled', async () => {
      instrumentation.disable();
      await client.getPromise(KEY);
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
    });
  });

  describe('alternate memcached configurations', () => {
    it('should support multiple server configuration', async () => {
      const client = getClient(
        {
          [`${CONFIG.host}:${CONFIG.port}`]: 1,
          'other:11211': 1,
        },
        { retries: 0 }
      );

      await Promise.all([client.getPromise(KEY)]);

      const instrumentationSpans = memoryExporter.getFinishedSpans();
      assertSpans(instrumentationSpans, [
        {
          op: 'get',
          key: KEY,
        },
      ]);
    });
  });
});

const assertSpans = (actualSpans: any[], expectedSpans: any[]) => {
  assert(Array.isArray(actualSpans), 'Expected `actualSpans` to be an array');
  assert(
    Array.isArray(expectedSpans),
    'Expected `expectedSpans` to be an array'
  );
  assert.strictEqual(
    actualSpans.length,
    expectedSpans.length,
    'Expected span count different from actual'
  );
  actualSpans.forEach((span, idx) => {
    const expected = expectedSpans[idx];
    if (expected === null) return;
    try {
      assert.notStrictEqual(span, undefined);
      assert.notStrictEqual(expected, undefined);
      assertMatch(span.name, new RegExp(expected.op));
      assertMatch(span.name, new RegExp(expected.key));
      assert.strictEqual(span.kind, SpanKind.CLIENT);
      assert.strictEqual(span.attributes['db.statement'], expected.statement);
      for (const attr in DEFAULT_ATTRIBUTES) {
        assert.strictEqual(span.attributes[attr], DEFAULT_ATTRIBUTES[attr]);
      }
      assert.strictEqual(span.attributes['db.memcached.key'], expected.key);
      assert.strictEqual(
        typeof span.attributes['memcached.version'],
        'string',
        'memcached.version not specified'
      );
      assert.deepEqual(
        span.status,
        expected.status || { code: SpanStatusCode.UNSET }
      );
      assert.strictEqual(span.attributes['db.operation'], expected.op);
      assert.strictEqual(
        span.parentSpanId,
        expected.parentSpan?.spanContext().spanId
      );
    } catch (e) {
      e.message = `At span[${idx}]: ${e.message}`;
      throw e;
    }
  });
};

const assertMatch = (str: string, regexp: RegExp, err?: any) => {
  assert.ok(regexp.test(str), err ?? `Expected '${str} to match ${regexp}`);
};
