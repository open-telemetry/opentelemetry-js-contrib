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
  AggregationTemporality,
  DataPointType,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import * as assert from 'assert';
import { MySQLInstrumentation } from '../src';
import { MysqlError, PoolConnection } from 'mysql';
import * as testUtils from '@opentelemetry/contrib-test-utils';

const port = Number(process.env.MYSQL_PORT) || 33306;
const database = process.env.MYSQL_DATABASE || 'test_db';
const host = process.env.MYSQL_HOST || '127.0.0.1';
const user = process.env.MYSQL_USER || 'otel';
const password = process.env.MYSQL_PASSWORD || 'secret';

const otelTestingMeterProvider = new MeterProvider();
const inMemoryMetricsExporter = new InMemoryMetricExporter(
  AggregationTemporality.CUMULATIVE
);
const metricReader = new PeriodicExportingMetricReader({
  exporter: inMemoryMetricsExporter,
  exportIntervalMillis: 100,
  exportTimeoutMillis: 100,
});

otelTestingMeterProvider.addMetricReader(metricReader);

import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
const instrumentation = registerInstrumentationTesting(
  new MySQLInstrumentation()
);

instrumentation.setMeterProvider(otelTestingMeterProvider);

async function waitForNumberOfExports(
  exporter: InMemoryMetricExporter,
  numberOfExports: number
): Promise<ResourceMetrics[]> {
  if (numberOfExports <= 0) {
    throw new Error('numberOfExports must be greater than or equal to 0');
  }
  let totalExports = 0;
  while (totalExports < numberOfExports) {
    await new Promise(resolve => setTimeout(resolve, 20));
    const exportedMetrics = exporter.getMetrics();
    totalExports = exportedMetrics.length;
  }
  return exporter.getMetrics();
}

import * as mysqlTypes from 'mysql';

describe('mysql@2.x-Metrics', () => {
  let pool: mysqlTypes.Pool;
  const testMysql = process.env.RUN_MYSQL_TESTS; // For CI: assumes local mysql db is already available
  const testMysqlLocally = process.env.RUN_MYSQL_TESTS_LOCAL; // For local: spins up local mysql db via docker
  const shouldTest = testMysql || testMysqlLocally; // Skips these tests if false (default)

  before(function (done) {
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      console.log('Skipping test-mysql for metrics.');
      this.skip();
    }

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
    inMemoryMetricsExporter.reset();
    // credentials to connect to pool if you run docker locally using 'npm run docker:start' from 'examples' folder
    // pool = mysqlTypes.createPool({
    //   host: 'localhost',
    //   user: 'root',
    //   password: 'secret',
    // });
    pool = mysqlTypes.createPool({
      port,
      user,
      host,
      password,
      database,
    });
  });

  afterEach(done => {
    instrumentation.disable();
    pool.end(() => {
      done();
    });
  });

  it('Should add connection usage metrics', done => {
    pool.getConnection((connErr: MysqlError, conn: PoolConnection) => {
      assert.ifError(connErr);
      assert.ok(conn);
      const sql = 'SELECT 1+1 as solution';
      conn.query(sql, async (err, results) => {
        assert.ifError(err);
        assert.ok(results);
        conn.release();

        assert.strictEqual(results[0]?.solution, 2);
        const exportedMetrics = await waitForNumberOfExports(
          inMemoryMetricsExporter,
          2
        );
        assert.strictEqual(exportedMetrics.length, 2);
        const metrics = exportedMetrics[1].scopeMetrics[0].metrics;
        assert.strictEqual(metrics.length, 1);
        assert.strictEqual(metrics[0].dataPointType, DataPointType.SUM);

        assert.strictEqual(
          metrics[0].descriptor.description,
          'The number of connections that are currently in the state referenced by the attribute "state".'
        );
        assert.strictEqual(metrics[0].descriptor.unit, '{connections}');
        assert.strictEqual(
          metrics[0].descriptor.name,
          'db.client.connections.usage'
        );
        assert.strictEqual(metrics[0].dataPoints.length, 2);
        assert.strictEqual(metrics[0].dataPoints[0].value, 1);
        assert.strictEqual(
          metrics[0].dataPoints[0].attributes['state'],
          'idle'
        );
        assert.strictEqual(
          metrics[0].dataPoints[0].attributes['name'],
          'host: 127.0.0.1 port: 33306 database: test_db user: otel'
        );
        assert.strictEqual(metrics[0].dataPoints[1].value, 0);
        assert.strictEqual(
          metrics[0].dataPoints[1].attributes['state'],
          'used'
        );
        assert.strictEqual(
          metrics[0].dataPoints[0].attributes['name'],
          'host: 127.0.0.1 port: 33306 database: test_db user: otel'
        );
        done();
      });
    });
  });
});
