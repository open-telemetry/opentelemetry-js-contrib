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

import { NoopLogger, StatusCode, context, setSpan } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as testUtils from '@opentelemetry/test-utils';
import {
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import * as assert from 'assert';
import * as mysql from 'mysql';
import { MysqlPlugin, plugin } from '../src';
import {
  DatabaseAttribute,
  GeneralAttribute,
} from '@opentelemetry/semantic-conventions';

const port = Number(process.env.MYSQL_PORT) || 33306;
const database = process.env.MYSQL_DATABASE || 'test_db';
const host = process.env.MYSQL_HOST || '127.0.0.1';
const user = process.env.MYSQL_USER || 'otel';
const password = process.env.MYSQL_PASSWORD || 'secret';

describe('mysql@2.x', () => {
  let contextManager: AsyncHooksContextManager;
  let connection: mysql.Connection;
  let pool: mysql.Pool;
  let poolCluster: mysql.PoolCluster;
  const provider = new NodeTracerProvider({ plugins: {} });
  const logger = new NoopLogger();
  const testMysql = process.env.RUN_MYSQL_TESTS; // For CI: assumes local mysql db is already available
  const testMysqlLocally = process.env.RUN_MYSQL_TESTS_LOCAL; // For local: spins up local mysql db via docker
  const shouldTest = testMysql || testMysqlLocally; // Skips these tests if false (default)
  const memoryExporter = new InMemorySpanExporter();

  before(function (done) {
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    }
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    if (testMysqlLocally) {
      testUtils.startDocker('mysql');
      // wait 15 seconds for docker container to start
      this.timeout(20000);
      setTimeout(done, 15000);
    } else {
      done();
    }
  });

  after(function () {
    if (testMysqlLocally) {
      this.timeout(5000);
      testUtils.cleanUpDocker('mysql');
    }
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    plugin.enable(mysql, provider, logger);
    connection = mysql.createConnection({
      port,
      user,
      host,
      password,
      database,
    });
    pool = mysql.createPool({
      port,
      user,
      host,
      password,
      database,
    });
    poolCluster = mysql.createPoolCluster();
    poolCluster.add('name', {
      port,
      user,
      host,
      password,
      database,
    });
  });

  afterEach(done => {
    context.disable();
    memoryExporter.reset();
    plugin.disable();
    connection.end(() => {
      pool.end(() => {
        poolCluster.end(() => {
          done();
        });
      });
    });
  });

  it('should export a plugin', () => {
    assert(plugin instanceof MysqlPlugin);
  });

  it('should have correct moduleName', () => {
    assert.strictEqual(plugin.moduleName, 'mysql');
  });

  describe('when the query is a string', () => {
    it('should name the span accordingly ', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        const query = connection.query(sql);

        query.on('end', () => {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans[0].name, 'SELECT');
          done();
        });
      });
    });
  });

  describe('when the query is an object', () => {
    it('should name the span accordingly ', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        const query = connection.query({ sql, values: [1] });

        query.on('end', () => {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans[0].name, sql);
          done();
        });
      });
    });
  });

  describe('#Connection', () => {
    it('should intercept connection.query(text: string)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        const query = connection.query(sql);
        let rows = 0;

        query.on('result', row => {
          assert.strictEqual(row.solution, 2);
          rows += 1;
        });

        query.on('end', () => {
          assert.strictEqual(rows, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
          done();
        });
      });
    });

    it('should intercept connection.query(text: string, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        connection.query(sql, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
          done();
        });
      });
    });

    it('should intercept connection.query(text: options, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        connection.query({ sql, values: [1] }, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept connection.query(text: options, values: [], callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        connection.query({ sql }, [1], (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept connection.query(text: string, values: [], callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        connection.query(sql, [1], (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept connection.query(text: string, value: any, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        connection.query(sql, 1, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should attach error messages to spans', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        connection.query(sql, (err, res) => {
          assert.ok(err);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, undefined, err!.message);
          done();
        });
      });
    });
  });

  describe('#Pool', () => {
    it('should intercept pool.query(text: string)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        const query = pool.query(sql);
        let rows = 0;

        query.on('result', row => {
          assert.strictEqual(row.solution, 2);
          rows += 1;
        });

        query.on('end', () => {
          assert.strictEqual(rows, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
          done();
        });
      });
    });

    it('should intercept pool.getConnection().query(text: string)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        pool.getConnection((err, conn) => {
          const query = conn.query(sql);
          let rows = 0;

          query.on('result', row => {
            assert.strictEqual(row.solution, 2);
            rows += 1;
          });

          query.on('end', () => {
            assert.strictEqual(rows, 1);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        });
      });
    });

    it('should intercept pool.query(text: string, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        pool.query(sql, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
          done();
        });
      });
    });

    it('should intercept pool.getConnection().query(text: string, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+1 as solution';
        pool.getConnection((err, conn) => {
          conn.query(sql, (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 2);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        });
      });
    });

    it('should intercept pool.query(text: options, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        pool.query({ sql, values: [1] }, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept pool.query(text: options, values: [], callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT 1+? as solution';
        pool.query({ sql }, [1], (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept pool.query(text: string, values: [], callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        pool.query(sql, [1], (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should intercept pool.query(text: string, value: any, callback)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        pool.query(sql, 1, (err, res) => {
          assert.ifError(err);
          assert.ok(res);
          assert.strictEqual(res[0].solution, 1);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, [1]);
          done();
        });
      });
    });

    it('should attach error messages to spans', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(setSpan(context.active(), span), () => {
        const sql = 'SELECT ? as solution';
        pool.query(sql, (err, res) => {
          assert.ok(err);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, undefined, err!.message);
          done();
        });
      });
    });
  });

  describe('#PoolCluster', () => {
    it('should intercept poolClusterConnection.query(text: string)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
          const sql = 'SELECT 1+1 as solution';
          const query = poolClusterConnection.query(sql);
          let rows = 0;

          query.on('result', row => {
            assert.strictEqual(row.solution, 2);
            rows += 1;
          });

          query.on('end', () => {
            assert.strictEqual(rows, 1);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        });
      });
    });

    it('should intercept poolClusterConnection.query(text: string, callback)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
          const sql = 'SELECT 1+1 as solution';
          poolClusterConnection.query(sql, (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 2);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        });
      });
    });

    it('should intercept poolClusterConnection.query(text: options, callback)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
          const sql = 'SELECT 1+? as solution';
          poolClusterConnection.query({ sql, values: [1] }, (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 2);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql, [1]);
            done();
          });
        });
      });
    });

    it('should intercept poolClusterConnection.query(text: options, values: [], callback)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
          const sql = 'SELECT 1+? as solution';
          poolClusterConnection.query({ sql }, [1], (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 2);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql, [1]);
            done();
          });
        });
      });
    });

    it('should intercept poolClusterConnection.query(text: string, values: [], callback)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
          const sql = 'SELECT ? as solution';
          poolClusterConnection.query(sql, [1], (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 1);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql, [1]);
            done();
          });
        });
      });
    });

    it('should intercept poolClusterConnection.query(text: string, value: any, callback)', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
          const sql = 'SELECT ? as solution';
          poolClusterConnection.query(sql, 1, (err, res) => {
            assert.ifError(err);
            assert.ok(res);
            assert.strictEqual(res[0].solution, 1);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql, [1]);
            done();
          });
        });
      });
    });

    it('should attach error messages to spans', done => {
      poolCluster.getConnection((err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
          const sql = 'SELECT ? as solution';
          poolClusterConnection.query(sql, (err, res) => {
            assert.ok(err);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql, undefined, err!.message);
            done();
          });
        });
      });
    });

    it('should get connection by name', done => {
      poolCluster.getConnection('name', (err, poolClusterConnection) => {
        assert.ifError(err);
        const span = provider.getTracer('default').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
          const sql = 'SELECT 1 as solution';
          poolClusterConnection.query(sql, (err, res) => {
            assert.ifError(err);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        });
      });
    });

    it('should get connection by name and selector', done => {
      poolCluster.getConnection(
        'name',
        'ORDER',
        (err, poolClusterConnection) => {
          assert.ifError(err);
          const sql = 'SELECT 1 as solution';
          poolClusterConnection.query(sql, (err, res) => {
            assert.ifError(err);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assertSpan(spans[0], sql);
            done();
          });
        }
      );
    });
  });
});

function assertSpan(
  span: ReadableSpan,
  sql: string,
  values?: any,
  errorMessage?: string
) {
  assert.strictEqual(span.attributes[DatabaseAttribute.DB_SYSTEM], 'mysql');
  assert.strictEqual(span.attributes[DatabaseAttribute.DB_NAME], database);
  assert.strictEqual(span.attributes[GeneralAttribute.NET_PEER_PORT], port);
  assert.strictEqual(span.attributes[GeneralAttribute.NET_PEER_HOSTNAME], host);
  assert.strictEqual(span.attributes[DatabaseAttribute.DB_USER], user);
  assert.strictEqual(
    span.attributes[DatabaseAttribute.DB_STATEMENT],
    mysql.format(sql, values)
  );
  if (errorMessage) {
    assert.strictEqual(span.status.message, errorMessage);
    assert.strictEqual(span.status.code, StatusCode.ERROR);
  }
}
