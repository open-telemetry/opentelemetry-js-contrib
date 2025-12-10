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

import * as assert from 'assert';
import { promisify } from 'util';
import {
  AggregationTemporality,
  DataPointType,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  ResourceMetrics,
  MetricData,
} from '@opentelemetry/sdk-metrics';
import { SemconvStability } from '@opentelemetry/instrumentation';
import { ATTR_DB_CLIENT_CONNECTION_POOL_NAME, ATTR_DB_CLIENT_CONNECTION_STATE, METRIC_DB_CLIENT_CONNECTION_COUNT, METRIC_DB_CLIENT_CONNECTIONS_USAGE } from '../src/semconv';
import { MySQLInstrumentation } from '../src';
import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';

// By default tests run with both old and stable semconv. Some test cases
// specifically test the various values of OTEL_SEMCONV_STABILITY_OPT_IN.
process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'database/dup';
const DEFAULT_SEMCONV_STABILITY = SemconvStability.DUPLICATE;

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
      assertMetrics(exportedMetrics[1].scopeMetrics[0].metrics, {
        expectedConnCountIdle: 1,
        expectedConnCountUsed: 0,
      })
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
      assertMetrics(exportedMetrics[1].scopeMetrics[0].metrics, {
        expectedConnCountIdle: 1,
        expectedConnCountUsed: 1,
      })
    });

    it('Pool - use pool.query', async () => {
      const sql = 'SELECT 1+1 as solution';
      await promisify(pool.query)(sql);

      const exportedMetrics = await waitForNumberOfExports(
        inMemoryMetricsExporter,
        2
      );
      assert.strictEqual(exportedMetrics.length, 2);
      assertMetrics(exportedMetrics[1].scopeMetrics[0].metrics, {
        expectedConnCountIdle: 1,
        expectedConnCountUsed: 0,
      });
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
      const conn = await promisify(poolCluster.getConnection)() as PoolConnection;
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
      assertMetrics(exportedMetrics[1].scopeMetrics[0].metrics, {
        poolName,
        expectedConnCountIdle: 0,
        expectedConnCountUsed: 1,
      });

      conn.release();
    });
  });
});


function assertMetrics(
  metrics: MetricData[],
  opts: {
    expectedConnCountIdle: number,
    expectedConnCountUsed: number,
    poolName?: string,
    semconvStability?: SemconvStability,
  }
) {
  const semconvStability = opts.semconvStability ?? DEFAULT_SEMCONV_STABILITY;
  const expectedConnCountIdle = opts.expectedConnCountIdle ?? 0;
  const expectedConnCountUsed = opts.expectedConnCountUsed ?? 0;

  if (semconvStability & SemconvStability.OLD) {
    // db.client.connections.usage
    const md = metrics.filter(md => md.descriptor.name === METRIC_DB_CLIENT_CONNECTIONS_USAGE)[0];
    assert.ok(md);
    assert.strictEqual(md.dataPointType, DataPointType.SUM);
    assert.strictEqual(
      md.descriptor.description,
      'The number of connections that are currently in state described by the state attribute.'
    );
    assert.strictEqual(md.descriptor.unit, '{connection}');
    assert.strictEqual(md.dataPoints.length, 2);
    const poolNameOld = opts.poolName ??
      `host: '${host}', port: ${port}, database: '${database}', user: '${user}'`;

    assert.strictEqual(md.dataPoints[0].attributes['state'], 'idle');
    assert.strictEqual(md.dataPoints[0].value, expectedConnCountIdle);
    assert.strictEqual(md.dataPoints[0].attributes['name'], poolNameOld);

    assert.strictEqual(md.dataPoints[1].attributes['state'], 'used');
    assert.strictEqual(md.dataPoints[1].value, expectedConnCountUsed);
    assert.strictEqual(md.dataPoints[1].attributes['name'], poolNameOld);
  }

  if (semconvStability & SemconvStability.STABLE) {
    // db.client.connection.count
    const md = metrics.filter(md => md.descriptor.name === METRIC_DB_CLIENT_CONNECTION_COUNT)[0];
    assert.ok(md);
    assert.strictEqual(md.dataPointType, DataPointType.SUM);
    assert.strictEqual(
      md.descriptor.description,
      'The number of connections that are currently in state described by the `db.client.connection.state` attribute.'
    );
    assert.strictEqual(md.descriptor.unit, '{connection}');
    assert.strictEqual(md.dataPoints.length, 2);
    const poolName = opts.poolName ?? `${host}:${port}/${database}`;

    assert.strictEqual(
      md.dataPoints[0].attributes[ATTR_DB_CLIENT_CONNECTION_STATE],
      'idle'
    );
    assert.strictEqual(md.dataPoints[0].value, expectedConnCountIdle);
    assert.strictEqual(
      md.dataPoints[0].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
      poolName,
    );

    assert.strictEqual(
      md.dataPoints[1].attributes[ATTR_DB_CLIENT_CONNECTION_STATE],
      'used'
    );
    assert.strictEqual(md.dataPoints[1].value, expectedConnCountUsed);
    assert.strictEqual(
      md.dataPoints[1].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
      poolName,
    );
  }
}
