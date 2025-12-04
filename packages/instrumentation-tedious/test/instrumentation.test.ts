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

import { context, trace, SpanStatusCode, SpanKind, type Attributes } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  DB_SYSTEM_VALUE_MSSQL,
  ATTR_DB_NAME,
  ATTR_DB_SQL_TABLE,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from '../src/semconv';
import { SemconvStability } from '@opentelemetry/instrumentation';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { TediousInstrumentation } from '../src';
import makeApi from './api';
import type { Connection } from 'tedious';
import * as semver from 'semver';
// XXX has prettier config stopped working in linting?
import { ATTR_DB_COLLECTION_NAME, ATTR_DB_NAMESPACE, ATTR_DB_QUERY_TEXT, ATTR_DB_SYSTEM_NAME, ATTR_SERVER_ADDRESS, ATTR_SERVER_PORT, DB_SYSTEM_NAME_VALUE_MICROSOFT_SQL_SERVER } from '@opentelemetry/semantic-conventions';

// By default tests run with both old and stable semconv. Some test cases
// specifically test the various values of OTEL_SEMCONV_STABILITY_OPT_IN.
process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http/dup,database/dup';
const DEFAULT_NET_SEMCONV_STABILITY = SemconvStability.DUPLICATE;

const port = Number(process.env.MSSQL_PORT) || 1433;
const database = process.env.MSSQL_DATABASE || 'master';
const host = process.env.MSSQL_HOST || '127.0.0.1';
const user = process.env.MSSQL_USER || 'sa';
const password = process.env.MSSQL_PASSWORD || 'mssql_passw0rd';

const instrumentation = new TediousInstrumentation();

const config: any = {
  userName: user,
  password,
  server: host,
  authentication: {
    type: 'default',
    options: {
      userName: user,
      password,
    },
  },
  options: {
    port,
    database,
    encrypt: true,
    // Required for <11.0.8
    trustServerCertificate: true,
    rowCollectionOnRequestCompletion: true,
    rowCollectionOnDone: true,
  },
};

const processVersion = process.version;
const tediousVersion = testUtils.getPackageVersion('tedious');
const incompatVersions =
  // tedious@16 removed support for node v14 https://github.com/tediousjs/tedious/releases/tag/v16.0.0
  (semver.lt(processVersion, '15.0.0') &&
    semver.gte(tediousVersion, '16.0.0')) ||
  // tedious@17 removed support for node v16 and v19 https://github.com/tediousjs/tedious/releases/tag/v17.0.0
  (semver.lt(processVersion, '17.0.0') &&
    semver.gte(tediousVersion, '17.0.0')) ||
  // tedious@19 removed support for node <18.17.0 https://github.com/tediousjs/tedious/releases/tag/v19.0.0
  (semver.lt(processVersion, '18.17.0') &&
    semver.gte(tediousVersion, '19.0.0'));

