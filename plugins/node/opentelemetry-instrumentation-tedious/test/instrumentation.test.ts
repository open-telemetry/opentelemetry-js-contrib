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
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
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
import {
  callProcedureWithParameters,
  closeConnection,
  createConnection,
  createStoredProcedure,
  createTable,
  executePreparedSQL,
  prepareSQL,
  query,
  storedProcedure,
  tedious as tedisousType,
} from './api';
import type { Connection, ConnectionConfig } from 'tedious';

process.env.RUN_MSSQL_TESTS = 'true';

const port = Number(process.env.MSSQL_PORT) || 1433;
const database = process.env.MSSQL_DATABASE || 'master';
const host = process.env.MSSQL_HOST || '127.0.0.1';
const user = process.env.MSSQL_USER || 'sa';
const password = process.env.MSSQL_PASSWORD || 'secret';

const instrumentation = new TediousInstrumentation();
instrumentation.enable();
instrumentation.disable();

const config: ConnectionConfig = {
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
    rowCollectionOnRequestCompletion: true,
    rowCollectionOnDone: true,
  },
};

describe('tedious', () => {
  let tedious: tedisousType;
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
      // testUtils.startDocker('mssql');
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
      // testUtils.cleanUpDocker('mssql');
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
    tedious = require('tedious');
    connection = await createConnection(tedious, config);
  });

  afterEach(async () => {
    context.disable();
    memoryExporter.reset();
    instrumentation.disable();
    if (connection) {
      await closeConnection(connection);
    }
  });

  it('should instrument execSql calls', async () => {
    const queryString = "SELECT 42, 'hello world'";
    const PARENT_NAME = 'parentSpan';
    const parentSpan = provider.getTracer('default').startSpan(PARENT_NAME);
    assert.deepStrictEqual(
      await context.with(trace.setSpan(context.active(), parentSpan), () =>
        query(tedious, connection, queryString)
      ),
      [42, 'hello world']
    );
    parentSpan.end();

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: queryString,
      parentSpan,
    });

    assert.strictEqual(spans[1].name, PARENT_NAME);
  });

  it('should catch errors', async () => {
    const queryString = 'select !';
    await query(tedious, connection, queryString)
      .then(() => {
        assert.fail('Should not reach here');
      })
      .catch(err => {
        assertMatch(err.message, /incorrect syntax/i);
      });
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: queryString,
      error: /incorrect syntax/i,
      procCount: 0,
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
      await query(tedious, connection, queryString),
      [42, 42, 42]
    );
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: queryString,
      procCount: 3,
    });
  });

  it('should instrument execSqlBatch calls containing multiple queries', async () => {
    const queryString = 'SELECT 42; SELECT 42; SELECT 42;';
    assert.deepStrictEqual(
      await query(tedious, connection, queryString, 'execSqlBatch'),
      [42, 42, 42]
    );
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);

    assertSpan(spans[0], {
      name: 'execSqlBatch master',
      sql: queryString,
      procCount: 3,
    });
  });

  it('should instrument stored procedure calls', async () => {
    assert.strictEqual(await createStoredProcedure(tedious, connection), true);
    assert.deepStrictEqual(
      await callProcedureWithParameters(tedious, connection),
      {
        outputCount: 11,
      }
    );
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: /create or alter procedure/i,
    });
    assertSpan(spans[1], {
      name: `callProcedure ${storedProcedure} master`,
      sql: storedProcedure,
    });
  });

  it('should instrument prepared statement calls', async () => {
    assert.strictEqual(await createTable(tedious, connection), true);
    const request = await prepareSQL(tedious, connection);
    assert.strictEqual(await executePreparedSQL(connection, request), true);
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 3);

    assertSpan(spans[0], {
      name: 'execSql master',
      sql: /create table/i,
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
});

const assertMatch = (actual: string | undefined, expected: RegExp) => {
  assert(
    actual && expected.test(actual),
    `Expected ${util.inspect(actual)} to match ${expected}`
  );
};

function assertSpan(span: ReadableSpan, expected: any) {
  assert(span);
  assert.strictEqual(span.name, expected.name);
  assert.strictEqual(span.kind, SpanKind.CLIENT);
  assert.strictEqual(span.attributes[SemanticAttributes.DB_SYSTEM], 'mssql');
  assert.strictEqual(span.attributes[SemanticAttributes.DB_NAME], database);
  assert.strictEqual(span.attributes[SemanticAttributes.NET_PEER_PORT], port);
  assert.strictEqual(span.attributes[SemanticAttributes.NET_PEER_NAME], host);
  assert.strictEqual(span.attributes[SemanticAttributes.DB_USER], user);
  assert.strictEqual(
    span.attributes['tedious.proc_count'],
    expected.procCount ?? 1
  );
  if (expected.parentSpan) {
    assert.strictEqual(
      span.parentSpanId,
      expected.parentSpan.spanContext().spanId
    );
  }
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
