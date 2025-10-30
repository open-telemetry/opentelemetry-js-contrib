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

process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http/dup,database/dup';

import {
  Attributes,
  context,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type * as Memcached from 'memcached';
import * as assert from 'assert';
import { MemcachedInstrumentation } from '../src';
import { ATTR_EXCEPTION_MESSAGE } from '@opentelemetry/semantic-conventions';
import {
  DB_SYSTEM_VALUE_MEMCACHED,
  DB_SYSTEM_NAME_VALUE_MEMCACHED,
  ATTR_DB_SYSTEM,
  ATTR_DB_OPERATION,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from '../src/semconv';
import {
  ATTR_DB_SYSTEM_NAME,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import * as util from 'util';

const instrumentation = new MemcachedInstrumentation();
const memoryExporter = new InMemorySpanExporter();

const CONFIG = {
  host: process.env.OPENTELEMETRY_MEMCACHED_HOST || 'localhost',
  port: process.env.OPENTELEMETRY_MEMCACHED_PORT
    ? parseInt(process.env.OPENTELEMETRY_MEMCACHED_PORT)
    : 27017,
};

const ATTRIBUTES: Attributes = {
  // Old semconv
  [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_MEMCACHED,
  [ATTR_NET_PEER_NAME]: CONFIG.host,
  [ATTR_NET_PEER_PORT]: CONFIG.port,
  // Stable semconv
  [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_MEMCACHED,
  [ATTR_SERVER_ADDRESS]: CONFIG.host,
  [ATTR_SERVER_PORT]: CONFIG.port,
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
const shouldTest = process.env.RUN_MEMCACHED_TESTS;

describe('memcached@2.x', () => {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  const tracer = provider.getTracer('default');
  instrumentation.setTracerProvider(provider);
  let contextManager: AsyncLocalStorageContextManager;

  beforeEach(() => {
    contextManager = new AsyncLocalStorageContextManager();
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
              ATTR_EXCEPTION_MESSAGE
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

  describe('various values of OTEL_SEMCONV_STABILITY_OPT_IN', () => {
    // Restore OTEL_SEMCONV_STABILITY_OPT_IN after we are done.
    const _origOptInEnv = process.env.OTEL_SEMCONV_STABILITY_OPT_IN;
    after(() => {
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN = _origOptInEnv;
      (instrumentation as any)._setSemconvStabilityFromEnv();
    });

    it('OTEL_SEMCONV_STABILITY_OPT_IN=(empty)', async () => {
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN = '';
      (instrumentation as any)._setSemconvStabilityFromEnv();

      const client = getClient(`${CONFIG.host}:${CONFIG.port}`, { retries: 0 });
      await client.setPromise(KEY, VALUE, 10);
      const value = await client.getPromise(KEY);

      assert.strictEqual(value, VALUE);
      const instrumentationSpans = memoryExporter.getFinishedSpans();
      assert.strictEqual(instrumentationSpans.length, 2);

      const span = instrumentationSpans[1]; // get operation
      // old `db.*`
      assert.strictEqual(span.attributes[ATTR_DB_SYSTEM], DB_SYSTEM_VALUE_MEMCACHED);
      assert.strictEqual(span.attributes[ATTR_DB_OPERATION], 'get');
      // stable `db.*`
      assert.strictEqual(span.attributes[ATTR_DB_SYSTEM_NAME], undefined);
      assert.strictEqual(span.attributes[ATTR_DB_OPERATION_NAME], undefined);

      // old `net.*`
      assert.strictEqual(span.attributes[ATTR_NET_PEER_NAME], CONFIG.host);
      assert.strictEqual(span.attributes[ATTR_NET_PEER_PORT], CONFIG.port);
      // stable `net.*`
      assert.strictEqual(span.attributes[ATTR_SERVER_ADDRESS], undefined);
      assert.strictEqual(span.attributes[ATTR_SERVER_PORT], undefined);

      client.end();
    });

    it('OTEL_SEMCONV_STABILITY_OPT_IN=http,database', async () => {
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http,database';
      (instrumentation as any)._setSemconvStabilityFromEnv();

      const client = getClient(`${CONFIG.host}:${CONFIG.port}`, { retries: 0 });
      await client.setPromise(KEY, VALUE, 10);
      const value = await client.getPromise(KEY);

      assert.strictEqual(value, VALUE);
      const instrumentationSpans = memoryExporter.getFinishedSpans();
      assert.strictEqual(instrumentationSpans.length, 2);

      const span = instrumentationSpans[1]; // get operation
      // old `db.*`
      assert.strictEqual(span.attributes[ATTR_DB_SYSTEM], undefined);
      assert.strictEqual(span.attributes[ATTR_DB_OPERATION], undefined);
      // stable `db.*`
      assert.strictEqual(span.attributes[ATTR_DB_SYSTEM_NAME], DB_SYSTEM_NAME_VALUE_MEMCACHED);
      assert.strictEqual(span.attributes[ATTR_DB_OPERATION_NAME], 'get');

      // old `net.*`
      assert.strictEqual(span.attributes[ATTR_NET_PEER_NAME], undefined);
      assert.strictEqual(span.attributes[ATTR_NET_PEER_PORT], undefined);
      // stable `net.*`
      assert.strictEqual(span.attributes[ATTR_SERVER_ADDRESS], CONFIG.host);
      assert.strictEqual(span.attributes[ATTR_SERVER_PORT], CONFIG.port);

      client.end();
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
      assertMatch(span.name, new RegExp('memcached'));
      assert.strictEqual(span.kind, SpanKind.CLIENT);

      // Verify both old and stable semconv attributes
      for (const attr in ATTRIBUTES) {
        assert.strictEqual(span.attributes[attr], ATTRIBUTES[attr]);
      }

      // Verify db.operation (old) and db.operation.name (stable)
      assert.strictEqual(span.attributes[ATTR_DB_OPERATION], expected.op);
      assert.strictEqual(span.attributes[ATTR_DB_OPERATION_NAME], expected.op);

      // Verify db.statement (old) and db.query.text (stable) if statement is expected
      if (expected.statement !== undefined) {
        assert.strictEqual(span.attributes['db.statement'], expected.statement);
        assert.strictEqual(
          span.attributes[ATTR_DB_QUERY_TEXT],
          expected.statement
        );
      } else {
        assert.strictEqual(span.attributes['db.statement'], undefined);
        assert.strictEqual(span.attributes[ATTR_DB_QUERY_TEXT], undefined);
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
      assert.strictEqual(
        span.parentSpanContext?.spanId,
        expected.parentSpan?.spanContext().spanId
      );
    } catch (e: any) {
      e.message = `At span[${idx}]: ${e.message}`;
      throw e;
    }
  });
};

const assertMatch = (str: string, regexp: RegExp, err?: any) => {
  assert.ok(regexp.test(str), err ?? `Expected '${str} to match ${regexp}`);
};
