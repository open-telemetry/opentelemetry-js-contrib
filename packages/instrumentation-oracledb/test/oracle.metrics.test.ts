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
*
* Copyright (c) 2025, Oracle and/or its affiliates.
* */
import {
  AggregationTemporality,
  DataPoint,
  DataPointType,
  Histogram,
  InMemoryMetricExporter,
  MeterProvider,
  MetricData,
  MetricReader,
} from '@opentelemetry/sdk-metrics';
import * as utils from './utils';
import * as assert from 'assert';
import { OracleInstrumentation } from '../src';
import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';

// let netTime : number
const instrumentation = registerInstrumentationTesting(
  new OracleInstrumentation({ enhancedDatabaseReporting: true })
);
instrumentation.enable();
instrumentation.disable();

const sql = 'SELECT 1 from dual';
const wrongSql = 'SELECT foo from bar';

import * as oracledb from 'oracledb';

import { ATTR_DB_CLIENT_CONNECTION_POOL_NAME, ATTR_DB_CLIENT_CONNECTION_STATE, DB_CLIENT_CONNECTION_STATE_VALUE_IDLE, DB_CLIENT_CONNECTION_STATE_VALUE_USED } from '../src/semconv';
import { ATTR_ERROR_TYPE, METRIC_DB_CLIENT_OPERATION_DURATION, ATTR_DB_OPERATION_NAME } from '@opentelemetry/semantic-conventions';
import { TestMetricReader } from '@opentelemetry/contrib-test-utils';


