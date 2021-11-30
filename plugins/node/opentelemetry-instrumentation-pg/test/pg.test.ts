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

import {
  SpanAttributes,
  SpanStatusCode,
  context,
  Span,
  SpanKind,
  SpanStatus,
  trace,
} from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import type * as pg from 'pg';
import {
  PgInstrumentation,
  PgInstrumentationConfig,
  PgResponseHookInformation,
} from '../src';
import { AttributeNames } from '../src/enums/AttributeNames';
import { TimedEvent } from './types';
import {
  SemanticAttributes,
  DbSystemValues,
} from '@opentelemetry/semantic-conventions';
import { isSupported } from './utils';

const pgVersion = require('pg/package.json').version;
const nodeVersion = process.versions.node;

const memoryExporter = new InMemorySpanExporter();

const CONFIG = {
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT
    ? parseInt(process.env.POSTGRES_PORT, 10)
    : 54320,
};

const DEFAULT_ATTRIBUTES = {
  [SemanticAttributes.DB_SYSTEM]: DbSystemValues.POSTGRESQL,
  [SemanticAttributes.DB_NAME]: CONFIG.database,
  [SemanticAttributes.NET_PEER_NAME]: CONFIG.host,
  [SemanticAttributes.DB_CONNECTION_STRING]: `jdbc:postgresql://${CONFIG.host}:${CONFIG.port}/${CONFIG.database}`,
  [SemanticAttributes.NET_PEER_PORT]: CONFIG.port,
  [SemanticAttributes.DB_USER]: CONFIG.user,
};

const unsetStatus: SpanStatus = {
  code: SpanStatusCode.UNSET,
};
const errorStatus: SpanStatus = {
  code: SpanStatusCode.ERROR,
};

const runCallbackTest = (
  span: Span | null,
  attributes: SpanAttributes,
  events: TimedEvent[],
  status: SpanStatus = unsetStatus,
  spansLength = 1,
  spansIndex = 0
) => {
  const spans = memoryExporter.getFinishedSpans();
  assert.strictEqual(spans.length, spansLength);
  const pgSpan = spans[spansIndex];
  testUtils.assertSpan(pgSpan, SpanKind.CLIENT, attributes, events, status);
  if (span) {
    testUtils.assertPropagation(pgSpan, span);
  }
};

