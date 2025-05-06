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
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import {
  PgInstrumentation,
  PgInstrumentationConfig,
  PgResponseHookInformation,
} from '../src';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import * as pg from 'pg';
import * as pgPool from 'pg-pool';
import { AttributeNames } from '../src/enums/AttributeNames';
import { TimedEvent } from './types';
import {
  DBSYSTEMVALUES_POSTGRESQL,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_NAME,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_DB_CONNECTION_STRING,
  SEMATTRS_NET_PEER_PORT,
  SEMATTRS_DB_USER,
  SEMATTRS_DB_STATEMENT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DB_CLIENT_CONNECTION_STATE,
  METRIC_DB_CLIENT_CONNECTION_COUNT,
  METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS,
  METRIC_DB_CLIENT_OPERATION_DURATION,
} from '../src/semconv';

const memoryExporter = new InMemorySpanExporter();

const CONFIG = {
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT
    ? parseInt(process.env.POSTGRES_PORT, 10)
    : 54320,
  maxClient: 1,
  idleTimeoutMillis: 10000,
};

const DEFAULT_PGPOOL_ATTRIBUTES = {
  [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_POSTGRESQL,
  [SEMATTRS_DB_NAME]: CONFIG.database,
  [SEMATTRS_NET_PEER_NAME]: CONFIG.host,
  [SEMATTRS_DB_CONNECTION_STRING]: `postgresql://${CONFIG.host}:${CONFIG.port}/${CONFIG.database}`,
  [SEMATTRS_NET_PEER_PORT]: CONFIG.port,
  [SEMATTRS_DB_USER]: CONFIG.user,
  [AttributeNames.MAX_CLIENT]: CONFIG.maxClient,
  [AttributeNames.IDLE_TIMEOUT_MILLIS]: CONFIG.idleTimeoutMillis,
};

const DEFAULT_PG_ATTRIBUTES = {
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

const runCallbackTest = (
  parentSpan: Span,
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
  testUtils.assertPropagation(pgSpan, parentSpan);
};

describe('pg-pool', () => {
  function create(config: PgInstrumentationConfig = {}) {
    instrumentation.setConfig(config);
    instrumentation.enable();

    // Disable and enable the instrumentation to visit unwrap calls
    instrumentation.disable();
    instrumentation.enable();
  }

  let pool: pgPool<pg.Client>;
  let contextManager: AsyncHooksContextManager;
  let instrumentation: PgInstrumentation;
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });

  const testPostgres = process.env.RUN_POSTGRES_TESTS; // For CI: assumes local postgres db is already available
  const testPostgresLocally = process.env.RUN_POSTGRES_TESTS_LOCAL; // For local: spins up local postgres db via docker
  const shouldTest = testPostgres || testPostgresLocally; // Skips these tests if false (default)

  before(function () {
    const skip = () => {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    };

    if (!shouldTest) {
      skip();
    }

    if (testPostgresLocally) {
      testUtils.startDocker('postgres');
    }

    instrumentation = new PgInstrumentation();

    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    instrumentation.setTracerProvider(provider);

    const pgPool = require('pg-pool');
    pool = new pgPool(CONFIG);
  });

  after(done => {
    if (testPostgresLocally) {
      testUtils.cleanUpDocker('postgres');
    }

    pool.end(() => {
      done();
    });
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

  describe('#pool.connect()', () => {
    // promise - checkout a client
    it('should intercept pool.connect()', async () => {
      const pgPoolAttributes = {
        ...DEFAULT_PGPOOL_ATTRIBUTES,
      };
      const pgAttributes = {
        ...DEFAULT_PG_ATTRIBUTES,
        [SEMATTRS_DB_STATEMENT]: 'SELECT NOW()',
      };
      const events: TimedEvent[] = [];
      const span = provider.getTracer('test-pg-pool').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const client = await pool.connect();
        runCallbackTest(span, pgPoolAttributes, events, unsetStatus, 2, 1);

        const [connectSpan, poolConnectSpan] =
          memoryExporter.getFinishedSpans();
        assert.strictEqual(
          connectSpan.parentSpanContext?.spanId,
          poolConnectSpan.spanContext().spanId
        );

        assert.ok(client, 'pool.connect() returns a promise');
        try {
          await client.query('SELECT NOW()');
          runCallbackTest(span, pgAttributes, events, unsetStatus, 3, 2);
        } finally {
          client.release();
        }
      });
    });

    // Test connection string support
    it('should handle connection string in pool options', async () => {
      const connectionString = `postgresql://${CONFIG.user}:${CONFIG.password}@${CONFIG.host}:${CONFIG.port}/${CONFIG.database}`;
      const poolWithConnString = new pgPool({
        connectionString,
        idleTimeoutMillis: CONFIG.idleTimeoutMillis,
      });

      const expectedAttributes = {
        [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_POSTGRESQL,
        [SEMATTRS_DB_NAME]: CONFIG.database,
        [SEMATTRS_NET_PEER_NAME]: CONFIG.host,
        [SEMATTRS_DB_CONNECTION_STRING]: `postgresql://${CONFIG.host}:${CONFIG.port}/${CONFIG.database}`,
        [SEMATTRS_NET_PEER_PORT]: CONFIG.port,
        [SEMATTRS_DB_USER]: CONFIG.user,
        [AttributeNames.IDLE_TIMEOUT_MILLIS]: CONFIG.idleTimeoutMillis,
      };

      const events: TimedEvent[] = [];
      const span = provider.getTracer('test-pg-pool').startSpan('test span');

      await context.with(trace.setSpan(context.active(), span), async () => {
        const client = await poolWithConnString.connect();
        runCallbackTest(span, expectedAttributes, events, unsetStatus, 2, 1);
        client.release();
      });

      await poolWithConnString.end();
    });

    // callback - checkout a client
    it('should not return a promise if callback is provided', done => {
      const pgPoolAttributes = {
        ...DEFAULT_PGPOOL_ATTRIBUTES,
      };
      const pgAttributes = {
        ...DEFAULT_PG_ATTRIBUTES,
        [SEMATTRS_DB_STATEMENT]: 'SELECT NOW()',
      };
      const events: TimedEvent[] = [];
      const parentSpan = provider
        .getTracer('test-pg-pool')
        .startSpan('test span');
      context.with(trace.setSpan(context.active(), parentSpan), () => {
        const resNoPromise = pool.connect((err, client, release) => {
          if (err) {
            return done(err);
          }
          if (!release) {
            throw new Error('Did not receive release function');
          }
          if (!client) {
            throw new Error('No client received');
          }
          assert.ok(client);
          runCallbackTest(
            parentSpan,
            pgPoolAttributes,
            events,
            unsetStatus,
            1,
            0
          );
          client.query('SELECT NOW()', (err, ret) => {
            release();
            if (err) {
              return done(err);
            }
            assert.ok(ret);
            runCallbackTest(
              parentSpan,
              pgAttributes,
              events,
              unsetStatus,
              2,
              1
            );
            done();
          });
        });
        assert.strictEqual(resNoPromise, undefined, 'No promise is returned');
      });
    });

    it('should not generate traces when requireParentSpan=true is specified', async () => {
      // The pool gets shared between tests. We need to create a separate one
      // to test cold start, which can cause nested spans
      const newPool = new pgPool(CONFIG);
      create({
        requireParentSpan: true,
      });
      const client = await newPool.connect();
      try {
        await client.query('SELECT NOW()');
      } finally {
        client.release();
        await newPool.end();
      }
      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);
    });
  });

  describe('#pool.query()', () => {
    // promise
    it('should call patched client.query()', async () => {
      const pgPoolAttributes = {
        ...DEFAULT_PGPOOL_ATTRIBUTES,
      };
      const pgAttributes = {
        ...DEFAULT_PG_ATTRIBUTES,
        [SEMATTRS_DB_STATEMENT]: 'SELECT NOW()',
      };
      const events: TimedEvent[] = [];
      const span = provider.getTracer('test-pg-pool').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const result = await pool.query('SELECT NOW()');
        runCallbackTest(span, pgPoolAttributes, events, unsetStatus, 2, 0);
        runCallbackTest(span, pgAttributes, events, unsetStatus, 2, 1);
        assert.ok(result, 'pool.query() returns a promise');
      });
    });

    // callback
    it('should not return a promise if callback is provided', done => {
      const pgPoolAttributes = {
        ...DEFAULT_PGPOOL_ATTRIBUTES,
      };
      const pgAttributes = {
        ...DEFAULT_PG_ATTRIBUTES,
        [SEMATTRS_DB_STATEMENT]: 'SELECT NOW()',
      };
      const events: TimedEvent[] = [];
      const parentSpan = provider
        .getTracer('test-pg-pool')
        .startSpan('test span');
      context.with(trace.setSpan(context.active(), parentSpan), () => {
        const resNoPromise = pool.query('SELECT NOW()', (err, result) => {
          if (err) {
            return done(err);
          }
          runCallbackTest(
            parentSpan,
            pgPoolAttributes,
            events,
            unsetStatus,
            2,
            0
          );
          runCallbackTest(parentSpan, pgAttributes, events, unsetStatus, 2, 1);
          done();
        });
        assert.strictEqual(resNoPromise, undefined, 'No promise is returned');
      });
    });

    describe('when specifying a responseHook configuration', () => {
      const dataAttributeName = 'pg_data';
      const query = 'SELECT 0::text';
      const events: TimedEvent[] = [];

      describe('AND valid responseHook', () => {
        const pgPoolAttributes = {
          ...DEFAULT_PGPOOL_ATTRIBUTES,
        };
        const pgAttributes = {
          ...DEFAULT_PG_ATTRIBUTES,
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
          const parentSpan = provider
            .getTracer('test-pg-pool')
            .startSpan('test span');
          context.with(trace.setSpan(context.active(), parentSpan), () => {
            const resNoPromise = pool.query(query, (err, result) => {
              if (err) {
                return done(err);
              }
              runCallbackTest(
                parentSpan,
                pgPoolAttributes,
                events,
                unsetStatus,
                2,
                0
              );
              runCallbackTest(
                parentSpan,
                pgAttributes,
                events,
                unsetStatus,
                2,
                1
              );
              done();
            });
            assert.strictEqual(
              resNoPromise,
              undefined,
              'No promise is returned'
            );
          });
        });

        it('should attach response hook data to resulting spans for query returning a Promise', async () => {
          const span = provider
            .getTracer('test-pg-pool')
            .startSpan('test span');
          await context.with(
            trace.setSpan(context.active(), span),
            async () => {
              const result = await pool.query(query);
              runCallbackTest(
                span,
                pgPoolAttributes,
                events,
                unsetStatus,
                2,
                0
              );
              runCallbackTest(span, pgAttributes, events, unsetStatus, 2, 1);
              assert.ok(result, 'pool.query() returns a promise');
            }
          );
        });
      });

      describe('AND invalid responseHook', () => {
        const pgPoolAttributes = {
          ...DEFAULT_PGPOOL_ATTRIBUTES,
        };
        const pgAttributes = {
          ...DEFAULT_PG_ATTRIBUTES,
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
          const parentSpan = provider
            .getTracer('test-pg-pool')
            .startSpan('test span');
          context.with(trace.setSpan(context.active(), parentSpan), () => {
            const resNoPromise = pool.query(query, (err, result) => {
              if (err) {
                return done(err);
              }
              assert.ok(result);

              runCallbackTest(
                parentSpan,
                pgPoolAttributes,
                events,
                unsetStatus,
                2,
                0
              );
              runCallbackTest(
                parentSpan,
                pgAttributes,
                events,
                unsetStatus,
                2,
                1
              );
              done();
            });
            assert.strictEqual(
              resNoPromise,
              undefined,
              'No promise is returned'
            );
          });
        });
      });
    });
  });

  describe('pg metrics', () => {
    let metricReader: testUtils.TestMetricReader;

    beforeEach(() => {
      metricReader = testUtils.initMeterProvider(instrumentation);
    });

    it('should generate `db.client.connection.count` and `db.client.connection.pending_requests` metrics', done => {
      pool.connect((err, client, release) => {
        if (err) {
          throw new Error(err.message);
        }
        if (!release) {
          throw new Error('Did not receive release function');
        }
        if (!client) {
          throw new Error('No client received');
        }
        assert.ok(client);

        client.query('SELECT NOW()', async (err, ret) => {
          release();
          if (err) {
            throw new Error(err.message);
          }
          assert.ok(ret);

          const { resourceMetrics, errors } = await metricReader.collect();
          assert.deepEqual(
            errors,
            [],
            'expected no errors from the callback during metric collection'
          );

          const metrics = resourceMetrics.scopeMetrics[0].metrics;
          assert.strictEqual(
            metrics[0].descriptor.name,
            METRIC_DB_CLIENT_OPERATION_DURATION
          );

          assert.strictEqual(
            metrics[1].descriptor.name,
            METRIC_DB_CLIENT_CONNECTION_COUNT
          );
          assert.strictEqual(
            metrics[1].descriptor.description,
            'The number of connections that are currently in state described by the state attribute.'
          );
          assert.strictEqual(
            metrics[1].dataPoints[0].attributes[
              ATTR_DB_CLIENT_CONNECTION_STATE
            ],
            'used'
          );
          assert.strictEqual(
            metrics[1].dataPoints[0].value,
            1,
            'expected to have 1 used connection'
          );
          assert.strictEqual(
            metrics[1].dataPoints[1].attributes[
              ATTR_DB_CLIENT_CONNECTION_STATE
            ],
            'idle'
          );
          assert.strictEqual(
            metrics[1].dataPoints[1].value,
            0,
            'expected to have 0 idle connections'
          );

          assert.strictEqual(
            metrics[2].descriptor.name,
            METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS
          );
          assert.strictEqual(
            metrics[2].descriptor.description,
            'The number of current pending requests for an open connection.'
          );
          assert.strictEqual(
            metrics[2].dataPoints[0].value,
            0,
            'expected to have 0 pending requests'
          );
          done();
        });
      });
    });

    it('should generate `db.client.*` metrics (Promises-style)', async (...args) => {
      const client = await pool.connect();

      try {
        const ret = await client.query('SELECT NOW()');
        assert.ok(ret);
      } finally {
        client.release();
      }

      const { resourceMetrics, errors } = await metricReader.collect();
      assert.deepEqual(
        errors,
        [],
        'expected no errors from the callback during metric collection'
      );

      // We just test the expected metric *names* here. The particulars of the
      // metric values are already tested in other test cases.
      const metrics = resourceMetrics.scopeMetrics[0].metrics;
      assert.strictEqual(
        metrics[0].descriptor.name,
        METRIC_DB_CLIENT_OPERATION_DURATION
      );
      assert.strictEqual(
        metrics[1].descriptor.name,
        METRIC_DB_CLIENT_CONNECTION_COUNT
      );
      assert.strictEqual(
        metrics[2].descriptor.name,
        METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS
      );
    });

    it('should not add duplicate event listeners to PgPool events', done => {
      const poolAux: pgPool<pg.Client> = new pgPool(CONFIG);

      const finish = () => {
        poolAux.end();
        done();
      };

      let completed = 0;
      poolAux.connect((err, client, release) => {
        if (err) {
          throw new Error(err.message);
        }
        if (!release) {
          throw new Error('Did not receive release function');
        }
        if (!client) {
          throw new Error('No client received');
        }
        assert.ok(client);
        release();

        assert.equal(
          poolAux.listenerCount('connect'),
          1,
          `${poolAux.listenerCount('connect')} event listener(s) for 'connect'`
        );
        assert.equal(
          poolAux.listenerCount('acquire'),
          1,
          `${poolAux.listenerCount('acquire')} event listener(s) for 'acquire'`
        );
        assert.equal(
          poolAux.listenerCount('remove'),
          1,
          `${poolAux.listenerCount('remove')} event listener(s) for 'remove'`
        );
        assert.equal(
          poolAux.listenerCount('release'),
          1,
          `${poolAux.listenerCount('release')} event listener(s) for 'release'`
        );

        completed++;
        if (completed >= 2) {
          finish();
        }
      });

      poolAux.connect((err, client, release) => {
        if (err) {
          throw new Error(err.message);
        }
        if (!release) {
          throw new Error('Did not receive release function');
        }
        if (!client) {
          throw new Error('No client received');
        }
        assert.ok(client);
        release();

        assert.equal(
          poolAux.listenerCount('connect'),
          1,
          `${poolAux.listenerCount('connect')} event listener(s) for 'connect'`
        );
        assert.equal(
          poolAux.listenerCount('acquire'),
          1,
          `${poolAux.listenerCount('acquire')} event listener(s) for 'acquire'`
        );
        assert.equal(
          poolAux.listenerCount('remove'),
          1,
          `${poolAux.listenerCount('remove')} event listener(s) for 'remove'`
        );
        assert.equal(
          poolAux.listenerCount('release'),
          1,
          `${poolAux.listenerCount('release')} event listener(s) for 'release'`
        );

        completed++;
        if (completed >= 2) {
          finish();
        }
      });
    });

    it('adding a custom event listener should still work with the default event listeners to PgPool events', done => {
      const poolAux: pgPool<pg.Client> = new pgPool(CONFIG);
      let testValue = 0;
      poolAux.on('connect', () => {
        testValue = 1;
      });

      poolAux.connect((err, client, release) => {
        if (err) {
          throw new Error(err.message);
        }
        if (!release) {
          throw new Error('Did not receive release function');
        }
        if (!client) {
          throw new Error('No client received');
        }
        assert.ok(client);

        client.query('SELECT NOW()', async (err, ret) => {
          release();
          if (err) {
            throw new Error(err.message);
          }
          assert.ok(ret);
          assert.equal(
            poolAux.listenerCount('connect'),
            2,
            `${poolAux.listenerCount(
              'connect'
            )} event listener(s) for 'connect'`
          );
          assert.equal(
            poolAux.listenerCount('acquire'),
            1,
            `${poolAux.listenerCount(
              'acquire'
            )} event listener(s) for 'acquire'`
          );
          assert.equal(
            poolAux.listenerCount('remove'),
            1,
            `${poolAux.listenerCount('remove')} event listener(s) for 'remove'`
          );
          assert.equal(
            poolAux.listenerCount('release'),
            1,
            `${poolAux.listenerCount(
              'release'
            )} event listener(s) for 'release'`
          );
          assert.equal(testValue, 1);

          const { resourceMetrics, errors } = await metricReader.collect();
          assert.deepEqual(
            errors,
            [],
            'expected no errors from the callback during metric collection'
          );

          const metrics = resourceMetrics.scopeMetrics[0].metrics;
          assert.strictEqual(
            metrics[1].descriptor.name,
            METRIC_DB_CLIENT_CONNECTION_COUNT
          );
          assert.strictEqual(
            metrics[1].dataPoints[0].attributes[
              ATTR_DB_CLIENT_CONNECTION_STATE
            ],
            'used'
          );
          assert.strictEqual(
            metrics[1].dataPoints[0].value,
            1,
            'expected to have 1 used connection'
          );

          poolAux.end();
          done();
        });
      });
    });

    it('when creating multiple pools, all of them should be instrumented', done => {
      const pool1: pgPool<pg.Client> = new pgPool(CONFIG);
      const pool2: pgPool<pg.Client> = new pgPool(CONFIG);

      const finish = () => {
        pool1.end();
        pool2.end();
        done();
      };

      let completed = 0;
      pool1.connect((err, client, release) => {
        if (err) {
          throw new Error(err.message);
        }
        if (!release) {
          throw new Error('Did not receive release function');
        }
        if (!client) {
          throw new Error('No client received');
        }
        assert.ok(client);
        release();

        assert.equal(
          pool1.listenerCount('connect'),
          1,
          `${pool1.listenerCount(
            'connect'
          )} event listener(s) for 'connect' on pool1`
        );
        assert.equal(
          pool1.listenerCount('acquire'),
          1,
          `${pool1.listenerCount(
            'acquire'
          )} event listener(s) for 'acquire' on pool1`
        );
        assert.equal(
          pool1.listenerCount('remove'),
          1,
          `${pool1.listenerCount(
            'remove'
          )} event listener(s) for 'remove' on pool1`
        );
        assert.equal(
          pool1.listenerCount('release'),
          1,
          `${pool1.listenerCount(
            'release'
          )} event listener(s) for 'release' on pool1`
        );

        completed++;
        if (completed >= 2) {
          finish();
        }
      });

      pool2.connect((err, client, release) => {
        if (err) {
          throw new Error(err.message);
        }
        if (!release) {
          throw new Error('Did not receive release function');
        }
        if (!client) {
          throw new Error('No client received');
        }
        assert.ok(client);
        release();

        assert.equal(
          pool2.listenerCount('connect'),
          1,
          `${pool2.listenerCount(
            'connect'
          )} event listener(s) for 'connect' on pool2`
        );
        assert.equal(
          pool2.listenerCount('acquire'),
          1,
          `${pool2.listenerCount(
            'acquire'
          )} event listener(s) for 'acquire' on pool2`
        );
        assert.equal(
          pool2.listenerCount('remove'),
          1,
          `${pool2.listenerCount(
            'remove'
          )} event listener(s) for 'remove' on pool2`
        );
        assert.equal(
          pool2.listenerCount('release'),
          1,
          `${pool2.listenerCount(
            'release'
          )} event listener(s) for 'release' on pool2`
        );

        completed++;
        if (completed >= 2) {
          finish();
        }
      });
    });
  });
});

describe('pg-pool (ESM)', () => {
  it('should work with ESM usage', async () => {
    await testUtils.runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/use-pg-pool.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        NODE_NO_WARNINGS: '1',
      },
      checkResult: (err, stdout, stderr) => {
        assert.ifError(err);
      },
      checkCollector: (collector: testUtils.TestCollector) => {
        const spans = collector.sortedSpans;

        assert.strictEqual(spans.length, 6);

        let span = spans.shift()!;
        assert.strictEqual(span.name, 'test-span');
        assert.strictEqual(span.kind, 1 /* OtlpSpanKind.INTERNAL */);
        const expectedRemainingSpanNames = [
          // I believe two sets of `*.connect` spans because pg-pool opens
          // two connections to start.
          'pg-pool.connect',
          'pg.connect',
          'pg-pool.connect',
          'pg.connect',
          'pg.query:SELECT otel_pg_database',
        ];
        for (const expectedName of expectedRemainingSpanNames) {
          span = spans.shift()!;
          assert.strictEqual(span.name, expectedName);
        }
      },
    });
  });
});
