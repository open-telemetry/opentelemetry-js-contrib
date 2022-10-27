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
import * as testUtils from '@opentelemetry/contrib-test-utils';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { MySQLInstrumentation } from '../src';

const port = Number(process.env.MYSQL_PORT) || 33306;
const database = process.env.MYSQL_DATABASE || 'test_db';
const host = process.env.MYSQL_HOST || '127.0.0.1';
const user = process.env.MYSQL_USER || 'otel';
const password = process.env.MYSQL_PASSWORD || 'secret';

const instrumentation = new MySQLInstrumentation();
instrumentation.enable();
instrumentation.disable();

import * as mysqlTypes from 'mysql';

describe('mysql@2.x-MetricsTake2', () => {
  let contextManager: AsyncHooksContextManager;
  let connection: mysqlTypes.Connection;
  let pool: mysqlTypes.Pool;
  let poolCluster: mysqlTypes.PoolCluster;
  const provider = new BasicTracerProvider();
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
    instrumentation.disable();
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();
    connection = mysqlTypes.createConnection({
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
    instrumentation.disable();
    connection.end(() => {
      pool.end(() => {
        poolCluster.end(() => {
          done();
        });
      });
    });
  });

  describe('#Pool-Metrics', () => {
    it('Metrics-should intercept pool.query(text: string)', done => {
      const span = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
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
          done();
        });
      });
    });
  });
});
