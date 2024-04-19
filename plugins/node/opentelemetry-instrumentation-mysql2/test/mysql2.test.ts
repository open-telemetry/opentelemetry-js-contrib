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

import { context, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { MySQL2Instrumentation } from '../src';

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

import * as mysqlTypesPromise from 'mysql2/promise';

// FIXME when support to node < 16 is dropped, use -> import { setTimeout } from 'node:timers/promises';
function _setTimetout(ms: number) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

describe('mysql2@' + LIB_VERSION, () => {
  let contextManager: AsyncHooksContextManager;
  let connection: mysqlTypesPromise.Connection;
  let rootConnection: mysqlTypesPromise.Connection;
  const provider = new BasicTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const testMysql = process.env.RUN_MYSQL_TESTS; // For CI: assumes local mysql db is already available
  const testMysqlLocally = process.env.RUN_MYSQL_TESTS_LOCAL; // For local: spins up local mysql db via docker
  const testMysqlLocallyImage = process.env.RUN_MYSQL_TESTS_LOCAL_USE_MARIADB
    ? 'mariadb'
    : 'mysql'; // For local: spins up mysql (default) or mariadb
  const shouldTest = testMysql || testMysqlLocally; // Skips these tests if false (default)

  before(async function () {
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    }
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    if (testMysqlLocally) {
      testUtils.startDocker(testMysqlLocallyImage);
      // wait 15 seconds for docker container to start
      this.timeout(25000);
      await _setTimetout(20000);
    }
    rootConnection = await mysqlTypesPromise.createConnection({
      port,
      user: 'root',
      host,
      password: rootPassword,
      database,
    });
  });

  after(async function () {
    await rootConnection.end();
    if (testMysqlLocally) {
      this.timeout(5000);
      testUtils.cleanUpDocker(testMysqlLocallyImage);
    }
  });

  beforeEach(async () => {
    instrumentation.disable();
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();
    connection = await mysqlTypesPromise.createConnection({
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
  });

  describe('query() when the statement is a string', () => {
    it('should name the span accordingly ', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        await connection.query(sql, [1]);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans[0].name, 'SELECT');
        assert.strictEqual(
          spans[0].attributes[SemanticAttributes.DB_STATEMENT],
          sql
        );
      });
    });
    it('should truncate the statement if dbStatementMaxLength is set', async () => {
      instrumentation.setConfig({ dbStatementMaxLength: 13 });
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        await connection.query(sql, [1]);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans[0].name, 'SELECT');
        assert.strictEqual(
          spans[0].attributes[SemanticAttributes.DB_STATEMENT],
          'SELECT 1+? as[...]'
        );
      });
    });
  });

  describe('query()  when the statement is an object', () => {
    it('should name the span accordingly ', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        await connection.query({ sql, values: [1] });
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans[0].name, 'SELECT');
        assert.strictEqual(
          spans[0].attributes[SemanticAttributes.DB_STATEMENT],
          sql
        );
      });
    });
    it('should truncate the statement if dbStatementMaxLength is set', async () => {
      instrumentation.setConfig({ dbStatementMaxLength: 13 });
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        await connection.query({ sql, values: [1] });
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans[0].name, 'SELECT');
        assert.strictEqual(
          spans[0].attributes[SemanticAttributes.DB_STATEMENT],
          'SELECT 1+? as[...]'
        );
      });
    });
  });

  describe('execute() when the statement is a string', () => {
    it('should name the span accordingly ', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        await connection.execute(sql, [1]);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans[0].name, 'SELECT');
        assert.strictEqual(
          spans[0].attributes[SemanticAttributes.DB_STATEMENT],
          sql
        );
      });
    });
    it('should truncate the statement if dbStatementMaxLength is set', async () => {
      instrumentation.setConfig({ dbStatementMaxLength: 13 });
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        await connection.execute(sql, [1]);
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans[0].name, 'SELECT');
        assert.strictEqual(
          spans[0].attributes[SemanticAttributes.DB_STATEMENT],
          'SELECT 1+? as[...]'
        );
      });
    });
  });

  describe('execute()  when the statement is an object', () => {
    it('should name the span accordingly ', async () => {
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        await connection.execute({ sql, values: [1] });
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans[0].name, 'SELECT');
        assert.strictEqual(
          spans[0].attributes[SemanticAttributes.DB_STATEMENT],
          sql
        );
      });
    });
    it('should truncate the statement if dbStatementMaxLength is set', async () => {
      instrumentation.setConfig({ dbStatementMaxLength: 13 });
      const span = provider.getTracer('default').startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sql = 'SELECT 1+? as solution';
        await connection.execute({ sql, values: [1] });
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans[0].name, 'SELECT');
        assert.strictEqual(
          spans[0].attributes[SemanticAttributes.DB_STATEMENT],
          'SELECT 1+? as[...]'
        );
      });
    });
  });
});