describe('tedious', () => {
  let tedious: any;
  let contextManager: AsyncLocalStorageContextManager;
  let connection: Connection;
  const memoryExporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  const shouldTest = process.env.RUN_MSSQL_TESTS;

  before(function (done) {
    if (!shouldTest || incompatVersions) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    }
    done();
  });

  beforeEach(async function () {
    // connecting often takes more time even if the DB is running locally
    this.timeout(10000);
    instrumentation.disable();
    contextManager = new AsyncLocalStorageContextManager().enable();
    context.setGlobalContextManager(contextManager);
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();
    tedious = makeApi(require('tedious'));
    connection = await tedious.createConnection(config).catch((err: any) => {
      console.error('with config:', config);
      throw err;
    });
    await tedious.cleanup(connection);
    memoryExporter.reset();
  });

  afterEach(async () => {
    context.disable();
    memoryExporter.reset();
    instrumentation.disable();
    if (connection) {
      await tedious.closeConnection(connection);
    }
  });

  it('should instrument execSql calls', async () => {
    const queryString = "SELECT 42, 'hello world'";
    const PARENT_NAME = 'parentSpan';
    const parentSpan = provider.getTracer('default').startSpan(PARENT_NAME);
    assert.deepStrictEqual(
      await context.with(trace.setSpan(context.active(), parentSpan), () =>
        tedious.query(connection, queryString)
      ),
      [42, 'hello world']
    );
    parentSpan.end();

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2, 'Received incorrect number of spans');

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: queryString,
      parentSpan,
    });

    assert.strictEqual(spans[1].name, PARENT_NAME);
  });

  it('should catch errors', async () => {
    const queryString = 'select !';

    await assertRejects(
      () => tedious.query(connection, queryString),
      /incorrect syntax/i
    );
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1, 'Received incorrect number of spans');

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: queryString,
      error: /incorrect syntax/i,
      statementCount: 0,
    });
  });

  it('should instrument execSql calls containing multiple queries', async () => {
    /*
      Since we do not know how many queries are there without parsing the request
      there may be cases where there is more than one SQL query done in the context
      of one span.
    */
    const queryString = 'SELECT 42; SELECT 42; SELECT 42;';
    assert.deepStrictEqual(
      await tedious.query(connection, queryString),
      [42, 42, 42]
    );
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1, 'Received incorrect number of spans');

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: queryString,
      procCount: 1,
      statementCount: 3,
    });
  });

  it('should instrument execSqlBatch calls containing multiple queries', async () => {
    const queryString = 'SELECT 42; SELECT 42; SELECT 42;';
    assert.deepStrictEqual(
      await tedious.query(connection, queryString, 'execSqlBatch'),
      [42, 42, 42]
    );
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1, 'Received incorrect number of spans');

    assertSpan(spans[0], {
      name: 'execSqlBatch master',
      sql: queryString,
      procCount: 0,
      statementCount: 3,
    });
  });

  it('should instrument stored procedure calls', async () => {
    assert.strictEqual(await tedious.storedProcedure.create(connection), true);
    assert.deepStrictEqual(await tedious.storedProcedure.call(connection), {
      outputCount: 11,
    });
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2, 'Received incorrect number of spans');

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: /create or alter procedure/i,
    });
    assertSpan(spans[1], {
      name: `callProcedure ${tedious.storedProcedure.procedureName} master`,
      sql: tedious.storedProcedure.procedureName,
    });
  });

  it('should instrument prepared statement calls', async () => {
    assert.strictEqual(await tedious.preparedSQL.createTable(connection), true);
    const request = await tedious.preparedSQL.prepare(connection);
    assert.strictEqual(
      await tedious.preparedSQL.execute(connection, request),
      true
    );
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3, 'Received incorrect number of spans');

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: /create table/i,
      statementCount: 2,
    });
    assertSpan(spans[1], {
      name: 'prepare master',
      sql: /INSERT INTO/,
    });
    assertSpan(spans[2], {
      name: 'execute master',
      sql: /INSERT INTO/,
    });
  });

  it('should track database changes', async () => {
    const sql = {
      create: 'create database temp_otel_db;',
      use: 'use temp_otel_db;',
      select: "SELECT 42, 'hello world'",
    };
    await tedious.query(connection, sql.create);
    await tedious.query(connection, sql.use);
    assert.deepStrictEqual(await tedious.query(connection, sql.select), [
      42,
      'hello world',
    ]);

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3, 'Received incorrect number of spans');

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: sql.create,
    });
    assertSpan(spans[1], {
      name: 'execSql master',
      sql: sql.use,
    });
    assertSpan(spans[2], {
      name: 'execSql temp_otel_db',
      sql: sql.select,
      database: 'temp_otel_db',
    });
  });

  it('should instrument BulkLoads', async () => {
    assert.strictEqual(await tedious.bulkLoad.createTable(connection), true);
    assert.strictEqual(await tedious.bulkLoad.execute(connection), 2);
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3, 'Received incorrect number of spans');

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: /create table/i,
      statementCount: 2,
    });
    assertSpan(spans[1], {
      name: 'execSqlBatch master',
      sql: /insert bulk/,
      procCount: 0,
    });
    assertSpan(spans[2], {
      name: 'execBulkLoad test_bulk master',
      procCount: 0,
      table: 'test_bulk',
    });
  });

  describe('various values of OTEL_SEMCONV_STABILITY_OPT_IN', () => {
    const _origOptInEnv = process.env.OTEL_SEMCONV_STABILITY_OPT_IN;
    after(() => {
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN = _origOptInEnv;
      (instrumentation as any)._setSemconvStabilityFromEnv();
    });

    it('OTEL_SEMCONV_STABILITY_OPT_IN=(empty)', async () => {
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN = '';
      (instrumentation as any)._setSemconvStabilityFromEnv();
      memoryExporter.reset();

      const queryString = "SELECT 42, 'hello world'";
      const PARENT_NAME = 'parentSpan';
      const parentSpan = provider.getTracer('default').startSpan(PARENT_NAME);
      assert.deepStrictEqual(
        await context.with(trace.setSpan(context.active(), parentSpan), () =>
          tedious.query(connection, queryString)
        ),
        [42, 'hello world']
      );
      parentSpan.end();
      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2, 'Received incorrect number of spans');
      assertSpan(spans[0], {
        name: 'execSql master',
        sql: queryString,
        parentSpan,
      }, SemconvStability.OLD);
      assert.strictEqual(spans[1].name, PARENT_NAME);
    });

    it('OTEL_SEMCONV_STABILITY_OPT_IN=http,database', async () => {
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http,database';
      (instrumentation as any)._setSemconvStabilityFromEnv();
      memoryExporter.reset();

      const queryString = "SELECT 42, 'hello world'";
      const PARENT_NAME = 'parentSpan';
      const parentSpan = provider.getTracer('default').startSpan(PARENT_NAME);
      assert.deepStrictEqual(
        await context.with(trace.setSpan(context.active(), parentSpan), () =>
          tedious.query(connection, queryString)
        ),
        [42, 'hello world']
      );
      parentSpan.end();
      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2, 'Received incorrect number of spans');
      assertSpan(spans[0], {
        name: 'execSql master',
        sql: queryString,
        parentSpan,
      }, SemconvStability.STABLE);
      assert.strictEqual(spans[1].name, PARENT_NAME);
    });
  });


  describe('trace context propagation via CONTEXT_INFO', () => {
    function traceparentFromSpan(span: ReadableSpan) {
      const sc = span.spanContext();
      const flags = sc.traceFlags & 0x01 ? '01' : '00';
      return `00-${sc.traceId}-${sc.spanId}-${flags}`;
    }

    beforeEach(() => {
      instrumentation.setConfig({
        enableTraceContextPropagation: true,
      });
    });

    after(() => {
      instrumentation.setConfig({ enableTraceContextPropagation: false });
    });

    it('injects DB-span traceparent for execSql', async function () {
      const sql =
        "SELECT REPLACE(CONVERT(varchar(128), CONTEXT_INFO()), CHAR(0), '') AS traceparent";
      const result = await tedious.query(connection, sql);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const expectedTp = traceparentFromSpan(spans[0]);
      assert.strictEqual(
        result[0],
        expectedTp,
        'CONTEXT_INFO traceparent should match DB span'
      );
    });

    it('injects for execSqlBatch', async function () {
      const batch = `
          SELECT REPLACE(CONVERT(varchar(128), CONTEXT_INFO()), CHAR(0), '') AS tp;
          SELECT 42;
        `;
      const result = await tedious.query(connection, batch, 'execSqlBatch');

      assert.deepStrictEqual(result, [result[0], 42]);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const expectedTp = traceparentFromSpan(spans[0]);
      assert.strictEqual(result[0], expectedTp);
    });

    it('when disabled, CONTEXT_INFO stays empty', async function () {
      instrumentation.setConfig({
        enableTraceContextPropagation: false,
      });

      const [val] = await tedious.query(
        connection,
        "SELECT REPLACE(CONVERT(varchar(128), CONTEXT_INFO()), CHAR(0), '')"
      );
      assert.strictEqual(val, null);
      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
    });
  });
});

