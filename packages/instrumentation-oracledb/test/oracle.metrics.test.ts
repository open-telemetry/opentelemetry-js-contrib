/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2026, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  type DataPoint,
  DataPointType,
  type Histogram,
  MeterProvider,
  type MetricData,
  type MetricReader,
} from '@opentelemetry/sdk-metrics';
import * as utils from './utils';
import * as assert from 'assert';
import { OracleInstrumentation } from '../src';
import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(
  new OracleInstrumentation({ enhancedDatabaseReporting: true })
);
instrumentation.enable();
instrumentation.disable();

const sql = 'SELECT 1 from dual';
const wrongSql = 'SELECT foo from bar';

import * as oracledb from 'oracledb';

import {
  ATTR_DB_CLIENT_CONNECTION_POOL_NAME,
  ATTR_DB_CLIENT_CONNECTION_STATE,
  DB_CLIENT_CONNECTION_STATE_VALUE_IDLE,
  DB_CLIENT_CONNECTION_STATE_VALUE_USED,
  METRIC_DB_CLIENT_CONNECTION_COUNT,
  METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS,
  METRIC_DB_CLIENT_CONNECTION_TIMEOUTS,
} from '../src/semconv';
import {
  ATTR_ERROR_TYPE,
  METRIC_DB_CLIENT_OPERATION_DURATION,
  ATTR_DB_OPERATION_NAME,
} from '@opentelemetry/semantic-conventions';
import { TestMetricReader } from '@opentelemetry/contrib-test-utils';

