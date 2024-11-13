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

import * as semver from 'semver';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  DBSYSTEMVALUES_MYSQL,
  SEMATTRS_DB_NAME,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_USER,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
} from '@opentelemetry/semantic-conventions';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import {
  MySQL2Instrumentation,
  MySQL2InstrumentationConfig,
} from '../src';

const LIB_VERSION = testUtils.getPackageVersion('mysql2');
const port = Number(process.env.MYSQL_PORT) || 33306;
const database = process.env.MYSQL_DATABASE || 'test_db';
const host = process.env.MYSQL_HOST || '127.0.0.1';
const user = process.env.MYSQL_USER || 'otel';
const password = process.env.MYSQL_PASSWORD || 'secret';
const rootPassword = process.env.MYSQL_ROOT_PASSWORD || 'rootpw';

const instrumentation = new MySQL2Instrumentation();
instrumentation.enable();
instrumentation.disable();

import * as mysqlTypes from 'mysql2/promise';

interface GeneralLogResult extends mysqlTypes.RowDataPacket {
  argument: string | Buffer;
}

interface Result extends mysqlTypes.RowDataPacket {
  solution: number;
}

describe('mysql2/promise', () => {
  let contextManager: AsyncHooksContextManager;
  let connection: mysqlTypes.Connection;
  let rootConnection: mysqlTypes.Connection;
  let pool: mysqlTypes.Pool;
  let poolCluster: mysqlTypes.PoolCluster;
  const provider = new BasicTracerProvider();
  const testMysql = process.env.RUN_MYSQL_TESTS; // For CI: assumes local mysql db is already available
  const testMysqlLocally = process.env.RUN_MYSQL_TESTS_LOCAL; // For local: spins up local mysql db via docker
  const shouldTest = testMysql || testMysqlLocally; // Skips these tests if false (default)
  const memoryExporter = new InMemorySpanExporter();

  const getLastQueries = async (count: number) => {
    const [rows] = await rootConnection.query<GeneralLogResult[]>({
      sql: "SELECT * FROM mysql.general_log WHERE command_type = 'Query' ORDER BY event_time DESC LIMIT ? OFFSET 1",
      values: [count],
    });

    return rows.map(row => {
      if (typeof row.argument === 'string') {
        return row.argument;
      } else {
        return row.argument.toString('utf-8');
      }
    });
  };

  before(async function () {
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    }
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    rootConnection = await mysqlTypes.createConnection({
      port,
      user: 'root',
      host,
      password: rootPassword,
      database,
    });
    if (testMysqlLocally) {
      testUtils.startDocker('mysql');
      // wait 15 seconds for docker container to start
      this.timeout(20000);
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
  });

  after(async function () {
    await rootConnection.end();
    if (testMysqlLocally) {
      this.timeout(5000);
      testUtils.cleanUpDocker('mysql');
    }
  });

  beforeEach(async () => {
    instrumentation.disable();
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();
    connection = await mysqlTypes.createConnection({
      port,
      user,
      host,
      password,
      database,
    });
    pool = mysqlTypes.createPool({
      port,
      user,
      host,
      password,
      database,
    });
    poolCluster = mysqlTypes.createPoolCluster();
    // the implementation actually accepts ConnectionConfig as well,
    // but the types do not reflect that
    poolCluster.add('name', {
      port,
      user,
      host,
      password,
      database,
    });
  });

  afterEach(async () => {
    context.disable();
    memoryExporter.reset();
    instrumentation.setConfig({});
    instrumentation.disable();
    await connection.end();
    await pool.end();
    if (isPoolClusterEndIgnoreCallback()) {
      await poolCluster.end();
    } else {
      await poolCluster.end();
    }
  });

  describe('when the query is a string', () => {
    it('should name the span accordingly ', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        await connection.query(sql);

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(spans[0].name, 'SELECT');
        assertSpan(spans[0], sql);
      });
    });
  });

  describe('when the query is an object', () => {
    it('should name the span accordingly ', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        await connection.query({ sql, values });

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(spans[0].name, 'SELECT');
        assertSpan(spans[0], sql, values);
      });
    });
  });

  describe('#Connection.query', () => {
    it('should intercept connection.query(text: string)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const [rows] = await connection.query<Result[]>(sql);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept connection.query(text: string, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT ? as solution';
        const values = [1];
        const [rows] = await connection.query<Result[]>(sql, values);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 1);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should intercept connection.query(options: QueryOptions)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const [rows] = await connection.query<Result[]>({ sql });

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept connection.query(options: QueryOptions, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT ? as solution';
        const values = [1];
        const [rows] = await connection.query<Result[]>({ sql }, values);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 1);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should attach error messages to spans', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT ? as solution';

        try {
          await connection.query(sql);
        } catch (error: any) {
          assert.ok(error);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, undefined, error.message);
        }
      });
    });

    it('should not add comment by default', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        await connection.query('SELECT 1+1 as solution');

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        const [query] = await getLastQueries(1);
        assert.doesNotMatch(query, /.*traceparent.*/);
      });
    });

    it('should not add comment when specified if existing block comment', async () => {
      instrumentation.setConfig({
        addSqlCommenterCommentToQueries: true,
      } as any);
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        await connection.query('SELECT 1+1 as solution /*block comment*/');

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        const [query] = await getLastQueries(1);
        assert.doesNotMatch(query, /.*traceparent.*/);
      });
    });

    it('should not add comment when specified if existing line comment', async () => {
      instrumentation.setConfig({
        addSqlCommenterCommentToQueries: true,
      } as any);
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        await connection.query('SELECT 1+1 as solution -- line comment');

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        const [query] = await getLastQueries(1);
        assert.doesNotMatch(query, /.*traceparent.*/);
      });
    });

    it('should add comment when specified if no existing comment', async () => {
      instrumentation.setConfig({
        addSqlCommenterCommentToQueries: true,
      } as any);
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        await connection.query('SELECT 1+1 as solution');

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        const [query] = await getLastQueries(1);
        assert.match(query, /.*traceparent.*/);
      });
    });
  });

  describe('#Connection.execute', () => {
    it('should intercept connection.execute(text: string)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const [rows] = await connection.execute<Result[]>(sql);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept connection.execute(text: string, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const [rows] = await connection.execute<Result[]>(sql, values);

        assert.ok(rows);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should intercept connection.execute(options: QueryOptions)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const [rows] = await connection.execute<Result[]>({ sql });

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept connection.execute(options: QueryOptions, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const [rows] = await connection.execute<Result[]>({ sql }, values);

        assert.ok(rows);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should attach error messages to spans', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT ? as solution';

        try {
          await connection.execute(sql);
        } catch (error: any) {
          assert.ok(error);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, undefined, error.message);
        }
      });
    });
  });

  describe('#Pool.query', () => {
    it('should intercept pool.query(text: string)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const [rows] = await pool.query<Result[]>(sql);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept pool.query(text: string, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const [rows] = await pool.query<Result[]>(sql, values);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should intercept pool.query(options: QueryOptions)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const [rows] = await pool.query<Result[]>({ sql });

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept pool.query(options: QueryOptions, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const [rows] = await pool.query<Result[]>({ sql }, values);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should intercept pool.getConnection().query(text: string)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const conn = await pool.getConnection();
        const [rows] = await conn.query<Result[]>(sql);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept pool.getConnection().query(text: string, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const conn = await pool.getConnection();
        const [rows] = await conn.query<Result[]>(sql, values);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should intercept pool.getConnection().query(options: QueryOptions)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const conn = await pool.getConnection();
        const [rows] = await conn.query<Result[]>({ sql });

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept pool.getConnection().query(options: QueryOptions, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const conn = await pool.getConnection();
        const [rows] = await conn.query<Result[]>({ sql }, values);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should attach error messages to spans', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT ? as solution';

        try {
          await pool.query(sql);
        } catch (error: any) {
          assert.ok(error);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, undefined, error.message);
        }
      });
    });

    it('should not add comment by default', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        await pool.query('SELECT 1+1 as solution');

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        const [query] = await getLastQueries(1);
        assert.doesNotMatch(query, /.*traceparent.*/);
      });
    });

    it('should not add comment when specified if existing block comment', async () => {
      instrumentation.setConfig({
        addSqlCommenterCommentToQueries: true,
      } as any);
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        await pool.query('SELECT 1+1 as solution /*block comment*/');

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        const [query] = await getLastQueries(1);
        assert.doesNotMatch(query, /.*traceparent.*/);
      });
    });

    it('should not add comment when specified if existing line comment', async () => {
      instrumentation.setConfig({
        addSqlCommenterCommentToQueries: true,
      } as any);
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        await pool.query('SELECT 1+1 as solution -- line comment');

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        const [query] = await getLastQueries(1);
        assert.doesNotMatch(query, /.*traceparent.*/);
      });
    });

    it('should add comment when specified if no existing comment', async () => {
      instrumentation.setConfig({
        addSqlCommenterCommentToQueries: true,
      } as any);
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        await pool.query('SELECT 1+1 as solution');

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        const [query] = await getLastQueries(1);
        assert.match(query, /.*traceparent.*/);
      });
    });
  });

  describe('#Pool.execute', () => {
    it('should intercept pool.execute(text: string)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const [rows] = await pool.execute<Result[]>(sql);

        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept pool.execute(text: string, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const [rows] = await pool.execute<Result[]>(sql, values);

        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should intercept pool.execute(options: QueryOptions)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const [rows] = await pool.execute<Result[]>({ sql });

        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept pool.execute(options: QueryOptions, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const [rows] = await pool.execute<Result[]>({ sql }, values);

        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should intercept pool.getConnection().execute(text: string)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const conn = await pool.getConnection();
        const [rows] = await conn.execute<Result[]>(sql);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept pool.getConnection().execute(text: string, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const conn = await pool.getConnection();
        const [rows] = await conn.execute<Result[]>(sql, values);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should intercept pool.getConnection().execute(options: QueryOptions)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const conn = await pool.getConnection();
        const [rows] = await conn.execute<Result[]>({ sql });

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept pool.getConnection().execute(options: QueryOptions, values: any)', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const conn = await pool.getConnection();
        const [rows] = await conn.execute<Result[]>({ sql }, values);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should attach error messages to spans', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT ? as solution';

        try {
          await pool.execute(sql);
        } catch (error: any) {
          assert.ok(error);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql, undefined, error.message);
        }
      });
    });
  });

  describe('#PoolCluster', () => {
    it('should intercept poolClusterConnection.query(text: string)', async () => {
      const poolClusterConnection = await poolCluster.getConnection();
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const [rows] = await poolClusterConnection.query<Result[]>(sql);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept poolClusterConnection.query(text: string, values: any)', async () => {
      const poolClusterConnection = await poolCluster.getConnection();
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const [rows] = await poolClusterConnection.query<Result[]>(sql, values);

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should intercept poolClusterConnection.query(options: QueryOptions)', async () => {
      const poolClusterConnection = await poolCluster.getConnection();
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+1 as solution';
        const [rows] = await poolClusterConnection.query<Result[]>({ sql });

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      });
    });

    it('should intercept poolClusterConnection.query(options: QueryOptions, values: any)', async () => {
      const poolClusterConnection = await poolCluster.getConnection();
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        const values = [1];
        const [rows] = await poolClusterConnection.query<Result[]>(
          { sql },
          values
        );

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].solution, 2);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql, values);
      });
    });

    it('should attach error messages to spans', async () => {
      const poolClusterConnection = await poolCluster.getConnection();
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT ? as solution';

        try {
          await poolClusterConnection.query(sql);
        } catch (error) {
          assert.ok(error);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          assertSpan(spans[0], sql, undefined, error!.message);
        }
      });
    });

    it('should get connection by name', async () => {
      const poolClusterConnection = await poolCluster.getConnection();
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1 as solution';

        try {
          await poolClusterConnection.query(sql);
        } catch (error) {
          assert.ifError(error);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
        }
      });
    });

    it('should get connection by name and selector', async () => {
      const poolClusterConnection = await poolCluster.getConnection(
        'name',
        'ORDER'
      );

      const sql = 'SELECT 1 as solution';

      try {
        await poolClusterConnection.query(sql);
      } catch (error) {
        assert.ifError(error);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assertSpan(spans[0], sql);
      }
    });
  });

  describe('#responseHook', () => {
    const queryResultAttribute = 'query_result';

    describe('invalid response hook', () => {
      beforeEach(() => {
        const config: MySQL2InstrumentationConfig = {
          responseHook: (span, responseHookInfo) => {
            throw new Error('random failure!');
          },
        };
        instrumentation.setConfig(config);
      });

      it('should not affect the behavior of the query', async () => {
        const span = provider.getTracer('default').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          const sql = 'SELECT 1+1 as solution';
          const [rows] = await connection.query<Result[]>(sql);

          assert.ok(rows);
          assert.strictEqual(rows[0].solution, 2);
        });
      });
    });

    describe('valid response hook', () => {
      beforeEach(() => {
        const config: MySQL2InstrumentationConfig = {
          responseHook: (span, responseHookInfo) => {
            span.setAttribute(
              queryResultAttribute,
              JSON.stringify(responseHookInfo.queryResults)
            );
          },
        };
        instrumentation.setConfig(config);
      });

      it('should extract data from responseHook - connection', async () => {
        const span = provider.getTracer('default').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          const sql = 'SELECT 1+1 as solution';
          const [rows] = await connection.query<Result[]>(sql);

          assert.ok(rows);
          assert.strictEqual(rows[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
          assert.strictEqual(
            spans[0].attributes[queryResultAttribute],
            JSON.stringify(rows)
          );
        });
      });

      it('should extract data from responseHook - pool', async () => {
        const span = provider.getTracer('default').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          const sql = 'SELECT 1+1 as solution';
          const conn = await pool.getConnection();
          const [rows] = await conn.query<Result[]>(sql);

          assert.ok(rows);
          assert.strictEqual(rows[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
          assert.strictEqual(
            spans[0].attributes[queryResultAttribute],
            JSON.stringify(rows)
          );
        });
      });

      it('should extract data from responseHook - poolCluster', async () => {
        const poolClusterConnection = await poolCluster.getConnection();
        const span = provider.getTracer('default').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          const sql = 'SELECT 1+1 as solution';
          const [rows] = await poolClusterConnection.query<Result[]>(sql);

          assert.ok(rows);
          assert.strictEqual(rows[0].solution, 2);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0], sql);
          assert.strictEqual(
            spans[0].attributes[queryResultAttribute],
            JSON.stringify(rows)
          );
        });
      });
    });
  });
});

function assertSpan(
  span: ReadableSpan,
  sql: string,
  values?: any,
  errorMessage?: string
) {
  assert.strictEqual(span.attributes[SEMATTRS_DB_SYSTEM], DBSYSTEMVALUES_MYSQL);
  assert.strictEqual(span.attributes[SEMATTRS_DB_NAME], database);
  assert.strictEqual(span.attributes[SEMATTRS_NET_PEER_PORT], port);
  assert.strictEqual(span.attributes[SEMATTRS_NET_PEER_NAME], host);
  assert.strictEqual(span.attributes[SEMATTRS_DB_USER], user);
  assert.strictEqual(
    span.attributes[SEMATTRS_DB_STATEMENT],
    mysqlTypes.format(sql, values)
  );
  if (errorMessage) {
    assert.strictEqual(span.status.message, errorMessage);
    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
  }
}

function isPoolClusterEndIgnoreCallback() {
  // Since v2.2.0 `end` function respect callback
  // https://github.com/sidorares/node-mysql2/commit/1481015626e506754adc4308e5508356a3a03aa0
  return semver.lt(LIB_VERSION, '2.2.0');
}