describe('oracledb-metrics', () => {
  let metricReader: MetricReader
  let meterProvider: MeterProvider;
  let metricsExporter: InMemoryMetricExporter;
  let queueTimeout: number;
  const testOracleDB = process.env.RUN_ORACLEDB_TESTS || true; // For CI: assumes local oracledb is already available
  const testOracleDBLocally = process.env.RUN_ORACLEDB_TESTS_LOCAL || false; // For local: spins up local oracledb via docker
  const shouldTest = testOracleDB || testOracleDBLocally; // Skips these tests if false (default)

  async function initMeterProvider() {
    metricsExporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE
    );
    metricReader = new TestMetricReader()
    meterProvider = new MeterProvider({
      readers: [metricReader]
    });
    instrumentation.setMeterProvider(meterProvider);
    instrumentation.enable();
  }

  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  before(async function () {
    const skip = () => {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      //   this.test!.parent!.pending = true;
      //   console.log('Skipping test-oracledb for metrics.');
      this.skip();
    };

    if (!shouldTest) {
      skip();
    }

    const pool = await oracledb.createPool(utils.POOL_CONFIG);
    const d1 = Date.now();
    await pool.getConnection();
    const d2 = Date.now();
    queueTimeout = Number(d2 - d1) + 100;
    await pool.close(0)
    await initMeterProvider();
  });

  after(async function () {
    instrumentation.disable();
    if (testOracleDBLocally) {
      metricsExporter.reset();
    }
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

  function checkPoolConnMetrics(metrics: MetricData[], pool: oracledb.Pool, idle?: number, used?: number, pending?: number, timeout?: number) {
    if (used == undefined) used = pool.getStatistics().connectionsInUse;
    if (idle == undefined) idle = pool.getStatistics().connectionsOpen - pool.getStatistics().connectionsInUse;
    if (pending == undefined) pending = pool.getStatistics().currentQueueLength;
    if (timeout == undefined) timeout = pool.getStatistics().requestTimeouts;
    for (let i = 0; i < 3; i++)
      assert.strictEqual(metrics[i].dataPointType, DataPointType.SUM);

    const poolName = pool.poolAlias;

    assert.strictEqual(
      metrics[0].descriptor.name,
      'db.client.connection.count'
    );

    assert.strictEqual(
      metrics[0].descriptor.description,
      'The number of connections that are currently in state described by the state attribute.'
    );

    assert.strictEqual(
      metrics[1].descriptor.description,
      'The number of current pending requests for an open connection.'
    );

    assert.strictEqual(
      metrics[2].descriptor.description,
      'The number of connection timeouts that have occurred trying to obtain a connection from the pool.'
    );

    assert.strictEqual(
      metrics[0].dataPoints[1].attributes[ATTR_DB_CLIENT_CONNECTION_STATE],
      DB_CLIENT_CONNECTION_STATE_VALUE_IDLE
    );

    assert.strictEqual(
      metrics[0].dataPoints[1].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
      poolName
    );

    assert.strictEqual(
      metrics[0].dataPoints[0].attributes[ATTR_DB_CLIENT_CONNECTION_STATE],
      DB_CLIENT_CONNECTION_STATE_VALUE_USED
    );

    assert.strictEqual(
      metrics[0].dataPoints[0].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
      poolName
    );

    assert.strictEqual(
      metrics[1].dataPoints[0].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
      poolName
    );

    assert.strictEqual(
      metrics[2].dataPoints[0].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
      poolName
    );

    assert.strictEqual(metrics[0].descriptor.unit, '{connection}');
    assert.strictEqual(metrics[1].descriptor.unit, '{request}');
    assert.strictEqual(metrics[2].descriptor.unit, '{timeout}');

    assert.strictEqual(metrics[0].dataPoints.length, 2);
    // 2 used and idle for pool2
    assert.strictEqual(
      metrics[0].dataPoints[1].value,
      idle
    );
    assert.strictEqual(
      metrics[0].dataPoints[0].value,
      used
    );
    assert.strictEqual(
      metrics[1].dataPoints[0].value,
      pending
    ); // pending requests (again decrease by 1 after timeout)
    assert.strictEqual(
      metrics[2].dataPoints[0].value,
      timeout
    ); // timeout
  }

  describe('1. Pool Connection metrics - pool.getConnection(...) ', () => {

    describe('1.1 Single Pool : pool1', () => {
      let pool: oracledb.Pool;
      const poolName = 'pool1';

      after(async () => {
        if (pool.status !== oracledb.POOL_STATUS_CLOSED) {
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
        await metricReader.shutdown()
        await initMeterProvider()
      })

      async function getThreeConnections(pool: oracledb.Pool) {
        const errors : oracledb.DBError[] = []
        // Request 3 connections simultaneously
        const results = await Promise.allSettled([
          pool.getConnection(),
          pool.getConnection(),
          pool.getConnection()
        ]);

        results.forEach((res, i) => {
          if (res.status === "fulfilled") {
            res.value.close(); // release if somehow it succeeds
          } else {
            errors.push(res.reason)
          }
        });
        if(errors.length)
          throw errors;
      }

      it('1.1.1 Metrics should include poolMin numnber of connections upon pool warmup', async () => {
        await utils.waitForCreatePool(pool, queueTimeout);
        const metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool, pool.poolMin, 0);
      });

      it(`1.1.2 Getting new connection by closing other connection before queueTimeout from a Pool that is full initially`, async () => {
        const conns: any = [];
        for (let i = 0; i < pool.poolMax; i++)
          conns.push(await pool.getConnection());

        setTimeout(async () => {
          await conns[0].close();
          const metrics = await getMetrics();
          checkPoolConnMetrics(metrics, pool, undefined, undefined, 0, 0);
        }, pool.queueTimeout / 2
        );

        const conn = await pool.getConnection();
        const metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool, undefined, undefined, 0, 0);

        for (let i = 1; i < conns.length; i++)
          await conns[i].close();
        await conn.close();
      })

      it('1.1.3 Closing connection... poolTimeout test : Idle connections must be removed', async () => {
        const connection = await pool.getConnection();
        await connection.close();
        let metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool);
        await delay(pool.poolTimeout * 1000 + 500);
        await metricReader.forceFlush()
        metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool);
      });

      it('1.1.4 Getting max (i.e 3) connections from the pool, should timeout on requesting for 1 more connection', async () => {
        const conns: any = [];
        for (let i = 0; i < pool.poolMax; i++)
          conns.push(await pool.getConnection());

        const metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool);

        const d1 = Date.now();
        try {
          setImmediate(async () => {
            const metrics = await getMetrics();
            checkPoolConnMetrics(metrics, pool, undefined, undefined, 1, 0);
          })
          const conn = await pool.getConnection();
          if (conn)
            await conn.close();
        }
        catch (err) {
          const d2 = Date.now();
          assert.ok(
            d2 - d1 <= queueTimeout + 5,
            'took too longer than queuetimeout'
          );
          const metrics = await getMetrics();
          checkPoolConnMetrics(metrics, pool, undefined, undefined, 0, 1);
        }
        finally {
          for (let i = 0; i < conns.length; i++)
            await conns[i].close();
        }
      });

      it('1.1.5 If 3 conn are requested at full pool at same time, metrics pending request should increase to 3 & back to 0', async ()=>{
        if(pool)
          await pool.close(0)
        pool = await oracledb.createPool({
          ...utils.CONFIG,
          poolMin: 1,
          poolMax: 3,
          queueTimeout,
          poolAlias: poolName,
          enableStatistics: true,
          poolTimeout: 5,
        });
        const conns: any = [];
        for (let i = 0; i < pool.poolMax; i++)
          conns.push(await pool.getConnection());
        try {
          setImmediate(async () => {
            const metrics = await getMetrics();
            checkPoolConnMetrics(metrics, pool, undefined, undefined, 3, 0);
          })
          await getThreeConnections(pool);
        }
        catch (err) {
          assert.ok((err as any).length >=1 && (err as any).length <=3);
          const metrics = await getMetrics();
          checkPoolConnMetrics(metrics, pool, undefined, undefined, 0, 3);
        }
        finally {
          for (let i = 0; i < conns.length; i++)
            await conns[i].close();
        }
      })

      it('1.1.6 Pool close - pool connection counts should be reset to 0', async () => {
        await pool.close(0);
        const metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool, 0, 0, 0, 0);
      })

    });

    describe('1.2 Checking Pool connection hits/misses : pool2', ()=>{
      let pool:oracledb.Pool
      const poolName = 'pool2'
      beforeEach(async()=>{
        pool = await oracledb.createPool({...utils.POOL_CONFIG, poolIncrement:2 ,poolAlias:poolName})
        await initMeterProvider();
      })

      afterEach(async()=>{
        if(pool) await pool.close(0)
      })

      function checkConnHitsMisses(metrics: MetricData[], hits: number, misses: number){
        const i = metrics.findIndex(
          (m) => m.descriptor.name === 'db.client.connection.hits'
        );
        if(hits === 0)
          assert.strictEqual(i, -1)
        else
        {
          assert.notEqual(i, -1)     
          assert.strictEqual(metrics[i].dataPointType, DataPointType.SUM);
          assert.strictEqual(metrics[i].dataPoints.length, 1);
          assert.strictEqual(
            metrics[i].dataPoints[0].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
            poolName
          );
          assert.strictEqual(
            metrics[i].dataPoints[0].value,
            hits
          );
        }
        
        const j = metrics.findIndex(
          (m) => m.descriptor.name === 'db.client.connection.misses'
        );
        if(misses === 0)
          assert.strictEqual(j, -1)
        else{
          assert.notEqual(j, -1)
          assert.strictEqual(metrics[j].dataPointType, DataPointType.SUM);
          assert.strictEqual(metrics[j].dataPoints.length, 1);
          assert.strictEqual(
            metrics[j].dataPoints[0].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
            poolName
          );
          assert.strictEqual(
            metrics[j].dataPoints[0].value,
            misses
          );
        }
      }

      it('1.2.1 No hits/miss on pool warmup', async()=>{
        await utils.waitForCreatePool(pool, queueTimeout)
        const metrics = await getMetrics();
        checkConnHitsMisses(metrics,0,0)
      })

      it('1.2.2 Should be connection miss on getting connection with no pool warmup', async()=>{
        await pool.getConnection();
        const metrics = await getMetrics();
        checkConnHitsMisses(metrics,0,1)
      })

      it('1.2.3 Should be atmost poolMin connection hits & subsequent misses when getting connections after pool warmup', async()=>{
        await utils.waitForCreatePool(pool, queueTimeout)
        for(let i=0; i<pool.poolMin; i++)
          await pool.getConnection();
        let metrics = await getMetrics();
        checkConnHitsMisses(metrics,pool.poolMin,0)
        await pool.getConnection();
        metrics = await getMetrics();
        checkConnHitsMisses(metrics,pool.poolMin,1)
      })
      
      it('1.2.4 Should be Connection miss on getting connection from pool with no free connections', async()=>{
        instrumentation.disable();
        for(let i=0; i<pool.poolMin; i++)
          await pool.getConnection();
        instrumentation.enable();
        await pool.getConnection();
        const metrics = await getMetrics();
        checkConnHitsMisses(metrics,0,1)
      })
      
      it('1.2.5 Should be multiple connection misses on getting multiple connections from pool with no free connections', async()=>{
        for(let i=0; i<pool.poolMin; i++)
          await pool.getConnection();
        const metrics = await getMetrics();
        checkConnHitsMisses(metrics,0,pool.poolMin)
      })

      it('1.2.6 Should be a connection hit when there are extra free connections according due to pool increment', async()=>{
        for(let i=0; i<pool.poolMin; i++)
          await pool.getConnection();
        await pool.getConnection();
        await new Promise((resolve) => setTimeout(resolve, queueTimeout*pool.poolIncrement));
        await pool.getConnection();
        let metrics = await getMetrics();
        checkConnHitsMisses(metrics,1,pool.poolMin+1);
      })

      it('1.2.7 Should be a connection hit if a connection is got after some connection is closed', async()=>{
        const conn = await pool.getConnection();
        await conn.close()
        await pool.getConnection();
        let metrics = await getMetrics();
        checkConnHitsMisses(metrics,1,1);
      })

    } )

    describe('1.3 Multiple pools : all of them should be instrumented', () => {

      after(async () => {
        if (newPool1)
          await newPool1.close(0)
        if (newPool2)
          await newPool2.close(0)
      })

      before(async () => {
        await meterProvider.shutdown();
        await initMeterProvider();
      })

      let newPool1: oracledb.Pool
      let newPool2: oracledb.Pool
      let poolName1 = 'newPool1';
      let poolName2 = 'newPool2';

      it('1.3.1 Creating 2 pools...', async () => {

        newPool1 = await oracledb.createPool({ ...utils.POOL_CONFIG, poolAlias: poolName1, enableStatistics: true })
        newPool2 = await oracledb.createPool({ ...utils.POOL_CONFIG, poolAlias: poolName2, enableStatistics: true })

        await Promise.all([
          newPool1.getConnection(),
          newPool2.getConnection()
        ])

        const metrics = await getMetrics();
        assert.strictEqual(metrics[0].dataPointType, DataPointType.SUM);
        assert.strictEqual(
          metrics[0].descriptor.description,
          'The number of connections that are currently in state described by the state attribute.'
        );
        assert.strictEqual(metrics[0].descriptor.unit, '{connection}');
        assert.strictEqual(metrics[0].dataPoints.length, 4);

        if (metrics[0].dataPoints[0].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME] === poolName2) {
          let temp = poolName1
          poolName1 = poolName2;
          poolName2 = temp;
          let tempp = newPool1
          newPool1 = newPool2;
          newPool2 = tempp;
        }
        assert.strictEqual(
          metrics[0].dataPoints[1].value,
          newPool1.getStatistics().connectionsOpen -
          newPool1.getStatistics().connectionsInUse
        );
        assert.strictEqual(
          metrics[0].dataPoints[0].value,
          newPool1.getStatistics().connectionsInUse
        );
        assert.strictEqual(
          metrics[0].descriptor.name,
          'db.client.connection.count'
        );

        assert.strictEqual(
          metrics[0].dataPoints[1].attributes[ATTR_DB_CLIENT_CONNECTION_STATE],
          DB_CLIENT_CONNECTION_STATE_VALUE_IDLE
        );

        assert.strictEqual(
          metrics[0].dataPoints[1].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
          poolName1
        );

        assert.strictEqual(
          metrics[0].dataPoints[0].attributes[ATTR_DB_CLIENT_CONNECTION_STATE],
          DB_CLIENT_CONNECTION_STATE_VALUE_USED
        );

        assert.strictEqual(
          metrics[0].dataPoints[0].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
          poolName1
        );

        assert.strictEqual(
          metrics[0].dataPoints[3].value,
          newPool2.getStatistics().connectionsOpen -
          newPool2.getStatistics().connectionsInUse
        );
        assert.strictEqual(
          metrics[0].dataPoints[2].value,
          newPool2.getStatistics().connectionsInUse
        );
        assert.strictEqual(
          metrics[0].descriptor.name,
          'db.client.connection.count'
        );

        assert.strictEqual(
          metrics[0].dataPoints[3].attributes[ATTR_DB_CLIENT_CONNECTION_STATE],
          DB_CLIENT_CONNECTION_STATE_VALUE_IDLE
        );

        assert.strictEqual(
          metrics[0].dataPoints[3].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
          poolName2
        );

        assert.strictEqual(
          metrics[0].dataPoints[2].attributes[ATTR_DB_CLIENT_CONNECTION_STATE],
          DB_CLIENT_CONNECTION_STATE_VALUE_USED
        );

        assert.strictEqual(
          metrics[0].dataPoints[2].attributes[ATTR_DB_CLIENT_CONNECTION_POOL_NAME],
          poolName2
        );
      })
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

    function checkDurationMetrics(metrics: MetricData[], operationName:string, err?: unknown) {
      const i = metrics.findIndex(
        (m) => m.descriptor.name === METRIC_DB_CLIENT_OPERATION_DURATION
      );

      assert.strictEqual(
        metrics[i].descriptor.name,
        METRIC_DB_CLIENT_OPERATION_DURATION
      );
      assert.strictEqual(
        metrics[i].descriptor.description,
        'Duration of database client operations.'
      );
      const dataPoint = metrics[i].dataPoints[0];
      assert.strictEqual(
        dataPoint.attributes[ATTR_DB_OPERATION_NAME],
        operationName
      );

      if (err)
        assert.strictEqual(dataPoint.attributes[ATTR_ERROR_TYPE], (err as oracledb.DBError).code);

      const v = (dataPoint as DataPoint<Histogram>).value;
      v.min = v.min ? v.min : 0;
      v.max = v.max ? v.max : 0;
      assert.equal(
        v.min > 0,
        true,
        'expect min value for Histogram to be greater than 0'
      );
      assert.equal(
        v.max > 0,
        true,
        'expect max value for Histogram to be greater than 0'
      );
    }

    after(async () => {
      try {
        await pool.close(0)
      }
      catch (err) {
        console.log(err)
      }
    })

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
    })

    it(`2.1 Should generate ${METRIC_DB_CLIENT_OPERATION_DURATION} metric when executed using execute()`, async () => {
      await meterProvider.shutdown();
      await initMeterProvider();

      const conn = await pool.getConnection()
      await conn.execute(sql)
      const metrics = await getMetrics();
      checkDurationMetrics(metrics, 'SELECT');

      await conn.close()
    })

    it(`2.2 Should generate ${METRIC_DB_CLIENT_OPERATION_DURATION} metric with correct operation name 
      \twhen statement is PLSQL containing outBinds binds & executed using execute()`, async () => {
      await meterProvider.shutdown();
      await initMeterProvider();
      const plsql = `BEGIN
                      SELECT 1 INTO :a FROM dual;
                      SELECT 2 INTO :b FROM dual;
                     END;`;
      const conn = await pool.getConnection()
      await conn.execute(plsql, {
        a: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        b: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      })
      const metrics = await getMetrics();
      checkDurationMetrics(metrics, "PLSQL");

      await conn.close()
    })

    it(`2.3 Should generate ${METRIC_DB_CLIENT_OPERATION_DURATION} metric with correct operation name 
      \twhen executed using executeMany() containing inputBinds`, async () => {
      await meterProvider.shutdown();
      await initMeterProvider();
      const conn = await pool.getConnection();
      instrumentation.disable()
      await conn.execute(dropTableSql);
      await conn.execute(createTableSql);

      // Define DML statement (INSERT)
      const sql = `INSERT INTO test_temp (id, name) VALUES (:id, :name)`;

      // Define binds (array of objects)
      const binds = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
      ];

      const options = { batchErrors: true , autoCommit:true};
      instrumentation.enable()
      await conn.executeMany(sql, binds, options);
      await conn.commit();
      const metrics = await getMetrics();
      checkDurationMetrics(metrics, "BATCH INSERT");

      conn.execute(`DROP TABLE test_temp PURGE`)
      await conn.commit();

      await conn.close()
    })

    it(`2.4 Should generate ${METRIC_DB_CLIENT_OPERATION_DURATION} metric with correct operation name 
      \twhen statement is PLSQL & executed using executeMany() containing inputBinds`, async () => {
      await meterProvider.shutdown();
      await initMeterProvider();
      const conn = await pool.getConnection();
      instrumentation.disable()
      await conn.execute(dropTableSql);
      await conn.execute(createTableSql);

      const plsql = `BEGIN
                      INSERT INTO test_temp (id, name)
                      VALUES (:id, :name);
                     END;`;

      const binds = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
        { id: 3, name: "Charlie" },
      ];

      instrumentation.enable();
      await conn.executeMany(plsql, binds);
      await conn.commit();
      const metrics = await getMetrics();
      checkDurationMetrics(metrics, "BATCH PLSQL");
      
      conn.execute(`DROP TABLE test_temp PURGE`)
      await conn.commit();

      await conn.close()
    })

    it(`2.5 Should generate ${METRIC_DB_CLIENT_OPERATION_DURATION} metric with error attribute`, async () => {
      const conn = await pool.getConnection();
      try {
        await meterProvider.shutdown();
        await initMeterProvider()

        await conn.execute(wrongSql)
      }
      catch (err: unknown) {
        const metrics = await getMetrics();
        checkDurationMetrics(metrics, 'SELECT', err);
      }
      finally {
        await conn.close();
      }
    })
  })

  describe('3. Pool Metrics collection upon Instrumentation enable/disable check', () => {
    beforeEach(async () => {
      await metricReader.shutdown()
      await initMeterProvider()
    })
    it('3.1 Any metric update before doing instrumentation.enable() should not be reflected', async () => {
      instrumentation.disable()
      const poolName = 'demopool'
      const pool = await oracledb.createPool({
        ...utils.POOL_CONFIG, poolMin: 1,
        poolMax: 3,
        queueTimeout,
        poolAlias: poolName,
        enableStatistics: true,
        poolTimeout: 5,
      })
      const conn = await pool.getConnection();
      instrumentation.enable();
      try {
        const { resourceMetrics, errors } = await metricReader.collect();
        assert.deepEqual(
          errors,
          [],
          'expected no errors from the callback during metric collection'
        );
        assert.strictEqual(resourceMetrics.scopeMetrics.length, 0)
      }
      catch (err) {
        console.log(err)
      }
      finally {
        if (conn)
          await conn.close()
        if (pool)
          await pool.close(0)
      }
    })

    it('3.2 Any metric update after doing instrumentation.disable() should not be reflected', async () => {
      instrumentation.enable()
      const poolName = 'demopool'
      const pool = await oracledb.createPool({
        ...utils.POOL_CONFIG, poolMin: 1,
        poolMax: 3,
        queueTimeout,
        poolAlias: poolName,
        enableStatistics: true,
        poolTimeout: 5,
      })

      await utils.waitForCreatePool(pool, queueTimeout)
      const metrics = await getMetrics();
      checkPoolConnMetrics(metrics, pool)

      instrumentation.disable()
      const conn = await pool.getConnection();

      try {
        const metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool, 1, 0, 0, 0);
      }
      catch (err) {
        console.log(err)
      }
      finally {
        if (conn)
          await conn.close()
        if (pool)
          await pool.close(0)
      }
    })

    it('3.3 Pools created before enabling instrumentation should also be instrumented', async () => {
      instrumentation.disable()
      const poolName = 'demopool'
      const pool = await oracledb.createPool({
        ...utils.POOL_CONFIG, poolMin: 1,
        poolMax: 3,
        queueTimeout,
        poolAlias: poolName,
        enableStatistics: true,
        poolTimeout: 5,
      })
      instrumentation.enable()
      const conn = await pool.getConnection();
      try {
        const metrics = await getMetrics();
        checkPoolConnMetrics(metrics, pool,0,1,0,0)
      }
      catch (err) {
        console.log(err)
      }
      finally {
        if (conn)
          await conn.close();
        if (pool)
          await pool.close(0)
      }
    })

  })

});