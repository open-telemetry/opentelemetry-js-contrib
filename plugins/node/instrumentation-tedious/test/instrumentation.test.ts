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

import { context, trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import * as util from 'util';
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
import type { Connection, ConnectionConfig } from 'tedious';

const port = Number(process.env.MSSQL_PORT) || 1433;
const database = process.env.MSSQL_DATABASE || 'master';
const host = process.env.MSSQL_HOST || '127.0.0.1';
const user = process.env.MSSQL_USER || 'sa';
const password = process.env.MSSQL_PASSWORD || 'mssql_passw0rd';

const instrumentation = new TediousInstrumentation();
instrumentation.enable();
instrumentation.disable();

const config: ConnectionConfig & { userName: string; password: string } = {
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

describe('tedious', () => {
  let tedious: any;
  let contextManager: AsyncHooksContextManager;
  let connection: Connection;
  const provider = new BasicTracerProvider();
  const shouldTest = process.env.RUN_MSSQL_TESTS; // For CI: assumes local db is already available
  const shouldTestLocally = process.env.RUN_MSSQL_TESTS_LOCAL; // For local: spins up local db via docker
  const memoryExporter = new InMemorySpanExporter();

  before(function (done) {
    if (!(shouldTest || shouldTestLocally)) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    }
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    if (shouldTestLocally) {
      testUtils.startDocker('mssql');
      // wait 15 seconds for docker container to start
      this.timeout(20000);
      setTimeout(done, 15000);
    } else {
      done();
    }
  });

  after(function () {
    if (shouldTestLocally) {
      this.timeout(5000);
      testUtils.cleanUpDocker('mssql');
    }
  });

  beforeEach(async function () {
    // connecting often takes more time even if the DB is running locally
    this.timeout(10000);
    instrumentation.disable();
    contextManager = new AsyncHooksContextManager().enable();
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
});

const assertMatch = (actual: string | undefined, expected: RegExp) => {
  assert(
    actual && expected.test(actual),
    `Expected ${util.inspect(actual)} to match ${expected}`
  );
};

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
        assertMatch(err?.message || err, expectedMessageRegexp);
      }
    });
};

function assertSpan(span: ReadableSpan, expected: any) {
  assert(span);
  assert.strictEqual(span.name, expected.name);
  assert.strictEqual(span.kind, SpanKind.CLIENT);
  assert.strictEqual(
    span.attributes[SemanticAttributes.DB_SYSTEM],
    DbSystemValues.MSSQL
  );
  assert.strictEqual(
    span.attributes[SemanticAttributes.DB_NAME],
    expected.database ?? database
  );
  assert.strictEqual(span.attributes[SemanticAttributes.NET_PEER_PORT], port);
  assert.strictEqual(span.attributes[SemanticAttributes.NET_PEER_NAME], host);
  assert.strictEqual(span.attributes[SemanticAttributes.DB_USER], user);
  assert.strictEqual(
    span.attributes['tedious.procedure_count'],
    expected.procCount ?? 1,
    'Invalid procedure_count'
  );
  assert.strictEqual(
    span.attributes['tedious.statement_count'],
    expected.statementCount ?? 1,
    'Invalid statement_count'
  );
  if (expected.parentSpan) {
    assert.strictEqual(
      span.parentSpanId,
      expected.parentSpan.spanContext().spanId
    );
  }
  assert.strictEqual(
    span.attributes[SemanticAttributes.DB_SQL_TABLE],
    expected.table
  );
  if (expected.sql) {
    if (expected.sql instanceof RegExp) {
      assertMatch(
        span.attributes[SemanticAttributes.DB_STATEMENT] as string | undefined,
        expected.sql
      );
    } else {
      assert.strictEqual(
        span.attributes[SemanticAttributes.DB_STATEMENT],
        expected.sql
      );
    }
  } else {
    assert.strictEqual(
      span.attributes[SemanticAttributes.DB_STATEMENT],
      undefined
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