describe('pg', () => {
  function create(config: PgInstrumentationConfig = {}) {
    instrumentation.setConfig(config);
    instrumentation.enable();
  }

  let client: pg.Client;
  let instrumentation: PgInstrumentation;
  let contextManager: AsyncHooksContextManager;
  const provider = new BasicTracerProvider();
  const tracer = provider.getTracer('external');

  const testPostgres = process.env.RUN_POSTGRES_TESTS; // For CI: assumes local postgres db is already available
  const testPostgresLocally = process.env.RUN_POSTGRES_TESTS_LOCAL; // For local: spins up local postgres db via docker
  const shouldTest = testPostgres || testPostgresLocally; // Skips these tests if false (default)

  before(async function () {
    const skipForUnsupported =
      process.env.IN_TAV && !isSupported(nodeVersion, pgVersion);
    const skip = () => {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    };

    if (skipForUnsupported) {
      console.error(
        `  pg - skipped - node@${nodeVersion} and pg@${pgVersion} are not compatible`
      );
      skip();
    }
    if (!shouldTest) {
      skip();
    }

    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    if (testPostgresLocally) {
      testUtils.startDocker('postgres');
    }

    instrumentation = new PgInstrumentation();

    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    instrumentation.setTracerProvider(provider);

    const pg = require('pg');
    client = new pg.Client(CONFIG);
    await client.connect();
  });

  after(async () => {
    if (testPostgresLocally) {
      testUtils.cleanUpDocker('postgres');
    }
    await client.end();
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  it('should return an instrumentation', () => {
    assert.ok(instrumentation instanceof PgInstrumentation);
  });

  it('should have correct name', () => {
    assert.strictEqual(
      instrumentation.instrumentationName,
      '@opentelemetry/instrumentation-pg'
    );
  });

  it('should maintain pg module error throwing behavior with bad arguments', () => {
    const assertPgError = (e: Error) => {
      const src = e.stack!.split('\n').map(line => line.trim())[1];
      return /node_modules[/\\]pg/.test(src);
    };

    assert.throws(
      () => {
        (client as any).query();
      },
      assertPgError,
      'pg should throw when no args provided'
    );
    runCallbackTest(null, DEFAULT_ATTRIBUTES, [], errorStatus);
    memoryExporter.reset();

    assert.doesNotThrow(
      () =>
        (client as any).query({ foo: 'bar' }, undefined, () => {
          runCallbackTest(
            null,
            {
              ...DEFAULT_ATTRIBUTES,
            },
            [],
            errorStatus
          );
        }),
      'pg should not throw when invalid config args are provided'
    );
  });

  describe('#client.query(...)', () => {
    it('should not return a promise if callback is provided', done => {
      const res = client.query('SELECT NOW()', (err, res) => {
        assert.strictEqual(err, null);
        done();
      });
      assert.strictEqual(res, undefined, 'No promise is returned');
    });

    it('should return a promise if callback is not provided', done => {
      const resPromise = client.query('SELECT NOW()');
      resPromise
        .then(res => {
          assert.ok(res);
          done();
        })
        .catch((err: Error) => {
          assert.ok(false, err.message);
        });
    });

    it('should intercept client.query(text, callback)', done => {
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SemanticAttributes.DB_STATEMENT]: 'SELECT NOW()',
      };
      const events: TimedEvent[] = [];
      const span = tracer.startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const res = client.query('SELECT NOW()', (err, res) => {
          assert.strictEqual(err, null);
          assert.ok(res);
          runCallbackTest(span, attributes, events);
          done();
        });
        assert.strictEqual(res, undefined, 'No promise is returned');
      });
    });

    it('should intercept client.query(text, values, callback)', done => {
      const query = 'SELECT $1::text';
      const values = ['0'];
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SemanticAttributes.DB_STATEMENT]: query,
      };
      const events: TimedEvent[] = [];
      const span = tracer.startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const resNoPromise = client.query(query, values, (err, res) => {
          assert.strictEqual(err, null);
          assert.ok(res);
          runCallbackTest(span, attributes, events);
          done();
        });
        assert.strictEqual(resNoPromise, undefined, 'No promise is returned');
      });
    });

    it('should intercept client.query({text, callback})', done => {
      const query = 'SELECT NOW()';
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SemanticAttributes.DB_STATEMENT]: query,
      };
      const events: TimedEvent[] = [];
      const span = tracer.startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const resNoPromise = client.query({
          text: query,
          callback: (err: Error, res: pg.QueryResult) => {
            assert.strictEqual(err, null);
            assert.ok(res);
            runCallbackTest(span, attributes, events);
            done();
          },
        } as pg.QueryConfig);
        assert.strictEqual(resNoPromise, undefined, 'No promise is returned');
      });
    });

    it('should intercept client.query({text}, callback)', done => {
      const query = 'SELECT NOW()';
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SemanticAttributes.DB_STATEMENT]: query,
      };
      const events: TimedEvent[] = [];
      const span = tracer.startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const resNoPromise = client.query({ text: query }, (err, res) => {
          assert.strictEqual(err, null);
          assert.ok(res);
          runCallbackTest(span, attributes, events);
          done();
        });
        assert.strictEqual(resNoPromise, undefined, 'No promise is returned');
      });
    });

    it('should intercept client.query(text, values)', async () => {
      const query = 'SELECT $1::text';
      const values = ['0'];
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SemanticAttributes.DB_STATEMENT]: query,
      };
      const events: TimedEvent[] = [];
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const resPromise = await client.query(query, values);
        try {
          assert.ok(resPromise);
          runCallbackTest(span, attributes, events);
        } catch (e) {
          assert.ok(false, e.message);
        }
      });
    });

    it('should intercept client.query({text, values})', async () => {
      const query = 'SELECT $1::text';
      const values = ['0'];
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SemanticAttributes.DB_STATEMENT]: query,
      };
      const events: TimedEvent[] = [];
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const resPromise = await client.query({
          text: query,
          values: values,
        });
        try {
          assert.ok(resPromise);
          runCallbackTest(span, attributes, events);
        } catch (e) {
          assert.ok(false, e.message);
        }
      });
    });

    it('should intercept client.query(plan)', async () => {
      const name = 'fetch-text';
      const query = 'SELECT $1::text';
      const values = ['0'];
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [AttributeNames.PG_PLAN]: name,
        [SemanticAttributes.DB_STATEMENT]: query,
      };
      const events: TimedEvent[] = [];
      const span = tracer.startSpan('test span');

      await context.with(trace.setSpan(context.active(), span), async () => {
        try {
          const resPromise = await client.query({
            name: name,
            text: query,
            values: values,
          });
          assert.strictEqual(resPromise.command, 'SELECT');
          runCallbackTest(span, attributes, events);
        } catch (e) {
          assert.ok(false, e.message);
        }
      });
    });

    it('should intercept client.query(text)', async () => {
      const query = 'SELECT NOW()';
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SemanticAttributes.DB_STATEMENT]: query,
      };
      const events: TimedEvent[] = [];
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        try {
          const resPromise = await client.query(query);
          assert.ok(resPromise);
          runCallbackTest(span, attributes, events);
        } catch (e) {
          assert.ok(false, e.message);
        }
      });
    });

    describe('when specifying a responseHook configuration', () => {
      const dataAttributeName = 'pg_data';
      const query = 'SELECT 0::text';
      const events: TimedEvent[] = [];

      describe('AND valid responseHook', () => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [SemanticAttributes.DB_STATEMENT]: query,
          [dataAttributeName]: '{"rowCount":1}',
        };
        beforeEach(async () => {
          const config: PgInstrumentationConfig = {
            enhancedDatabaseReporting: true,
            responseHook: (
              span: Span,
              responseInfo: PgResponseHookInformation
            ) =>
              span.setAttribute(
                dataAttributeName,
                JSON.stringify({ rowCount: responseInfo?.data.rowCount })
              ),
          };
          create(config);
        });

        it('should attach response hook data to resulting spans for query with callback ', done => {
          const span = tracer.startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            const res = client.query(query, (err, res) => {
              assert.strictEqual(err, null);
              assert.ok(res);
              runCallbackTest(span, attributes, events);
              done();
            });
            assert.strictEqual(res, undefined, 'No promise is returned');
          });
        });

        it('should attach response hook data to resulting spans for query returning a Promise', async () => {
          const attributes = {
            ...DEFAULT_ATTRIBUTES,
            [SemanticAttributes.DB_STATEMENT]: query,
            [dataAttributeName]: '{"rowCount":1}',
          };

          const span = tracer.startSpan('test span');
          await context.with(
            trace.setSpan(context.active(), span),
            async () => {
              const resPromise = await client.query({
                text: query,
              });
              try {
                assert.ok(resPromise);
                runCallbackTest(span, attributes, events);
              } catch (e) {
                assert.ok(false, e.message);
              }
            }
          );
        });
      });

      describe('AND invalid responseHook', () => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [SemanticAttributes.DB_STATEMENT]: query,
        };

        beforeEach(async () => {
          create({
            enhancedDatabaseReporting: true,
            responseHook: (
              span: Span,
              responseInfo: PgResponseHookInformation
            ) => {
              throw 'some kind of failure!';
            },
          });
        });

        it('should not do any harm when throwing an exception', done => {
          const span = tracer.startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            const res = client.query(query, (err, res) => {
              assert.strictEqual(err, null);
              assert.ok(res);
              runCallbackTest(span, attributes, events);
              done();
            });
            assert.strictEqual(res, undefined, 'No promise is returned');
          });
        });
      });
    });

    it('should handle the same callback being given to multiple client.query()s', done => {
      let events = 0;
      const parent = tracer.startSpan('parent');

      const queryHandler = (err?: Error, res?: pg.QueryResult) => {
        const span = trace.getSpan(context.active());
        assert.deepStrictEqual(span!.spanContext(), parent.spanContext());
        if (err) {
          throw err;
        }
        events += 1;
        if (events === 7) {
          done();
        }
      };

      const config = {
        text: 'SELECT NOW()',
        callback: queryHandler,
      };

      context.with(trace.setSpan(context.active(), parent), () => {
        client.query(config.text, config.callback); // 1
        client.query(config); // 2
        client.query(config.text, queryHandler); // 3
        client.query(config.text, queryHandler); // 4
        client
          .query(config.text)
          .then(result => queryHandler(undefined, result))
          .catch(err => queryHandler(err)); // 5
        client.query(config); // 6
        client.query(config); // 7
      });
    });

    it('should preserve correct context even when using the same callback in client.query()', done => {
      const spans = [tracer.startSpan('span 1'), tracer.startSpan('span 2')];
      const currentSpans: (Span | undefined)[] = [];
      const queryHandler = () => {
        currentSpans.push(trace.getSpan(context.active()));
        if (currentSpans.length === 2) {
          assert.deepStrictEqual(currentSpans, spans);
          done();
        }
      };

      context.with(trace.setSpan(context.active(), spans[0]), () => {
        client.query('SELECT NOW()', queryHandler);
      });
      context.with(trace.setSpan(context.active(), spans[1]), () => {
        client.query('SELECT NOW()', queryHandler);
      });
    });

    it('should preserve correct context even when using the same promise resolver in client.query()', done => {
      const spans = [tracer.startSpan('span 1'), tracer.startSpan('span 2')];
      const currentSpans: (Span | undefined)[] = [];
      const queryHandler = () => {
        currentSpans.push(trace.getSpan(context.active()));
        if (currentSpans.length === 2) {
          assert.deepStrictEqual(currentSpans, spans);
          done();
        }
      };

      context.with(trace.setSpan(context.active(), spans[0]), () => {
        client.query('SELECT NOW()').then(queryHandler);
      });
      context.with(trace.setSpan(context.active(), spans[1]), () => {
        client.query('SELECT NOW()').then(queryHandler);
      });
    });
  });
});
