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
import {
  MeterProvider,
  MetricReader,
} from '@opentelemetry/sdk-metrics';
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
import { InstrumentationBase } from '@opentelemetry/instrumentation';

// TODO: Replace these constants once a new version of the semantic conventions
// package is created with https://github.com/open-telemetry/opentelemetry-js/pull/4891
const SEMATTRS_CLIENT_CONNECTION_STATE = 'db.client.connection.state';

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
  }

  let pool: pgPool<pg.Client>;
  let contextManager: AsyncHooksContextManager;
  let instrumentation: PgInstrumentation;
  const provider = new BasicTracerProvider();

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

    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
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
          connectSpan.parentSpanId,
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

    it('should generate `db.client.connection.count` and `db.client.connection.pending_requests` metrics', async () => {
      const span = provider.getTracer('test-pg-pool').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
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
              'db.client.connection.count'
            );
            assert.strictEqual(
              metrics[0].descriptor.description,
              'The number of connections that are currently in state described by the state attribute.'
            );
            assert.strictEqual(
              metrics[0].dataPoints[0].attributes[
                SEMATTRS_CLIENT_CONNECTION_STATE
              ],
              'used'
            );
            assert.strictEqual(
              metrics[0].dataPoints[0].value,
              1,
              'expected to have 1 used connection'
            );
            assert.strictEqual(
              metrics[0].dataPoints[1].attributes[
                SEMATTRS_CLIENT_CONNECTION_STATE
              ],
              'idle'
            );
            assert.strictEqual(
              metrics[0].dataPoints[1].value,
              0,
              'expected to have 0 idle connections'
            );

            assert.strictEqual(
              metrics[1].descriptor.name,
              'db.client.connection.pending_requests'
            );
            assert.strictEqual(
              metrics[1].descriptor.description,
              'The number of current pending requests for an open connection.'
            );
            assert.strictEqual(
              metrics[1].dataPoints[0].value,
              0,
              'expected to have 0 pending requests'
            );
          });
        });
      });
    });
  });
});