const assertRejects = (
  asyncFn: () => Promise<unknown>,
  expectedMessageRegexp: RegExp | undefined
) => {
  const error = new Error('Missing expected rejection.');
  return Promise.resolve()
    .then(() => asyncFn())
    .then(() => {
      throw error;
    })
    .catch(err => {
      if (err === error) {
        throw error;
      }
      if (expectedMessageRegexp) {
        assert.match(err?.message || err, expectedMessageRegexp);
      }
    });
};

function assertSpan(
  span: ReadableSpan, expected: any, semconvStability: SemconvStability = DEFAULT_NET_SEMCONV_STABILITY)
{
  assert.ok(span);
  assert.strictEqual(span.name, expected.name);
  assert.strictEqual(span.kind, SpanKind.CLIENT);

  // Attributes
  const actualAttrs = {...span.attributes};
  const expectedAttrs: Attributes = {
    'tedious.procedure_count': expected.procCount ?? 1,
    'tedious.statement_count': expected.statementCount ?? 1,
  };
  if (semconvStability & SemconvStability.OLD) {
    expectedAttrs[ATTR_DB_SYSTEM] = DB_SYSTEM_VALUE_MSSQL;
    expectedAttrs[ATTR_DB_NAME] = expected.database ?? database;
    expectedAttrs[ATTR_DB_USER] = user;
    expectedAttrs[ATTR_NET_PEER_NAME] = host;
    expectedAttrs[ATTR_NET_PEER_PORT] = port;
    if (expected.table) {
      expectedAttrs[ATTR_DB_SQL_TABLE] = expected.table;
    }
    // "db.statement"
    if (expected.sql) {
      if (expected.sql instanceof RegExp) {
        assert.match(span.attributes[ATTR_DB_STATEMENT] as string, expected.sql);
      } else {
        assert.strictEqual(span.attributes[ATTR_DB_STATEMENT], expected.sql, ATTR_DB_STATEMENT);
      }
    } else {
      assert.strictEqual(actualAttrs[ATTR_DB_STATEMENT], undefined);
    }
    delete actualAttrs[ATTR_DB_STATEMENT];
  }
  if (semconvStability & SemconvStability.STABLE) {
    expectedAttrs[ATTR_DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_MICROSOFT_SQL_SERVER;
    expectedAttrs[ATTR_DB_NAMESPACE] = expected.database ?? database;
    expectedAttrs[ATTR_SERVER_ADDRESS] = host;
    expectedAttrs[ATTR_SERVER_PORT] = port;
    if (expected.table) {
      expectedAttrs[ATTR_DB_COLLECTION_NAME] = expected.table;
    }
    // "db.statement"
    if (expected.sql) {
      if (expected.sql instanceof RegExp) {
        assert.match(span.attributes[ATTR_DB_QUERY_TEXT] as string, expected.sql);
      } else {
        assert.strictEqual(span.attributes[ATTR_DB_QUERY_TEXT], expected.sql, ATTR_DB_QUERY_TEXT);
      }
    } else {
      assert.strictEqual(actualAttrs[ATTR_DB_QUERY_TEXT], undefined);
    }
    delete actualAttrs[ATTR_DB_QUERY_TEXT];
  }
  assert.deepEqual(actualAttrs, expectedAttrs);


  if (expected.parentSpan) {
    assert.strictEqual(
      span.parentSpanContext?.spanId,
      expected.parentSpan.spanContext().spanId
    );
  }

  if (expected.error) {
    assert(
      expected.error.test(span.status.message),
      `Expected "${span.status.message}" to match ${expected.error}`
    );
    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
  } else {
    assert.strictEqual(span.status.message, undefined);
    assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
  }
}
