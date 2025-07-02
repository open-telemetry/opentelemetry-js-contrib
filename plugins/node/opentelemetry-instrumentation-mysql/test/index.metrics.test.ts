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
import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(
  new MySQLInstrumentation()
);
instrumentation.enable();
instrumentation.disable();

import { MysqlError, PoolConnection } from 'mysql';

const port = Number(process.env.MYSQL_PORT) || 33306;
const database = process.env.MYSQL_DATABASE || 'test_db';
const host = process.env.MYSQL_HOST || '127.0.0.1';
const user = process.env.MYSQL_USER || 'otel';
const password = process.env.MYSQL_PASSWORD || 'secret';

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
  let otelTestingMeterProvider;
  let inMemoryMetricsExporter: InMemoryMetricExporter;
  // assumes local mysql db is already available in CI or
  // using `npm run test-services:start` script at the root folder
  const shouldTest = process.env.RUN_MYSQL_TESTS;

  function initMeterProvider() {
    inMemoryMetricsExporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE
    );
    const metricReader = new PeriodicExportingMetricReader({
      exporter: inMemoryMetricsExporter,
      exportIntervalMillis: 100,
      exportTimeoutMillis: 100,
    });
    otelTestingMeterProvider = new MeterProvider({
      readers: [metricReader],
    });

    instrumentation.setMeterProvider(otelTestingMeterProvider);
  }

  before(function (done) {
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      console.log('Skipping test-mysql for metrics.');
      this.skip();
    }
    done();
  });

  describe('#Pool - metrics', () => {
    let pool: mysqlTypes.Pool;

    beforeEach(() => {
      initMeterProvider();
      instrumentation.disable();
      instrumentation.enable();
      inMemoryMetricsExporter.reset();
      // credentials to connect to pool if you run docker locally using 'npm run docker:start' from 'examples/mysql' folder
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

    it('Pool - Should add connection usage metrics', done => {
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
            'The number of connections that are currently in state described by the state attribute.'
          );
          assert.strictEqual(metrics[0].descriptor.unit, '{connection}');
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
            `host: '${host}', port: ${port}, database: '${database}', user: '${user}'`
          );
          assert.strictEqual(metrics[0].dataPoints[1].value, 0);
          assert.strictEqual(
            metrics[0].dataPoints[1].attributes['state'],
            'used'
          );
          assert.strictEqual(
            metrics[0].dataPoints[0].attributes['name'],
            `host: '${host}', port: ${port}, database: '${database}', user: '${user}'`
          );
          done();
        });
      });
    });

    it('Pool - Create 2 connection, release only 1', done => {
      pool.getConnection((connErr: MysqlError, conn1: PoolConnection) => {
        const sql1 = 'SELECT 1+1 as solution';
        conn1.query(sql1, async (err, results) => {
          pool.getConnection((connErr: MysqlError, conn2: PoolConnection) => {
            const sql2 = 'SELECT 2+2 as solution';
            conn2.query(sql2, async (err, results) => {
              conn2.release();
              //conn2 is release, but conn1 is not.

              const exportedMetrics = await waitForNumberOfExports(
                inMemoryMetricsExporter,
                2
              );
              assert.strictEqual(exportedMetrics.length, 2);
              const metrics = exportedMetrics[1].scopeMetrics[0].metrics;
              assert.strictEqual(metrics.length, 1);

              assert.strictEqual(metrics[0].dataPoints.length, 2);
              assert.strictEqual(metrics[0].dataPoints[0].value, 1);
              assert.strictEqual(
                metrics[0].dataPoints[0].attributes['state'],
                'idle'
              );
              assert.strictEqual(
                metrics[0].dataPoints[0].attributes['name'],
                `host: '${host}', port: ${port}, database: '${database}', user: '${user}'`
              );
              assert.strictEqual(metrics[0].dataPoints[1].value, 1);
              assert.strictEqual(
                metrics[0].dataPoints[1].attributes['state'],
                'used'
              );
              assert.strictEqual(
                metrics[0].dataPoints[0].attributes['name'],
                `host: '${host}', port: ${port}, database: '${database}', user: '${user}'`
              );
              done();
            });
          });
        });
      });
    });

    it('Pool - use pool.query', done => {
      const sql = 'SELECT 1+1 as solution';
      pool.query(sql, async (error, results, fields) => {
        assert.ifError(error);
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
          'The number of connections that are currently in state described by the state attribute.'
        );
        assert.strictEqual(metrics[0].descriptor.unit, '{connection}');
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
          `host: '${host}', port: ${port}, database: '${database}', user: '${user}'`
        );
        assert.strictEqual(metrics[0].dataPoints[1].value, 0);
        assert.strictEqual(
          metrics[0].dataPoints[1].attributes['state'],
          'used'
        );
        assert.strictEqual(
          metrics[0].dataPoints[0].attributes['name'],
          `host: '${host}', port: ${port}, database: '${database}', user: '${user}'`
        );
        done();
      });
    });
  });

  describe('#PoolCluster - metrics', () => {
    let poolCluster: mysqlTypes.PoolCluster;

    beforeEach(() => {
      initMeterProvider();
      instrumentation.disable();
      instrumentation.enable();
      inMemoryMetricsExporter.reset();
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
      instrumentation.disable();
      poolCluster.end(() => {
        done();
      });
    });

    it('PoolCluster - Should add connection usage metrics', done => {
      poolCluster.getConnection((connErr: MysqlError, conn: PoolConnection) => {
        assert.ifError(connErr);
        assert.ok(conn);
        const sql = 'SELECT 1+1 as solution';
        conn.query(sql, async (err, results) => {
          assert.ifError(err);
          assert.ok(results);

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
            'The number of connections that are currently in state described by the state attribute.'
          );
          assert.strictEqual(metrics[0].descriptor.unit, '{connection}');
          assert.strictEqual(
            metrics[0].descriptor.name,
            'db.client.connections.usage'
          );
          assert.strictEqual(metrics[0].dataPoints.length, 2);
          assert.strictEqual(metrics[0].dataPoints[0].value, 0);
          assert.strictEqual(
            metrics[0].dataPoints[0].attributes['state'],
            'idle'
          );
          assert.strictEqual(
            metrics[0].dataPoints[0].attributes['name'],
            'name'
          );
          assert.strictEqual(metrics[0].dataPoints[1].value, 1);
          assert.strictEqual(
            metrics[0].dataPoints[1].attributes['state'],
            'used'
          );
          assert.strictEqual(
            metrics[0].dataPoints[1].attributes['name'],
            'name'
          );
          conn.release();
          done();
        });
      });
    });
  });
});
