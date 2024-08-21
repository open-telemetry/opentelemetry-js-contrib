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
import {
  DataPoint,
  Histogram,
  MeterProvider,
  MetricReader,
} from '@opentelemetry/sdk-metrics';
import * as assert from 'assert';
import type * as pg from 'pg';
import * as sinon from 'sinon';
import stringify from 'safe-stable-stringify';
import {
  PgInstrumentation,
  PgInstrumentationConfig,
  PgResponseHookInformation,
} from '../src';
import { AttributeNames } from '../src/enums/AttributeNames';
import { TimedEvent } from './types';
import {
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_NAME,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_DB_CONNECTION_STRING,
  SEMATTRS_NET_PEER_PORT,
  SEMATTRS_DB_USER,
  DBSYSTEMVALUES_POSTGRESQL,
} from '@opentelemetry/semantic-conventions';
import { addSqlCommenterComment } from '@opentelemetry/sql-common';
import { InstrumentationBase } from '@opentelemetry/instrumentation';

// TODO: Replace these constants once a new version of the semantic conventions
// package is created
const SEMATTRS_ERROR_TYPE = 'error.type';

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
  [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_POSTGRESQL,
  [SEMATTRS_DB_NAME]: CONFIG.database,
  [SEMATTRS_NET_PEER_NAME]: CONFIG.host,
  [SEMATTRS_DB_CONNECTION_STRING]: `postgresql://${CONFIG.host}:${CONFIG.port}/${CONFIG.database}`,
  [SEMATTRS_NET_PEER_PORT]: CONFIG.port,
  [SEMATTRS_DB_USER]: CONFIG.user,
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

  let postgres: typeof pg;
  let client: pg.Client;
  let instrumentation: PgInstrumentation;
  let contextManager: AsyncHooksContextManager;
  const provider = new BasicTracerProvider();
  const tracer = provider.getTracer('external');

  const testPostgres = process.env.RUN_POSTGRES_TESTS; // For CI: assumes local postgres db is already available
  const testPostgresLocally = process.env.RUN_POSTGRES_TESTS_LOCAL; // For local: spins up local postgres db via docker
  const shouldTest = testPostgres || testPostgresLocally; // Skips these tests if false (default)

  function getExecutedQueries() {
    return (client as any).queryQueue.push.args.flat() as (pg.Query & {
      text?: string;
    })[];
  }

  before(async function () {
    const skip = () => {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    };

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

    postgres = require('pg');
    client = new postgres.Client(CONFIG);
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

    // Add a spy on the underlying client's internal query queue so that
    // we could assert on what the final queries are that are executed
    sinon.spy((client as any).queryQueue, 'push');
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    sinon.restore();
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

    assert.throws(
      () => {
        (client as any).query(null);
      },
      assertPgError,
      'pg should throw when null provided as only arg'
    );
    runCallbackTest(null, DEFAULT_ATTRIBUTES, [], errorStatus);
    memoryExporter.reset();

    assert.throws(
      () => {
        (client as any).query(undefined);
      },
      assertPgError,
      'pg should throw when undefined provided as only arg'
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

  describe('#client.connect(...)', () => {
    let connClient: pg.Client;

    beforeEach(() => {
      connClient = new postgres.Client(CONFIG);
    });

    afterEach(async () => {
      await connClient.end();
    });

    it('should not return a promise when callback is provided', done => {
      const res = connClient.connect(err => {
        assert.strictEqual(err, null);
        done();
      });
      assert.strictEqual(res, undefined, 'No promise is returned');
    });

    it('should pass the client connection object in the callback function', done => {
      connClient.connect(function (err: Error) {
        // Even though the documented signature for connect() callback is `(err) => void`
        // `pg` actually also passes the client if the connection was successful and some
        // packages(`knex`) might rely on that
        // https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js#L282
        assert.strictEqual(arguments[1], connClient);
        done();
      });
    });

    it('should return a promise if callback is not provided', done => {
      const resPromise = connClient.connect();
      resPromise
        .then(res => {
          assert.equal(res, undefined);
          assert.deepStrictEqual(
            memoryExporter.getFinishedSpans()[0].name,
            'pg.connect'
          );
          done();
        })
        .catch((err: Error) => {
          assert.ok(false, err.message);
        });
    });

    it('should throw on failure', done => {
      connClient = new postgres.Client({ ...CONFIG, port: 59999 });
      connClient
        .connect()
        .then(() => assert.fail('expected connect to throw'))
        .catch(err => {
          assert(err instanceof Error);
          done();
        });
    });

    it('should call back with an error', done => {
      connClient = new postgres.Client({ ...CONFIG, port: 59999 });
      connClient.connect(err => {
        assert(err instanceof Error);
        done();
      });
    });

    it('should intercept connect', async () => {
      const span = tracer.startSpan('test span');
      context.with(trace.setSpan(context.active(), span), async () => {
        await connClient.connect();
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        const connectSpan = spans[0];
        assert.deepStrictEqual(connectSpan.name, 'pg.connect');
        testUtils.assertSpan(
          connectSpan,
          SpanKind.CLIENT,
          DEFAULT_ATTRIBUTES,
          [],
          { code: SpanStatusCode.UNSET }
        );

        testUtils.assertPropagation(connectSpan, span);
      });
    });

    it('should not generate traces when requireParentSpan=true is specified', async () => {
      instrumentation.setConfig({
        requireParentSpan: true,
      });
      memoryExporter.reset();
      await connClient.connect();
      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);
    });
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
        [SEMATTRS_DB_STATEMENT]: 'SELECT NOW()',
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
        [SEMATTRS_DB_STATEMENT]: query,
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
        [SEMATTRS_DB_STATEMENT]: query,
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
        [SEMATTRS_DB_STATEMENT]: query,
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
        [SEMATTRS_DB_STATEMENT]: query,
      };
      const events: TimedEvent[] = [];
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const resPromise = await client.query(query, values);
        try {
          assert.ok(resPromise);
          runCallbackTest(span, attributes, events);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
      });
    });

    it('should intercept client.query({text, values})', async () => {
      const query = 'SELECT $1::text';
      const values = ['0'];
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SEMATTRS_DB_STATEMENT]: query,
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
        } catch (e: any) {
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
        [SEMATTRS_DB_STATEMENT]: query,
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
        } catch (e: any) {
          assert.ok(false, e.message);
        }
      });
    });

    it('should intercept client.query(text)', async () => {
      const query = 'SELECT NOW()';
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SEMATTRS_DB_STATEMENT]: query,
      };
      const events: TimedEvent[] = [];
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        try {
          const resPromise = await client.query(query);
          assert.ok(resPromise);
          runCallbackTest(span, attributes, events);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
      });
    });

    describe('Check configuration enhancedDatabaseReporting:true', () => {
      const obj = { type: 'Fiat', model: '500', color: 'white' };
      const buf = Buffer.from('abc');
      const objWithToPostgres = {
        toPostgres: () => {
          return 'custom value';
        },
      };
      const query =
        'SELECT $1::text as msg1, $2::bytea as bufferParam, $3::integer as numberParam, $4::jsonb as objectParam, $5::text as objToPostgres, $6::text as msg2, $7::text as msg3';
      const values = [
        'Hello,World',
        buf,
        6,
        obj,
        objWithToPostgres,
        null,
        undefined,
      ];

      const events: TimedEvent[] = [];

      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SEMATTRS_DB_STATEMENT]: query,
        [AttributeNames.PG_VALUES]: [
          'Hello,World',
          'abc',
          '6',
          '{"type":"Fiat","model":"500","color":"white"}',
          'custom value',
          'null',
          'null',
        ],
      };
      beforeEach(async () => {
        create({
          enhancedDatabaseReporting: true,
        });
      });

      it('When enhancedDatabaseReporting:true, values should appear as parsable array of strings', done => {
        const span = tracer.startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          client.query(query, values, (err, res) => {
            assert.strictEqual(err, null);
            assert.ok(res);
            runCallbackTest(span, attributes, events);
            done();
          });
        });
      });
    });

    describe('when specifying a requestHook configuration', () => {
      const dataAttributeName = 'pg_data';
      const query = 'SELECT 0::text';
      const events: TimedEvent[] = [];

      // these are the attributes that we'd expect would end up on the final
      // span if there is no requestHook.
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SEMATTRS_DB_STATEMENT]: query,
      };

      // These are the attributes we expect on the span after the requestHook
      // has run. We set up the hook to just add to the span a stringified
      // version of the args it receives (which is an easy way to assert both
      // that the proper args were passed and that the hook was called).
      const attributesAfterHook = {
        ...attributes,
        [dataAttributeName]: stringify({
          connection: {
            database: CONFIG.database,
            port: CONFIG.port,
            host: CONFIG.host,
            user: CONFIG.user,
          },
          query: { text: query },
        }),
      };

      describe('AND valid requestHook', () => {
        beforeEach(async () => {
          create({
            enhancedDatabaseReporting: true,
            requestHook: (span, requestInfo) => {
              span.setAttribute(dataAttributeName, stringify(requestInfo));
            },
          });
        });

        it('should attach request hook data to resulting spans for query with callback ', done => {
          const span = tracer.startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            const res = client.query(query, (err, res) => {
              assert.strictEqual(err, null);
              assert.ok(res);
              runCallbackTest(span, attributesAfterHook, events);
              done();
            });
            assert.strictEqual(res, undefined, 'No promise is returned');
          });
        });

        it('should attach request hook data to resulting spans for query returning a Promise', async () => {
          const span = tracer.startSpan('test span');
          await context.with(
            trace.setSpan(context.active(), span),
            async () => {
              const resPromise = await client.query({ text: query });
              try {
                assert.ok(resPromise);
                runCallbackTest(span, attributesAfterHook, events);
              } catch (e: any) {
                assert.ok(false, e.message);
              }
            }
          );
        });
      });

      describe('AND invalid requestHook', () => {
        beforeEach(async () => {
          create({
            enhancedDatabaseReporting: true,
            requestHook: (_span, _requestInfo) => {
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

    describe('when specifying a responseHook configuration', () => {
      const dataAttributeName = 'pg_data';
      const query = 'SELECT 0::text';
      const events: TimedEvent[] = [];

      describe('AND valid responseHook', () => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [SEMATTRS_DB_STATEMENT]: query,
          [dataAttributeName]: '{"rowCount":1}',
        };
        beforeEach(async () => {
          create({
            enhancedDatabaseReporting: true,
            responseHook: (
              span: Span,
              responseInfo: PgResponseHookInformation
            ) =>
              span.setAttribute(
                dataAttributeName,
                JSON.stringify({ rowCount: responseInfo?.data.rowCount })
              ),
          });
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
            [SEMATTRS_DB_STATEMENT]: query,
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
              } catch (e: any) {
                assert.ok(false, e.message);
              }
            }
          );
        });
      });

      describe('AND invalid responseHook', () => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [SEMATTRS_DB_STATEMENT]: query,
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

    it('should not add sqlcommenter comment when flag is not specified', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        try {
          const query = 'SELECT NOW()';
          const resPromise = await client.query(query);
          assert.ok(resPromise);

          const [span] = memoryExporter.getFinishedSpans();
          assert.ok(span);

          const commentedQuery = addSqlCommenterComment(
            trace.wrapSpanContext(span.spanContext()),
            query
          );

          const executedQueries = getExecutedQueries();
          assert.equal(executedQueries.length, 1);
          assert.equal(executedQueries[0].text, query);
          assert.notEqual(query, commentedQuery);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
      });
    });

    it('should not add sqlcommenter comment with client.query({text, callback}) when flag is not specified', done => {
      const span = tracer.startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const query = 'SELECT NOW()';
        client.query({
          text: query,
          callback: (err: Error, res: pg.QueryResult) => {
            assert.strictEqual(err, null);
            assert.ok(res);

            const [span] = memoryExporter.getFinishedSpans();
            const commentedQuery = addSqlCommenterComment(
              trace.wrapSpanContext(span.spanContext()),
              query
            );

            const executedQueries = getExecutedQueries();
            assert.equal(executedQueries.length, 1);
            assert.equal(executedQueries[0].text, query);
            assert.notEqual(query, commentedQuery);
            done();
          },
        } as pg.QueryConfig);
      });
    });

    it('should add sqlcommenter comment when addSqlCommenterCommentToQueries=true is specified', async () => {
      instrumentation.setConfig({
        addSqlCommenterCommentToQueries: true,
      });

      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        try {
          const query = 'SELECT NOW()';
          const resPromise = await client.query(query);
          assert.ok(resPromise);

          const [span] = memoryExporter.getFinishedSpans();
          const commentedQuery = addSqlCommenterComment(
            trace.wrapSpanContext(span.spanContext()),
            query
          );

          const executedQueries = getExecutedQueries();
          assert.equal(executedQueries.length, 1);
          assert.equal(executedQueries[0].text, commentedQuery);
          assert.notEqual(query, commentedQuery);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
      });
    });

    it('should add sqlcommenter comment when addSqlCommenterCommentToQueries=true is specified with client.query({text, callback})', done => {
      instrumentation.setConfig({
        addSqlCommenterCommentToQueries: true,
      });

      const span = tracer.startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const query = 'SELECT NOW()';
        client.query({
          text: query,
          callback: (err: Error, res: pg.QueryResult) => {
            assert.strictEqual(err, null);
            assert.ok(res);

            const [span] = memoryExporter.getFinishedSpans();
            const commentedQuery = addSqlCommenterComment(
              trace.wrapSpanContext(span.spanContext()),
              query
            );

            const executedQueries = getExecutedQueries();
            assert.equal(executedQueries.length, 1);
            assert.equal(executedQueries[0].text, commentedQuery);
            assert.notEqual(query, commentedQuery);
            done();
          },
        } as pg.QueryConfig);
      });
    });

    it('should not generate traces for client.query() when requireParentSpan=true is specified', done => {
      instrumentation.setConfig({
        requireParentSpan: true,
      });
      memoryExporter.reset();
      client.query('SELECT NOW()', (err, res) => {
        assert.strictEqual(err, null);
        assert.ok(res);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 0);
        done();
      });
    });
  });

  describe('pg metrics', () => {
    // TODO replace once a new version of opentelemetry-test-utils is created
    class TestMetricReader extends MetricReader {
      constructor() {
        super();
      }
      protected async onForceFlush(): Promise<void> {}
      protected async onShutdown(): Promise<void> {}
    }
    const initMeterProvider = (
      instrumentation: InstrumentationBase
    ): TestMetricReader => {
      const metricReader = new TestMetricReader();
      const meterProvider = new MeterProvider({
        readers: [metricReader],
      });
      instrumentation.setMeterProvider(meterProvider);
      return metricReader;
    };

    let metricReader: TestMetricReader;

    beforeEach(() => {
      metricReader = initMeterProvider(instrumentation);
    });

    it('should generate db.client.operation.duration metric', done => {
      client.query('SELECT NOW()', async (_, ret) => {
        assert.ok(ret, 'query should be executed');

        const { resourceMetrics, errors } = await metricReader.collect();
        assert.deepEqual(
          errors,
          [],
          'expected no errors from the callback during metric collection'
        );

        const metrics = resourceMetrics.scopeMetrics[0].metrics;
        assert.strictEqual(
          metrics[0].descriptor.name,
          'db.client.operation.duration'
        );
        assert.strictEqual(
          metrics[0].descriptor.description,
          'Duration of database client operations.'
        );
        const dataPoint = metrics[0].dataPoints[0];
        assert.strictEqual(
          dataPoint.attributes[SEMATTRS_DB_SYSTEM],
          DBSYSTEMVALUES_POSTGRESQL
        );
        assert.strictEqual(
          dataPoint.attributes[SEMATTRS_ERROR_TYPE],
          undefined
        );

        const v = (dataPoint as DataPoint<Histogram>).value;
        v.min = v.min ? v.min : 0;
        v.max = v.max ? v.max : 0;
        assert.equal(
          v.min > 0,
          true,
          'expect min value for Histogram to be greater than 0'
        );
        assert.equal(
          v.max > 0,
          true,
          'expect max value for Histogram to be greater than 0'
        );
      });
    });

    it('should generate db.client.operation.duration metric with error attribute', done => {
      client.query('SELECT test()', async (err, ret) => {
        assert.notEqual(err, null);
        const { resourceMetrics, errors } = await metricReader.collect();
        assert.deepEqual(
          errors,
          [],
          'expected no errors from the callback during metric collection'
        );

        const metrics = resourceMetrics.scopeMetrics[0].metrics;
        assert.strictEqual(
          metrics[0].descriptor.name,
          'db.client.operation.duration'
        );
        assert.strictEqual(
          metrics[0].descriptor.description,
          'Duration of database client operations.'
        );
        const dataPoint = metrics[0].dataPoints[0];
        assert.strictEqual(
          dataPoint.attributes[SEMATTRS_DB_SYSTEM],
          DBSYSTEMVALUES_POSTGRESQL
        );
        assert.strictEqual(
          dataPoint.attributes[SEMATTRS_ERROR_TYPE],
          'function test() does not exist'
        );

        const v = (dataPoint as DataPoint<Histogram>).value;
        v.min = v.min ? v.min : 0;
        v.max = v.max ? v.max : 0;
        assert.equal(
          v.min > 0,
          true,
          'expect min value for Histogram to be greater than 0'
        );
        assert.equal(
          v.max > 0,
          true,
          'expect max value for Histogram to be greater than 0'
        );
      });
    });
  });
});