describe('oracledb-metrics', () => {
  let metricReader: MetricReader;
  let meterProvider: MeterProvider;
  let queueTimeout: number;
  const testOracleDB = process.env.RUN_ORACLEDB_TESTS; // For CI: assumes local oracledb is already available
  const testOracleDBLocally = process.env.RUN_ORACLEDB_TESTS_LOCAL; // For local: spins up local oracledb via docker
  const shouldTest = testOracleDB || testOracleDBLocally; // Skips these tests if false (default)

  async function initMeterProvider() {
    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({
      readers: [metricReader],
    });
    instrumentation.setMeterProvider(meterProvider);
    instrumentation.enable();
  }

  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isConnectionRequestTimeout(error: unknown): boolean {
    if (error instanceof Error) return error.message.includes('NJS-040');
    return Array.isArray(error) && error.some(isConnectionRequestTimeout);
  }

  before(async function () {
    // Give the database up to 60 seconds to register its service.
    this.timeout(60000);

    const skip = () => {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    };

    if (!shouldTest) {
      skip();
    }
    // node-oracledb exposes the driver metrics APIs used by this suite from
    // version 7.0 onwards. Older versions remain covered by trace tests.
    if (oracledb.version < 70000) {
      skip();
    }

    // Retry connection mechanism for intermittent service registration (NJS-518).
    const maxRetries = 15;
    const delayMs = 3000;

    for (let i = 0; i < maxRetries; i++) {
      let pool: oracledb.Pool | undefined;
      let connection: oracledb.Connection | undefined;
      try {
        pool = await oracledb.createPool(utils.POOL_CONFIG);
        const d1 = Date.now();
        connection = await pool.getConnection();
        const d2 = Date.now();
        queueTimeout = Number(d2 - d1) + 1000;
        await connection.close();
        await pool.close(0);
        break;
      } catch (err: any) {
        if (connection) {
          await connection.close().catch(() => undefined);
        }
        if (pool) {
          await pool.close(0).catch(() => undefined);
        }

        // NJS-518: Listener service not registered yet
        // ORA-01017: User/credentials don't exist yet while startup scripts run
        const isStartupError =
          err?.message?.includes('NJS-518') ||
          err?.message?.includes('ORA-01017');
        const isLastRetry = i === maxRetries - 1;

        if (isStartupError && !isLastRetry) {
          console.log(
            `[Oracle Metrics Test Setup] Database initialization in progress (${err.message.split(':')[0]}). Retrying in ${delayMs / 1000}s... (${i + 1}/${maxRetries})`
          );
          await delay(delayMs);
        } else {
          throw err;
        }
      }
    }
    await initMeterProvider();
  });

  after(async () => {
    instrumentation.disable();
  });

  async function getMetrics(): Promise<MetricData[]> {
    const { resourceMetrics, errors } = await metricReader.collect();
    assert.deepEqual(
      errors,
      [],
      'expected no errors from the callback during metric collection'
    );
    return resourceMetrics.scopeMetrics[0].metrics;
  }

  function findMetric(metrics: MetricData[], name: string): MetricData {
    const metric = metrics.find(metric => metric.descriptor.name === name);
    assert.ok(metric, `expected ${name}`);
    return metric;
  }

  function findPoolMetricDataPoint(
    metric: MetricData,
    poolName: string | undefined,
    state?: string
  ): DataPoint<number> {
    const dataPoints = metric.dataPoints as DataPoint<number>[];
    const dataPoint = dataPoints.find(
      dp =>
        dp.attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME] === poolName &&
        (state === undefined ||
          dp.attributes[ATTR_DB_CLIENT_CONNECTION_STATE] === state)
    );
    assert.ok(
      dataPoint,
      `expected ${metric.descriptor.name} datapoint for ${poolName}${
        state ? `/${state}` : ''
      }`
    );
    return dataPoint as DataPoint<number>;
  }

  function checkPoolConnMetrics(
    metrics: MetricData[],
    pool: oracledb.Pool,
    idle?: number,
    used?: number,
    pending?: number,
    timeout?: number
  ) {
    if (
      used === undefined ||
      idle === undefined ||
      pending === undefined ||
      timeout === undefined
    ) {
      const stats = pool.getStatistics();
      if (used === undefined) used = stats.connectionsInUse;
      if (idle === undefined)
        idle = stats.connectionsOpen - stats.connectionsInUse;
      if (pending === undefined) pending = stats.currentQueueLength;
      if (timeout === undefined) timeout = stats.requestTimeouts;
    }

    const poolName = pool.poolAlias;

    const countMetric = findMetric(metrics, METRIC_DB_CLIENT_CONNECTION_COUNT);
    const pendingMetric = findMetric(
      metrics,
      METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS
    );
    const timeoutMetric = findMetric(
      metrics,
      METRIC_DB_CLIENT_CONNECTION_TIMEOUTS
    );

    assert.strictEqual(countMetric.dataPointType, DataPointType.SUM);
    assert.strictEqual(pendingMetric.dataPointType, DataPointType.SUM);
    assert.strictEqual(timeoutMetric.dataPointType, DataPointType.SUM);

    assert.strictEqual(
      countMetric.descriptor.description,
      'The number of connections that are currently in state described by the state attribute.'
    );

    assert.strictEqual(
      pendingMetric.descriptor.description,
      'The number of current pending requests for an open connection.'
    );

    assert.strictEqual(
      timeoutMetric.descriptor.description,
      'The number of connection timeouts that have occurred trying to obtain a connection from the pool.'
    );

    assert.strictEqual(countMetric.descriptor.unit, '{connection}');
    assert.strictEqual(pendingMetric.descriptor.unit, '{request}');
    assert.strictEqual(timeoutMetric.descriptor.unit, '{timeout}');

    const idleDataPoint = findPoolMetricDataPoint(
      countMetric,
      poolName,
      DB_CLIENT_CONNECTION_STATE_VALUE_IDLE
    );

    const usedDataPoint = findPoolMetricDataPoint(
      countMetric,
      poolName,
      DB_CLIENT_CONNECTION_STATE_VALUE_USED
    );

    const pendingDataPoint = findPoolMetricDataPoint(pendingMetric, poolName);

    const timeoutDataPoint = findPoolMetricDataPoint(timeoutMetric, poolName);

    assert.strictEqual(
      idleDataPoint?.value,
      idle,
      `Mismatched idle value for pool ${poolName}`
    );
    assert.strictEqual(
      usedDataPoint?.value,
      used,
      `Mismatched used value for pool ${poolName}`
    );
    assert.strictEqual(
      pendingDataPoint?.value,
      pending,
      `Mismatched pending value for pool ${poolName}`
    );
    assert.strictEqual(
      timeoutDataPoint?.value,
      timeout,
      `Mismatched timeout value for pool ${poolName}`
    );
  }

  describe('1. Pool Connection metrics - pool.getConnection(...) ', () => {
    describe('1.1 Single Pool : pool1', () => {
      let pool: oracledb.Pool;
      const poolName = 'pool1';

      after(async () => {
        if (pool.status === oracledb.POOL_STATUS_OPEN) {
          await pool.close(0);
        }
      });

      before(async () => {
        pool = await oracledb.createPool({
          ...utils.CONFIG,
          poolMin: 1,
          poolMax: 3,
          queueTimeout,
          poolAlias: poolName,
          enableStatistics: true,
          poolTimeout: 5,
        });
      });

      afterEach(async () => {
        await metricReader.shutdown();
        await initMeterProvider();
      });

      async function getThreeConnections(pool: oracledb.Pool) {
        const errors: oracledb.DBError[] = [];
        const connections: oracledb.Connection[] = [];
        // Request 3 connections simultaneously
        const results = await Promise.allSettled([
          pool.getConnection(),
          pool.getConnection(),
          pool.getConnection(),
        ]);

        results.forEach(res => {
          if (res.status === 'fulfilled') {
            connections.push(res.value);
          } else {
            errors.push(res.reason);
          }
        });
        await Promise.all(connections.map(conn => conn.close()));
        if (errors.length) throw errors;
      }

      it('1.1.1 Metrics should include poolMin numnber of connections upon pool warmup', async function () {
        // node-oracledb currently emits the pool expansion callback only in
        // Thin mode
        if (!oracledb.thin) {
          this.skip();
        }
        assert.ok(
          await utils.waitForCreatePool(pool, queueTimeout),
          `expected ${poolName} to warm up`
        );
        const metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool, pool.poolMin, 0);
      });

      it('1.1.2 Getting new connection by closing other connection before queueTimeout from a Pool that is full initially', async () => {
        const conns: oracledb.Connection[] = [];
        try {
          // filling up the pool
          for (let i = 0; i < pool.poolMax; i++) {
            conns.push(await pool.getConnection());
          }
        } catch (error) {
          await Promise.all(conns.map(conn => conn.close()));
          throw error;
        }

        let conn: oracledb.Connection | undefined;
        let firstConnClosed = false;
        const requestStartedAt = Date.now();
        const pendingConnection = pool.getConnection().then(
          conn => ({ status: 'fulfilled' as const, conn }),
          err => ({ status: 'rejected' as const, err })
        );

        try {
          const deadline = Date.now() + pool.queueTimeout;
          while (
            pool.getStatistics().currentQueueLength !== 1 &&
            Date.now() < deadline
          ) {
            await delay(5);
          }

          let metrics = await getMetrics();
          checkPoolConnMetrics(metrics, pool, undefined, undefined, 1, 0);

          const releaseDelay = Math.max(
            pool.queueTimeout / 2 - (Date.now() - requestStartedAt),
            0
          );
          await delay(releaseDelay);
          await conns[0].close();
          firstConnClosed = true;

          const result = await pendingConnection;
          if (result.status === 'rejected') throw result.err;
          conn = result.conn;

          metrics = await getMetrics();
          checkPoolConnMetrics(metrics, pool, undefined, undefined, 0, 0);
        } finally {
          if (!firstConnClosed) {
            await conns[0].close().catch(() => undefined);
          }
          const result = await pendingConnection;
          if (result.status === 'fulfilled' && result.conn !== conn) {
            await result.conn.close();
          }
          for (let i = 1; i < conns.length; i++) await conns[i].close();
          if (conn) await conn.close();
        }
      });

      it('1.1.3 Closing connection... poolTimeout test : Idle connections must be removed', async function () {
        this.timeout(pool.poolTimeout * 1000 + 4000);
        const connection = await pool.getConnection();
        await connection.close();
        let metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool);
        await delay(pool.poolTimeout * 1000 + 500);
        await metricReader.forceFlush();
        metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool);
      });

      it('1.1.4 Getting max (i.e 3) connections from the pool, should timeout on requesting for 1 more connection', async function () {
        this.timeout(Math.max(pool.queueTimeout * (pool.poolMax + 2), 15000));
        const conns: oracledb.Connection[] = [];
        try {
          for (let i = 0; i < pool.poolMax; i++) {
            conns.push(await pool.getConnection());
          }
        } catch (error) {
          await Promise.all(conns.map(conn => conn.close()));
          throw error;
        }

        const pendingConnection = pool.getConnection().then(
          conn => ({ status: 'fulfilled' as const, conn }),
          err => ({ status: 'rejected' as const, err })
        );
        try {
          const metrics = await getMetrics();
          checkPoolConnMetrics(metrics, pool);

          await new Promise<void>(resolve => setImmediate(resolve));
          const pendingMetrics = await getMetrics();
          checkPoolConnMetrics(
            pendingMetrics,
            pool,
            undefined,
            undefined,
            1,
            0
          );

          const result = await pendingConnection;
          if (result.status === 'fulfilled') {
            await result.conn.close();
            assert.fail('expected getConnection to time out when pool is full');
          }
          const timeoutMetrics = await getMetrics();
          checkPoolConnMetrics(
            timeoutMetrics,
            pool,
            undefined,
            undefined,
            0,
            1
          );
        } finally {
          const result = await pendingConnection;
          if (result.status === 'fulfilled') {
            await result.conn.close().catch(() => undefined);
          }
          for (let i = 0; i < conns.length; i++) await conns[i].close();
        }
      });

      it('1.1.5 If 3 conn are requested at full pool at same time, metrics pending request should increase to 3 & back to 0', async function () {
        this.timeout(Math.max(pool.queueTimeout * (pool.poolMax + 2), 15000));
        if (pool) await pool.close(0);
        pool = await oracledb.createPool({
          ...utils.CONFIG,
          poolMin: 1,
          poolMax: 3,
          queueTimeout,
          poolAlias: poolName,
          enableStatistics: true,
          poolTimeout: 5,
        });
        const conns: oracledb.Connection[] = [];
        try {
          for (let i = 0; i < pool.poolMax; i++) {
            conns.push(await pool.getConnection());
          }
        } catch (error) {
          await Promise.all(conns.map(conn => conn.close()));
          throw error;
        }
        const pendingConnections = getThreeConnections(pool).then(
          () => ({ status: 'fulfilled' as const }),
          err => ({ status: 'rejected' as const, err })
        );
        try {
          await new Promise<void>(resolve => setImmediate(resolve));
          const pendingMetrics = await getMetrics();
          checkPoolConnMetrics(
            pendingMetrics,
            pool,
            undefined,
            undefined,
            3,
            0
          );

          const result = await pendingConnections;
          if (result.status === 'fulfilled') {
            assert.fail('expected getConnection requests to time out');
          }
          if (
            !Array.isArray(result.err) ||
            !result.err.every(isConnectionRequestTimeout)
          ) {
            throw result.err;
          }
          assert.ok(result.err.length >= 1 && result.err.length <= 3);
          const metrics = await getMetrics();
          checkPoolConnMetrics(metrics, pool, undefined, undefined, 0, 3);
        } finally {
          await pendingConnections;
          for (let i = 0; i < conns.length; i++) await conns[i].close();
        }
      });

      it('1.1.6 Pool close - pool connection counts should be reset to 0', async () => {
        await pool.close(0);
        const metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool, 0, 0, 0, 0);
      });
    });

    describe('1.2 Multiple pools : all of them should be instrumented', () => {
      before(async () => {
        await meterProvider.shutdown();
        await initMeterProvider();
      });

      const poolName1 = 'newPool1';
      const poolName2 = 'newPool2';

      it('1.2.1 Creating 2 pools...', async () => {
        let newPool1: oracledb.Pool | undefined;
        let newPool2: oracledb.Pool | undefined;
        let conn1: oracledb.Connection | undefined;
        let conn2: oracledb.Connection | undefined;
        try {
          newPool1 = await oracledb.createPool({
            ...utils.POOL_CONFIG,
            poolAlias: poolName1,
            enableStatistics: true,
          });
          newPool2 = await oracledb.createPool({
            ...utils.POOL_CONFIG,
            poolAlias: poolName2,
            enableStatistics: true,
          });
          [conn1, conn2] = await Promise.all([
            newPool1.getConnection(),
            newPool2.getConnection(),
          ]);

          const metrics = await getMetrics();
          checkPoolConnMetrics(metrics, newPool1);
          checkPoolConnMetrics(metrics, newPool2);
        } finally {
          await Promise.all([
            conn1?.close().catch(() => undefined),
            conn2?.close().catch(() => undefined),
          ]);
          await newPool1?.close(0).catch(() => undefined);
          await newPool2?.close(0).catch(() => undefined);
        }
      });

      it('1.2.2 Creating 2 pools with distinct states should keep connection counts isolated', async function () {
        this.timeout(Math.max(queueTimeout * 8, 15000));
        const distinctPoolName1 = 'distinctPool1';
        const distinctPoolName2 = 'distinctPool2';
        let pool1: oracledb.Pool | undefined;
        let pool2: oracledb.Pool | undefined;
        const connsPool1: oracledb.Connection[] = [];
        let connPool2: oracledb.Connection | undefined;

        try {
          pool1 = await oracledb.createPool({
            ...utils.POOL_CONFIG,
            poolMin: 2,
            poolMax: 5,
            poolAlias: distinctPoolName1,
            enableStatistics: true,
          });
          pool2 = await oracledb.createPool({
            ...utils.POOL_CONFIG,
            poolMin: 4,
            poolMax: 10,
            poolAlias: distinctPoolName2,
            enableStatistics: true,
          });
          connsPool1.push(
            await pool1.getConnection(),
            await pool2.getConnection()
          );
          connPool2 = await pool2.getConnection();

          const metrics = await getMetrics();
          checkPoolConnMetrics(metrics, pool1);
          checkPoolConnMetrics(metrics, pool2);
        } finally {
          await Promise.all([
            ...connsPool1.map(conn => conn.close().catch(() => undefined)),
            connPool2?.close().catch(() => undefined),
            pool1?.close(0).catch(() => undefined),
            pool2?.close(0).catch(() => undefined),
          ]);
        }
      });
    });
  });

  describe('2. Connection duration metrics', () => {
    let pool: oracledb.Pool;
    const poolName = 'pool';

    // SQL block to drop the table if it exists
    const dropTableSql = `
      BEGIN
        EXECUTE IMMEDIATE 'DROP TABLE test_temp PURGE';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -942 THEN
            RAISE;
          END IF;
      END;
    `;

    // SQL to create the table
    const createTableSql = `
      CREATE TABLE test_temp (
        id NUMBER,
        name VARCHAR2(50)
      )
    `;

    function checkDurationMetrics(
      metrics: MetricData[],
      operationName: string,
      err?: unknown
    ) {
      const durationMetric = findMetric(
        metrics,
        METRIC_DB_CLIENT_OPERATION_DURATION
      );

      assert.strictEqual(
        durationMetric.descriptor.description,
        'Duration of database client operations.'
      );
      const dataPoints = durationMetric.dataPoints as DataPoint<Histogram>[];
      const dataPoint = dataPoints.find(
        dp => dp.attributes[ATTR_DB_OPERATION_NAME] === operationName
      );
      assert.ok(
        dataPoint,
        `expected ${METRIC_DB_CLIENT_OPERATION_DURATION} datapoint for ${operationName}`
      );

      if (err)
        assert.strictEqual(
          dataPoint.attributes[ATTR_ERROR_TYPE],
          (err as oracledb.DBError).code
        );

      const v = (dataPoint as DataPoint<Histogram>).value;
      const min = v.min ?? 0;
      const max = v.max ?? 0;
      assert.equal(
        min > 0,
        true,
        'expect min value for Histogram to be greater than 0'
      );
      assert.equal(
        max > 0,
        true,
        'expect max value for Histogram to be greater than 0'
      );
    }

    after(async () => {
      await pool.close(0).catch(() => undefined);
    });

    before(async () => {
      await meterProvider.shutdown();
      await initMeterProvider();
      pool = await oracledb.createPool({
        ...utils.CONFIG,
        poolMin: 1,
        poolMax: 3,
        queueTimeout,
        poolAlias: poolName,
        enableStatistics: true,
      });
    });

    it(`2.1 Should generate ${METRIC_DB_CLIENT_OPERATION_DURATION} metric when executed using execute()`, async () => {
      let conn: oracledb.Connection | undefined;
      try {
        await meterProvider.shutdown();
        await initMeterProvider();

        conn = await pool.getConnection();
        await conn.execute(sql);
        const metrics = await getMetrics();
        checkDurationMetrics(metrics, 'SELECT');
      } finally {
        await conn?.close().catch(() => undefined);
      }
    });

    it(`2.2 Should generate ${METRIC_DB_CLIENT_OPERATION_DURATION} metric with correct operation name
      \twhen statement is PLSQL containing outBinds binds & executed using execute()`, async () => {
      let conn: oracledb.Connection | undefined;
      try {
        await meterProvider.shutdown();
        await initMeterProvider();
        const plsql = `BEGIN
                      SELECT 1 INTO :a FROM dual;
                      SELECT 2 INTO :b FROM dual;
                     END;`;
        conn = await pool.getConnection();
        await conn.execute(plsql, {
          a: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          b: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        });
        const metrics = await getMetrics();
        checkDurationMetrics(metrics, 'PLSQL');
      } finally {
        await conn?.close().catch(() => undefined);
      }
    });

    it(`2.3 Should generate ${METRIC_DB_CLIENT_OPERATION_DURATION} metric with correct operation name
      \twhen executed using executeMany() containing inputBinds`, async () => {
      let conn: oracledb.Connection | undefined;
      let tableCreated = false;
      try {
        await meterProvider.shutdown();
        await initMeterProvider();
        conn = await pool.getConnection();
        instrumentation.disable();
        await conn.execute(dropTableSql);
        await conn.execute(createTableSql);
        tableCreated = true;

        // Define DML statement (INSERT)
        const sql = 'INSERT INTO test_temp (id, name) VALUES (:id, :name)';

        // Define binds (array of objects)
        const binds = [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Charlie' },
        ];

        const options = { batchErrors: true, autoCommit: true };
        instrumentation.enable();
        await conn.executeMany(sql, binds, options);
        await conn.commit();
        const metrics = await getMetrics();
        checkDurationMetrics(metrics, 'BATCH INSERT');
      } finally {
        if (conn && tableCreated) {
          instrumentation.disable();
          await conn.execute(dropTableSql).catch(() => undefined);
          await conn.commit().catch(() => undefined);
        }
        instrumentation.enable();
        await conn?.close().catch(() => undefined);
      }
    });

    it(`2.4 Should generate ${METRIC_DB_CLIENT_OPERATION_DURATION} metric with correct operation name
      \twhen statement is PLSQL & executed using executeMany() containing inputBinds`, async () => {
      let conn: oracledb.Connection | undefined;
      let tableCreated = false;
      try {
        await meterProvider.shutdown();
        await initMeterProvider();
        conn = await pool.getConnection();
        instrumentation.disable();
        await conn.execute(dropTableSql);
        await conn.execute(createTableSql);
        tableCreated = true;

        const plsql = `BEGIN
                      INSERT INTO test_temp (id, name)
                      VALUES (:id, :name);
                     END;`;

        const binds = [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Charlie' },
        ];

        instrumentation.enable();
        await conn.executeMany(plsql, binds);
        await conn.commit();
        const metrics = await getMetrics();
        checkDurationMetrics(metrics, 'BATCH PLSQL');
      } finally {
        if (conn && tableCreated) {
          instrumentation.disable();
          await conn.execute(dropTableSql).catch(() => undefined);
          await conn.commit().catch(() => undefined);
        }
        instrumentation.enable();
        await conn?.close().catch(() => undefined);
      }
    });

    it(`2.5 Should generate ${METRIC_DB_CLIENT_OPERATION_DURATION} metric with error attribute`, async () => {
      let conn: oracledb.Connection | undefined;
      try {
        conn = await pool.getConnection();
        await meterProvider.shutdown();
        await initMeterProvider();

        let executeError: unknown;
        try {
          await conn.execute(wrongSql);
        } catch (err: unknown) {
          executeError = err;
        }
        assert.ok(executeError, 'expected query execution to fail');
        const metrics = await getMetrics();
        checkDurationMetrics(metrics, 'SELECT', executeError);
      } finally {
        await conn?.close().catch(() => undefined);
      }
    });
  });

  describe('3. Pool Metrics collection upon Instrumentation enable/disable check', () => {
    beforeEach(async () => {
      await metricReader.shutdown();
      await initMeterProvider();
    });
    it('3.1 Any metric update before doing instrumentation.enable() should not be reflected', async () => {
      instrumentation.disable();
      const poolName = 'demopool';
      let pool: oracledb.Pool | undefined;
      let conn: oracledb.Connection | undefined;
      try {
        pool = await oracledb.createPool({
          ...utils.POOL_CONFIG,
          poolMin: 1,
          poolMax: 3,
          queueTimeout,
          poolAlias: poolName,
          enableStatistics: true,
          poolTimeout: 5,
        });
        conn = await pool.getConnection();
        instrumentation.enable();
        const { resourceMetrics, errors } = await metricReader.collect();
        assert.deepEqual(
          errors,
          [],
          'expected no errors from the callback during metric collection'
        );
        assert.strictEqual(resourceMetrics.scopeMetrics.length, 0);
      } finally {
        if (conn) await conn.close().catch(() => undefined);
        if (pool) await pool.close(0).catch(() => undefined);
        instrumentation.enable();
      }
    });

    it('3.2 Any metric update after doing instrumentation.disable() should not be reflected', async () => {
      instrumentation.enable();
      const poolName = 'demopool';
      let pool: oracledb.Pool | undefined;
      let conn: oracledb.Connection | undefined;
      try {
        pool = await oracledb.createPool({
          ...utils.POOL_CONFIG,
          poolMin: 1,
          poolMax: 3,
          queueTimeout,
          poolAlias: poolName,
          enableStatistics: true,
          poolTimeout: 5,
        });

        // node-oracledb currently emits the pool expansion callback only in
        // Thin mode
        if (oracledb.thin) {
          assert.ok(
            await utils.waitForCreatePool(pool, queueTimeout),
            `expected ${poolName} to warm up`
          );
          const metrics = await getMetrics();
          checkPoolConnMetrics(metrics, pool);
        }

        instrumentation.disable();
        conn = await pool.getConnection();

        if (oracledb.thin) {
          const updatedMetrics = await getMetrics();
          // Metrics should only reflect the idle connection created during pool warmup.
          checkPoolConnMetrics(updatedMetrics, pool, pool.poolMin, 0, 0, 0);
        } else {
          const { resourceMetrics } = await metricReader.collect();
          assert.strictEqual(resourceMetrics.scopeMetrics[0], undefined);
        }
      } finally {
        if (conn) await conn.close().catch(() => undefined);
        if (pool) await pool.close(0).catch(() => undefined);
        instrumentation.enable();
      }
    });

    it('3.3 Pools created before enabling instrumentation should also be instrumented', async () => {
      instrumentation.disable();
      const poolName = 'demopool';
      let pool: oracledb.Pool | undefined;
      let conn: oracledb.Connection | undefined;
      try {
        pool = await oracledb.createPool({
          ...utils.POOL_CONFIG,
          poolMin: 1,
          poolMax: 3,
          queueTimeout,
          poolAlias: poolName,
          enableStatistics: true,
          poolTimeout: 5,
        });
        instrumentation.enable();
        conn = await pool.getConnection();
        const metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool, 0, 1, 0, 0);
      } finally {
        if (conn) await conn.close().catch(() => undefined);
        if (pool) await pool.close(0).catch(() => undefined);
        instrumentation.enable();
      }
    });

    it('3.4 Pool state changes while disabled should reconcile on the next pool event', async () => {
      instrumentation.enable();
      const poolName = 'reconcile-pool';
      let pool: oracledb.Pool | undefined;
      let disabledConnection: oracledb.Connection | undefined;
      let enabledConnection: oracledb.Connection | undefined;
      try {
        pool = await oracledb.createPool({
          ...utils.POOL_CONFIG,
          poolMin: 1,
          poolMax: 3,
          queueTimeout,
          poolAlias: poolName,
          enableStatistics: true,
          poolTimeout: 5,
        });

        // node-oracledb currently emits the pool expansion callback only in
        // Thin mode
        if (oracledb.thin) {
          assert.ok(
            await utils.waitForCreatePool(pool, queueTimeout),
            `expected ${poolName} to warm up`
          );
          // Establish the initial reported state: one idle connection.
          checkPoolConnMetrics(await getMetrics(), pool, 1, 0, 0, 0);
        }

        instrumentation.disable();
        disabledConnection = await pool.getConnection();
        assert.strictEqual(pool.connectionsInUse, 1);

        instrumentation.enable();
        // This acquire is the first pool callback after re-enabling. It must
        // reconcile both this acquire and the acquire missed while disabled.
        enabledConnection = await pool.getConnection();

        checkPoolConnMetrics(await getMetrics(), pool, 0, 2, 0, 0);
      } finally {
        await enabledConnection?.close().catch(() => undefined);
        await disabledConnection?.close().catch(() => undefined);
        await pool?.close(0).catch(() => undefined);
        instrumentation.enable();
      }
    });
  });
});
