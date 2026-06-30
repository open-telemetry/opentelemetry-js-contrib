/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { promisify } from 'util';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  ResourceMetrics,
  MetricData,
} from '@opentelemetry/sdk-metrics';
import { METRIC_DB_CLIENT_CONNECTIONS_USAGE } from '../src/semconv';
import { MySQLInstrumentation } from '../src';
import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(
  new MySQLInstrumentation()
);
instrumentation.enable();
instrumentation.disable();

import { createPool, createPoolCluster } from 'mysql';
import type { Pool, PoolCluster, PoolConnection } from 'mysql';

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

describe('mysql@2.x-Metrics', () => {
  let otelTestingMeterProvider;
  let inMemoryMetricsExporter: InMemoryMetricExporter;
  // assumes local mysql db is already available in CI or
  // using `npm run test-services:start` script
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
    let pool: Pool;

    beforeEach(() => {
      initMeterProvider();
      instrumentation.disable();
      instrumentation.enable();
      inMemoryMetricsExporter.reset();
      pool = createPool({
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

    it('Pool - Should add connection usage metrics', async () => {
      const conn: PoolConnection = await promisify(pool.getConnection)();
      assert.ok(conn);

      const sql = 'SELECT 1+1 as solution';
      const results: any = await promisify(conn.query)(sql);
      assert.ok(results);
      assert.strictEqual(results[0]?.solution, 2);
      conn.release();

      const exportedMetrics = await waitForNumberOfExports(
        inMemoryMetricsExporter,
        2
      );
      assert.strictEqual(exportedMetrics.length, 2);
      assertMetrics(exportedMetrics[1].scopeMetrics[0].metrics);
    });

    it('Pool - Create 2 connection, release only 1', async () => {
      const conn1: PoolConnection = await promisify(pool.getConnection)();
      assert.ok(conn1);
      const sql1 = 'SELECT 1+1 as solution';
      await promisify(conn1.query)(sql1);

      const conn2: PoolConnection = await promisify(pool.getConnection)();
      assert.ok(conn2);
      const sql2 = 'SELECT 2+2 as solution';
      await promisify(conn1.query)(sql2);
      conn2.release();
      // Note: conn2 is releases, but conn1 is not.

      const exportedMetrics = await waitForNumberOfExports(
        inMemoryMetricsExporter,
        2
      );
      assert.strictEqual(exportedMetrics.length, 2);
      assertMetrics(exportedMetrics[1].scopeMetrics[0].metrics);
    });

    it('Pool - use pool.query', async () => {
      const sql = 'SELECT 1+1 as solution';
      await promisify(pool.query)(sql);

      const exportedMetrics = await waitForNumberOfExports(
        inMemoryMetricsExporter,
        2
      );
      assert.strictEqual(exportedMetrics.length, 2);
      assertMetrics(exportedMetrics[1].scopeMetrics[0].metrics);
    });
  });

  describe('#PoolCluster - metrics', () => {
    const poolName = 'myPoolName';
    let poolCluster: PoolCluster;

    beforeEach(() => {
      initMeterProvider();
      instrumentation.disable();
      instrumentation.enable();
      inMemoryMetricsExporter.reset();
      poolCluster = createPoolCluster();
      poolCluster.add(poolName, {
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

    it('PoolCluster - Should add connection usage metrics', async () => {
      const conn = (await promisify(
        poolCluster.getConnection
      )()) as PoolConnection;
      assert.ok(conn);

      const sql = 'SELECT 1+1 as solution';
      const results: any = await promisify(conn.query)(sql);
      assert.ok(results);
      assert.strictEqual(results[0]?.solution, 2);

      const exportedMetrics = await waitForNumberOfExports(
        inMemoryMetricsExporter,
        2
      );
      assert.strictEqual(exportedMetrics.length, 2);
      assertMetrics(exportedMetrics[1].scopeMetrics[0].metrics);

      conn.release();
    });
  });
});

function assertMetrics(metrics: MetricData[]) {
  assert.strictEqual(
    metrics.filter(
      m => m.descriptor.name === METRIC_DB_CLIENT_CONNECTIONS_USAGE
    ).length,
    0
  );
}
