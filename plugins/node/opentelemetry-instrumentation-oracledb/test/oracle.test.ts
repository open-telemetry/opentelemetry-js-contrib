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
 * Copyright (c) 2024, Oracle and/or its affiliates.
 * */
import {
  Attributes,
  SpanStatusCode,
  context,
  Span,
  SpanKind,
  SpanStatus,
  trace,
} from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  ReadableSpan,
  TimedEvent,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { OracleInstrumentation } from '../src';
import {
  AttributeNames,
  SpanNames,
  DB_SYSTEM_VALUE_ORACLE,
} from '../src/constants';

import {
  SEMATTRS_DB_STATEMENT,
  ATTR_SERVER_ADDRESS,
  SEMATTRS_NET_TRANSPORT,
  SEMATTRS_DB_CONNECTION_STRING,
  ATTR_SERVER_PORT,
  SEMATTRS_DB_USER,
} from '@opentelemetry/semantic-conventions';

import {
  ATTR_DB_NAMESPACE,
  ATTR_DB_SYSTEM,
  ATTR_DB_OPERATION_NAME,
} from '../src/semconv';

const memoryExporter = new InMemorySpanExporter();
let contextManager: AsyncHooksContextManager;
const provider = new BasicTracerProvider();
const tracer = provider.getTracer('external');
const instrumentation = new OracleInstrumentation();
instrumentation.enable();
instrumentation.disable();

import * as oracledb from 'oracledb';

const VER_23_4 = 2304000000;
const hostname = 'localhost';
const pno = 1521;
const serviceName = 'FREEPDB1';
let serverVersion = 2304000000; // DB version.
let numExecSpans = 2; // Default number of Spans created for Execute API in thin mode.
let numConnSpans = 2; // Default number of spans created during connection establishment.
let poolMinSpanCount = 1; // number of spans created for createPool considering poolMin.
const CONFIG = {
  user: process.env.ORACLE_USER || 'demo',
  password: process.env.ORACLE_PASSWORD || 'demo',
  connectString: process.env.ORACLE_CONNECTSTRING || 'localhost:1521/freepdb1',
};
const POOL_CONFIG = {
  ...CONFIG,
  poolMin: 2,
  poolMax: 10,
  poolIncrement: 1,
  poolTimeout: 28,
  stmtCacheSize: 23,
};

// span attributes for execute method not including binds.
let executeAttributes: Record<string, string | number>;
// span attributes for internal round trips with binds sql.
let executeAttributesInternalRoundTripBinds: Record<string, string | number>;
// span attributes when enhancedDatabaseReporting is enabled for sql with no binds
let attributesWithSensitiveDataNoBinds: Record<
  string,
  string | number | string[]
>;
// span attributes when enhancedDatabaseReporting is enabled for sql with binds
let attributesWithSensitiveDataBinds: Record<
  string,
  string | number | string[]
>;
let connAttributes: Record<string, string | number>; // connection related span attributes.
let poolAttributes: Record<string, string | number>; // pool related span attributes.
let connAttrList: Record<string, string | number>[]; // attributes per span during connection establishment.
let failedConnAttrList: Record<string, string | number>[]; // attributes in span for failed connection.
let poolConnAttrList: Record<string, string | number>[]; // attributes per span when connection established from pool.
let spanNamesList: string[]; // span names for rountrips and public API spans.

const DEFAULT_ATTRIBUTES = {
  [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_ORACLE,
  [ATTR_DB_NAMESPACE]: serviceName,
  [SEMATTRS_DB_CONNECTION_STRING]: CONFIG.connectString,
  [ATTR_SERVER_ADDRESS]: hostname,
  [ATTR_SERVER_PORT]: pno,
  [SEMATTRS_DB_USER]: CONFIG.user,
  [SEMATTRS_NET_TRANSPORT]: 'TCP',
};

// for thick mode, we dont have support for
// hostname, port and protocol.
const DEFAULT_ATTRIBUTES_THICK = {
  [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_ORACLE,
  [ATTR_DB_NAMESPACE]: serviceName,
  [SEMATTRS_DB_CONNECTION_STRING]: CONFIG.connectString,
  [SEMATTRS_DB_USER]: CONFIG.user,
};

const POOL_ATTRIBUTES = {
  [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_ORACLE,
  [SEMATTRS_DB_CONNECTION_STRING]: CONFIG.connectString,
  [SEMATTRS_DB_USER]: CONFIG.user,
  [AttributeNames.ORACLE_POOL_MIN]: POOL_CONFIG.poolMin,
  [AttributeNames.ORACLE_POOL_MAX]: POOL_CONFIG.poolMax,
  [AttributeNames.ORACLE_POOL_INCR]: POOL_CONFIG.poolIncrement,
};

const CONN_FAILED_ATTRIBUTES = {
  [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_ORACLE,
  [SEMATTRS_DB_CONNECTION_STRING]: CONFIG.connectString,
  [SEMATTRS_DB_USER]: CONFIG.user,
};

const unsetStatus: SpanStatus = {
  code: SpanStatusCode.UNSET,
};
const errorStatus: SpanStatus = {
  code: SpanStatusCode.ERROR,
};
const defaultEvents: testUtils.TimedEvent[] = [];

if (process.env.NODE_ORACLEDB_DRIVER_MODE === 'thick') {
  // Thick mode requires Oracle Client or Oracle Instant Client libraries.
  // On Windows and macOS Intel you can specify the directory containing the
  // libraries at runtime or before Node.js starts.  On other platforms (where
  // Oracle libraries are available) the system library search path must always
  // include the Oracle library path before Node.js starts.  If the search path
  // is not correct, you will get a DPI-1047 error.  See the node-oracledb
  // installation documentation.
  let clientOpts = {};
  // On Windows and macOS Intel platforms, set the environment
  // variable NODE_ORACLEDB_CLIENT_LIB_DIR to the Oracle Client library path
  if (
    process.platform === 'win32' ||
    (process.platform === 'darwin' && process.arch === 'x64')
  ) {
    clientOpts = { libDir: process.env.NODE_ORACLEDB_CLIENT_LIB_DIR };
  }
  oracledb.initOracleClient(clientOpts); // enable node-oracledb Thick mode
}

function updateAttrSpanList(connection: oracledb.Connection) {
  serverVersion = connection.oracleServerVersion;

  let attributes: Record<string, string | number>;
  if (oracledb.thin) {
    attributes = { ...DEFAULT_ATTRIBUTES };
    attributes[ATTR_SERVER_ADDRESS] = connAttributes[ATTR_SERVER_ADDRESS];
    attributes[ATTR_SERVER_PORT] = connAttributes[ATTR_SERVER_PORT];
    attributes[SEMATTRS_NET_TRANSPORT] = connAttributes[SEMATTRS_NET_TRANSPORT];
  } else {
    attributes = { ...DEFAULT_ATTRIBUTES_THICK };
    numExecSpans = 1;
  }
  attributes[ATTR_DB_NAMESPACE] = connAttributes[ATTR_DB_NAMESPACE];

  // initialize the span attributes list.
  connAttrList = [];
  poolConnAttrList = [];
  spanNamesList = [];
  failedConnAttrList = [];
  if (serverVersion >= VER_23_4) {
    if (oracledb.thin) {
      // for round trips.
      connAttrList.push({ ...attributes });
      poolConnAttrList.push({ ...attributes, ...POOL_ATTRIBUTES });
      poolConnAttrList.push({ ...connAttributes, ...POOL_ATTRIBUTES });
      connAttrList.push({ ...connAttributes });
      failedConnAttrList = [...connAttrList];
      failedConnAttrList[2] = { ...CONN_FAILED_ATTRIBUTES };
      failedConnAttrList[1] = { ...attributes };
      poolMinSpanCount = POOL_CONFIG.poolMin * numConnSpans + 1;
      spanNamesList.push(SpanNames.CONNECT_FAST_AUTH);
      spanNamesList.push(SpanNames.CONNECT_AUTH_MSG);
    } else {
      failedConnAttrList = [{ ...CONN_FAILED_ATTRIBUTES }];
    }
  } else {
    if (oracledb.thin) {
      // for round trips.
      connAttrList.push({ ...attributes });
      connAttrList.push({ ...attributes });
      connAttrList.push({ ...attributes });
      connAttrList.push({ ...connAttributes });
      poolConnAttrList.push({ ...attributes, ...POOL_ATTRIBUTES });
      poolConnAttrList.push({ ...attributes, ...POOL_ATTRIBUTES });
      poolConnAttrList.push({ ...attributes, ...POOL_ATTRIBUTES });
      poolConnAttrList.push({ ...connAttributes, ...POOL_ATTRIBUTES });
      failedConnAttrList = [...connAttrList];
      failedConnAttrList[4] = { ...CONN_FAILED_ATTRIBUTES };
      failedConnAttrList[3] = { ...attributes };
      numConnSpans = 4;
      poolMinSpanCount = POOL_CONFIG.poolMin * numConnSpans + 1;
      spanNamesList.push(SpanNames.CONNECT_PROTOCOL_NEG);
      spanNamesList.push(SpanNames.CONNECT_DATATYPE_NEG);
      spanNamesList.push(SpanNames.CONNECT_AUTH_MSG);
      spanNamesList.push(SpanNames.CONNECT_AUTH_MSG);
    } else {
      numConnSpans = 1;
      failedConnAttrList = [{ ...CONN_FAILED_ATTRIBUTES }];
    }
  }
  // for getConnection
  connAttrList.push({ ...connAttributes });
  poolConnAttrList.push({ ...poolAttributes });
  spanNamesList.push(SpanNames.CONNECT);
}

const verifySpanData = (
  span: ReadableSpan,
  parentSpan: ReadableSpan | null,
  attributes: Attributes,
  events: testUtils.TimedEvent[] = defaultEvents,
  status = unsetStatus,
  errorMessage = ''
) => {
  testUtils.assertSpan(
    span as unknown as ReadableSpan,
    SpanKind.CLIENT,
    attributes,
    events,
    status
  );
  if (errorMessage) {
    assert(span.status.message?.includes(errorMessage));
  }
  if (parentSpan) {
    testUtils.assertPropagation(span, parentSpan as unknown as Span);
  } else {
    assert(span.parentSpanId === undefined);
  }
};

function checkRoundTripSpans(
  spans: ReadableSpan[],
  parentSpan: ReadableSpan | null,
  attributesList: Attributes[],
  eventList: TimedEvent[][] = [defaultEvents, defaultEvents],
  statusList: SpanStatus[] = [unsetStatus, unsetStatus],
  spanNamesList: string[] = [SpanNames.EXECUTE_MSG, SpanNames.EXECUTE],
  errorMessageList: string[] = ['', '']
) {
  // verfiy roundtrip child span or public API span if no roundtrip
  // span is generated.
  for (let index = 0; index < spans.length - 1; index++) {
    assert.deepStrictEqual(spans[index].name, spanNamesList[index]);
    verifySpanData(
      spans[index],
      parentSpan,
      attributesList[index],
      eventList[index],
      statusList[index],
      errorMessageList[index]
    );
  }
}

// It verifies the spans, its attributes and the parent child relationship.
function verifySpans(
  parentSpan: Span | null,
  attributesList: Attributes[] = [executeAttributes, executeAttributes],
  spanNamesList: string[] = [SpanNames.EXECUTE_MSG, SpanNames.EXECUTE],
  eventList: testUtils.TimedEvent[][] = [defaultEvents, defaultEvents],
  statusList: SpanStatus[] = [unsetStatus, unsetStatus],
  errorMessageList: string[] = ['', '']
) {
  if (!oracledb.thin) {
    attributesList = attributesList.slice(attributesList.length - 1);
    spanNamesList = spanNamesList.slice(spanNamesList.length - 1);
    statusList = statusList.slice(statusList.length - 1);
    errorMessageList = errorMessageList.slice(errorMessageList.length - 1);
  }
  const spans = memoryExporter.getFinishedSpans();
  let spanLength = 1;
  const lastSpan = spans[spans.length - 1];
  if (oracledb.thin) {
    spanLength = attributesList.length;
  }
  assert.strictEqual(spans.length, spanLength);

  // verify roundtrip child spans or public API span if no roundtrip
  // span is generated (in case of thick).
  checkRoundTripSpans(
    spans,
    lastSpan,
    attributesList,
    eventList,
    statusList,
    spanNamesList,
    errorMessageList
  );

  //verify span generated from public API.
  assert.deepStrictEqual(lastSpan.name, spanNamesList[spanLength - 1]);
  verifySpanData(
    lastSpan as unknown as ReadableSpan,
    parentSpan as unknown as ReadableSpan,
    attributesList[spanLength - 1],
    eventList[spanLength - 1],
    statusList[spanLength - 1],
    errorMessageList[spanLength - 1]
  );
  //}
}

const sqlDropTable = function (tableName: string) {
  return `
    DECLARE
        e_table_missing EXCEPTION;
        PRAGMA EXCEPTION_INIT(e_table_missing, -942);
    BEGIN
        EXECUTE IMMEDIATE ('DROP TABLE ${tableName} PURGE');
    EXCEPTION
        WHEN e_table_missing THEN NULL;
    END;
  `;
};

const sqlCreateTable = async function (
  conn: oracledb.Connection,
  tableName: string,
  sql: string
) {
  const dropSql = sqlDropTable(tableName);
  const plsql = `
    BEGIN
        ${dropSql}
        EXECUTE IMMEDIATE ('${sql} NOCOMPRESS');
    END;
  `;
  await conn.execute(plsql);
};

describe('oracledb', () => {
  let connection: oracledb.Connection;

  const testOracleDB = process.env.RUN_ORACLEDB_TESTS; // For CI: assumes local oracledb is already available
  const testOracleDBLocally = process.env.RUN_ORACLEDB_TESTS_LOCAL; // For local: spins up local oracledb via docker
  const shouldTest = testOracleDB || testOracleDBLocally; // Skips these tests if false (default)
  const sql = 'select 1 from dual';
  const sqlWithBinds = 'select :1 from dual';
  const sqlWithBindsByName = 'select :name from dual';
  const sqlWithOutBinds = 'begin :n := 1001; end;';
  const outBinds = { n: { dir: oracledb.BIND_OUT } };
  const binds = ['0'];
  const bindsByName = {
    name: { val: '0', type: oracledb.STRING, dir: oracledb.BIND_IN },
  };
  const tableName = 'oracledb_ot_execute_test';
  const sqlCreate = `create table ${tableName} (id NUMBER, val VARCHAR2(100), clobval CLOB)`;

  async function doSetup() {
    const extendedConn: any = connection;

    if (oracledb.thin) {
      connAttributes = { ...DEFAULT_ATTRIBUTES };
    } else {
      connAttributes = { ...DEFAULT_ATTRIBUTES_THICK };
    }
    if (connection.instanceName) {
      connAttributes[AttributeNames.ORACLE_INSTANCE] = connection.instanceName;
    }
    if (connection.serviceName) {
      connAttributes[ATTR_DB_NAMESPACE] = connection.serviceName;
    }
    if (oracledb.thin && extendedConn.hostName) {
      connAttributes[ATTR_SERVER_ADDRESS] = extendedConn.hostName;
    }
    if (oracledb.thin && (extendedConn.port as number)) {
      connAttributes[ATTR_SERVER_PORT] = extendedConn.port;
    }
    if (oracledb.thin && extendedConn.protocol) {
      connAttributes[SEMATTRS_NET_TRANSPORT] = extendedConn.protocol;
    }
    if (connection.dbName) {
      connAttributes[AttributeNames.ORACLE_PDBNAME] = oracledb.thin
        ? connection.dbName.toUpperCase()
        : connection.dbName;
    }
    poolAttributes = { ...connAttributes, ...POOL_ATTRIBUTES };

    executeAttributes = {
      ...connAttributes,
      [ATTR_DB_OPERATION_NAME]: 'SELECT',
    };
    if (oracledb.thin) {
      // internal roundtrips don't have bind values.
      executeAttributesInternalRoundTripBinds = {
        ...connAttributes,
        [ATTR_DB_OPERATION_NAME]: 'SELECT',
        [SEMATTRS_DB_STATEMENT]: sqlWithBinds,
      };
    }
    attributesWithSensitiveDataNoBinds = {
      ...connAttributes,
      [ATTR_DB_OPERATION_NAME]: 'SELECT',
      [SEMATTRS_DB_STATEMENT]: sql,
    };
    attributesWithSensitiveDataBinds = {
      ...connAttributes,
      [ATTR_DB_OPERATION_NAME]: 'SELECT',
      [SEMATTRS_DB_STATEMENT]: sqlWithBinds,
      [AttributeNames.ORACLE_BIND_VALUES]: binds,
    };
    await sqlCreateTable(connection, tableName, sqlCreate);
  }

  before(async function () {
    const skip = () => {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    };

    if (!shouldTest) {
      skip();
    }

    if (testOracleDBLocally) {
      testUtils.startDocker('oracledb');

      // increase test time
      this.timeout(50000);

      // check if docker container is up
      let retries = 6;
      while (retries-- > 0) {
        try {
          connection = await oracledb.getConnection(CONFIG);
          break;
        } catch (err) {
          console.log(' retry count %d failed waiting for DB', retries);
          await new Promise(r => setTimeout(r, 10000));
        }
      }
      if (retries < 0) {
        throw new Error(' docker setup Failed');
      }
    } else {
      connection = await oracledb.getConnection(CONFIG);
    }
    await doSetup();
    updateAttrSpanList(connection);
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();
  });

  after(async function () {
    if (connection) {
      await connection.execute(sqlDropTable(tableName));
      await connection.close();
    }
    instrumentation.disable();
    if (testOracleDBLocally) {
      this.timeout(5000);
      testUtils.cleanUpDocker('oracledb');
    }
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(async () => {
    memoryExporter.reset();
    context.disable();
    instrumentation.enable();
    instrumentation.setConfig({
      enhancedDatabaseReporting: false,
      dbStatementDump: false,
    });
  });

  it('should return an instrumentation', () => {
    assert.ok(instrumentation instanceof OracleInstrumentation);
  });

  it('should have correct name', () => {
    assert.strictEqual(
      instrumentation.instrumentationName,
      '@opentelemetry/instrumentation-oracledb'
    );
  });

  describe('#oracledb.pool operations', () => {
    let pool: oracledb.Pool;
    let connection: oracledb.Connection;

    afterEach(async () => {
      if (pool) {
        if (connection && connection.isHealthy()) {
          await connection.close();
        }
        await pool.close(0);
      }
    });

    async function waitForCreatePool(pool: oracledb.Pool) {
      if (!oracledb.thin) {
        // thick mode will create all min conns in sync fashion.
        return true;
      }
      let retryCount = 5; // counter to wait for new connections to appear
      while (pool.connectionsOpen !== POOL_CONFIG.poolMin) {
        // Let background thread complete poolMin conns.
        await new Promise(r => setTimeout(r, 100));
        retryCount -= 1;
        if (retryCount === 0) {
          // skipping the test on slow networks
          return false;
        }
      }
      return true;
    }

    function verifyPoolGetConnHitAttrs(span: Span, poolAlias = false) {
      // With poolAlias, It causes oracledb.getConnection to call pool.getConnection
      // on pool created from pool alias.
      const numSpans = poolAlias ? 2 : 1;
      let parentSpan: ReadableSpan = span as unknown as ReadableSpan;
      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, numSpans);

      // check oracledb.getConnection
      if (poolAlias) {
        parentSpan = spans[1];
        assert.deepStrictEqual(parentSpan.name, SpanNames.CONNECT);
        verifySpanData(
          parentSpan,
          span as unknown as ReadableSpan,
          poolAttributes
        );
      }

      // check pool.getConnection
      assert.deepStrictEqual(spans[0].name, SpanNames.POOL_CONNECT);
      verifySpanData(spans[0], parentSpan, poolAttributes);
    }

    // Checks the span attributes for all round trips made for poolMin connections
    // It doesn't verify attributes of createPool public API
    // which is done before calling this.
    function checkPoolMinConnectSpans() {
      let spans = memoryExporter.getFinishedSpans();
      const createPoolSpan = spans[0];
      spans = spans.slice(1);
      const spanLength = spans.length;
      const numRoundTripSpans = spanLength;
      const attrList = poolConnAttrList;
      attrList.pop(); // remove createPool Attributes
      const attrListTotal = [...attrList];
      const poolSpanNameList = [...spanNamesList];
      poolSpanNameList.pop(); // remove spanName of createPool
      const spanNamesListTotal = [...poolSpanNameList];
      const eventList = new Array(numRoundTripSpans);
      const statusList = new Array(numRoundTripSpans);
      eventList.fill(defaultEvents, 0, numRoundTripSpans);
      statusList.fill(unsetStatus, 0, numRoundTripSpans);
      for (let index = 0; index < POOL_CONFIG.poolMin - 1; index++) {
        attrListTotal.push(...poolConnAttrList);
        spanNamesListTotal.push(...poolSpanNameList);
      }

      checkRoundTripSpans(
        spans,
        createPoolSpan,
        attrListTotal,
        eventList,
        statusList,
        spanNamesListTotal
      );
    }

    it('should intercept oracledb.createPool', async function () {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        pool = await oracledb.createPool(POOL_CONFIG);
        if (!(await waitForCreatePool(pool))) {
          this.skip();
        }

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, poolMinSpanCount);
        const poolSpan = spans[0];

        // check createPool span as it appears first and
        // the round trip spans as part of poolMin will be
        // appearing later.
        assert.deepStrictEqual(poolSpan.name, SpanNames.POOL_CREATE);
        verifySpanData(
          poolSpan as unknown as ReadableSpan,
          span as unknown as ReadableSpan,
          POOL_ATTRIBUTES
        );

        // check if poolMin connection roundtrip spans are created in the
        // background async task
        checkPoolMinConnectSpans();
        testUtils.assertPropagation(poolSpan, span);
        span.end();
      });
    });

    it('should intercept pool.getConnection', async function () {
      // create a pool with no tracing
      instrumentation.disable();
      pool = await oracledb.createPool(POOL_CONFIG);
      if (!(await waitForCreatePool(pool))) {
        this.skip();
      }

      instrumentation.enable();
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        connection = await pool.getConnection();
        verifyPoolGetConnHitAttrs(span);
        span.end();
      });
    });

    it('should intercept pool.getConnection with default pool alias', async function () {
      // create a pool with no tracing
      instrumentation.disable();
      pool = await oracledb.createPool(POOL_CONFIG);
      if (!(await waitForCreatePool(pool))) {
        this.skip();
      }

      instrumentation.enable();
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        connection = await oracledb.getConnection();
        verifyPoolGetConnHitAttrs(span, true);
        span.end();
      });
    });

    it('should intercept pool.getConnection callback', async function () {
      const span = tracer.startSpan('test span');
      instrumentation.disable();
      pool = await oracledb.createPool(POOL_CONFIG);
      if (!(await waitForCreatePool(pool))) {
        // skipping the test.
        this.skip();
      }
      instrumentation.enable();
      await context.with(trace.setSpan(context.active(), span), async () => {
        await new Promise<void>(resolve => {
          pool.getConnection((err, conn) => {
            assert.strictEqual(err, null);
            connection = conn;
            verifyPoolGetConnHitAttrs(span);
            resolve();
          });
        });
        span.end();
      });
    });

    it('should intercept pool.getConnection failure', async function () {
      const span = tracer.startSpan('test span');
      const getPoolConnFailedAttrs: Record<string, string | number> = {
        ...POOL_ATTRIBUTES,
      };
      const wrongConfig = Object.assign({}, POOL_CONFIG);
      wrongConfig.password = 'null';
      wrongConfig.poolMin = getPoolConnFailedAttrs[
        AttributeNames.ORACLE_POOL_MIN
      ] = 1;
      instrumentation.disable();
      if (!oracledb.thin) {
        wrongConfig.poolMin = 0;
        getPoolConnFailedAttrs[AttributeNames.ORACLE_POOL_MIN] = 0;
      }
      pool = await oracledb.createPool(wrongConfig);

      // wait for attempting to create a poolMin connection
      await waitForCreatePool(pool);
      instrumentation.enable();
      await context.with(trace.setSpan(context.active(), span), async () => {
        await assert.rejects(
          async () => await pool.getConnection(),
          /ORA-01017:/
        );
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        assert.deepStrictEqual(spans[0].name, SpanNames.POOL_CONNECT);
        verifySpanData(
          spans[0],
          span as unknown as ReadableSpan,
          getPoolConnFailedAttrs,
          defaultEvents,
          errorStatus,
          'ORA-01017'
        );
        span.end();
      });
    });

    it('should intercept pool.getConnection callback failure', async function () {
      const span = tracer.startSpan('test span');
      const getPoolConnFailedAttrs: Record<string, string | number> = {
        ...POOL_ATTRIBUTES,
      };
      const wrongConfig = Object.assign({}, POOL_CONFIG);
      wrongConfig.password = 'null';
      wrongConfig.password = 'null';
      wrongConfig.poolMin = getPoolConnFailedAttrs[
        AttributeNames.ORACLE_POOL_MIN
      ] = 1;
      instrumentation.disable();
      if (!oracledb.thin) {
        wrongConfig.poolMin = getPoolConnFailedAttrs[
          AttributeNames.ORACLE_POOL_MIN
        ] = 0;
      }
      pool = await oracledb.createPool(wrongConfig);

      // wait for attempting to create a poolMin connection
      await waitForCreatePool(pool);
      instrumentation.enable();
      await context.with(trace.setSpan(context.active(), span), async () => {
        await new Promise<void>(resolve => {
          pool.getConnection((err, conn) => {
            connection = conn;
            assert(err.message?.includes('ORA-01017'));
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);
            assert.deepStrictEqual(spans[0].name, SpanNames.POOL_CONNECT);
            verifySpanData(
              spans[0],
              span as unknown as ReadableSpan,
              getPoolConnFailedAttrs,
              defaultEvents,
              errorStatus,
              'ORA-01017'
            );
            resolve();
          });
        });
        span.end();
      });
    });
  });

  describe('#oracledb.getConnection(...)', () => {
    let connection: oracledb.Connection;

    afterEach(async () => {
      if (connection && connection.isHealthy()) {
        await connection.close();
      }
    });

    it('should intercept getConnection', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        connection = await oracledb.getConnection(CONFIG);
        verifySpans(span, connAttrList, spanNamesList);
        span.end();
      });
    });

    it('should intercept connection.close', async () => {
      instrumentation.disable();
      const conn = await oracledb.getConnection(CONFIG);
      instrumentation.enable();
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        // connection.close generates a single internal round trip and a
        // round trip for connection.close.
        // We construct attrList with span attributes for 2 roundtrips.
        const attrList: Record<string, string | number>[] = [];
        if (oracledb.thin) {
          attrList.push(connAttrList[connAttrList.length - 1]);
        }
        attrList.push(connAttrList[connAttrList.length - 1]);

        await conn.close();
        const spanNamesList = [];
        spanNamesList.push(SpanNames.LOGOFF_MSG);
        spanNamesList.push(SpanNames.CONNECT_CLOSE);
        verifySpans(span, attrList, spanNamesList);
        span.end();
      });
    });

    it('should intercept getConnection callback', done => {
      const span = tracer.startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        oracledb.getConnection(CONFIG, (err, conn) => {
          connection = conn;
          assert.strictEqual(err, null);
          verifySpans(span, connAttrList, spanNamesList);

          // Verify spans inside callback are child of application span
          const callBackSpan = tracer.startSpan('test callback span');
          callBackSpan.end();
          testUtils.assertPropagation(
            callBackSpan as unknown as ReadableSpan,
            span as unknown as Span
          );

          span.end();
          done();
        });
      });
    });

    it('should intercept getConnection failure', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const wrongConfig = Object.assign({}, CONFIG);
        wrongConfig.password = 'null';
        await assert.rejects(
          async () => await oracledb.getConnection(wrongConfig),
          /ORA-01017:/
        );
        const statusList = new Array(connAttrList.length);
        statusList.fill(unsetStatus);
        statusList[connAttrList.length - 1] = errorStatus;
        const errorMessageList = new Array(connAttrList.length);
        errorMessageList.fill('');
        errorMessageList[connAttrList.length - 1] = 'ORA-01017';
        verifySpans(
          span,
          failedConnAttrList,
          spanNamesList,
          new Array(connAttrList.length).fill(defaultEvents),
          statusList,
          errorMessageList
        );
        span.end();
      });
    });

    it('should intercept getConnection callback failure', done => {
      const span = tracer.startSpan('test span');
      const wrongConfig = Object.assign({}, CONFIG);
      wrongConfig.password = 'null';
      context.with(trace.setSpan(context.active(), span), () => {
        oracledb.getConnection(wrongConfig, (err, conn) => {
          connection = conn;
          assert(err.message?.includes('ORA-01017'));
          const statusList = new Array(connAttrList.length);
          statusList.fill(unsetStatus);
          statusList[connAttrList.length - 1] = errorStatus;
          const errorMessageList = new Array(connAttrList.length);
          errorMessageList.fill('');
          errorMessageList[connAttrList.length - 1] = 'ORA-01017';
          verifySpans(
            span,
            failedConnAttrList,
            spanNamesList,
            new Array(connAttrList.length).fill(defaultEvents),
            statusList,
            errorMessageList
          );

          // Verify spans inside callback are child of app span
          const callBackSpan = tracer.startSpan('test callback span');
          callBackSpan.end();
          testUtils.assertPropagation(
            callBackSpan as unknown as ReadableSpan,
            span as unknown as Span
          );

          span.end();
          done();
        });
      });
    });
  });

  describe('#connection.execute(...)', () => {
    it('should not return a promise if callback is provided', done => {
      const res = connection.execute(sql, (err, res) => {
        assert.strictEqual(err, null);
        done();
      });
      assert.strictEqual(res, undefined, 'No promise is returned');
    });

    it('should return a promise if callback is not provided', done => {
      const resPromise = connection.execute(sql);
      resPromise
        .then(res => {
          assert.ok(res);
          done();
        })
        .catch((err: Error) => {
          assert.ok(false, err.message);
        });
    });

    it('should intercept connection.execute(sql) ', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const res = await connection.execute(sql);
        try {
          assert.ok(res);
          verifySpans(span);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
        span.end();
      });
      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, numExecSpans + 1);
    });

    it('should intercept connection.execute(sql) without parent span', async () => {
      const res = await connection.execute(sql);
      try {
        assert.ok(res);
        verifySpans(null);
      } catch (e: any) {
        assert.ok(false, e.message);
      }
      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, numExecSpans);
    });

    it('should intercept connection.execute(sql, callback)', done => {
      const span = tracer.startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        const res = connection.execute(sql, (err, res) => {
          assert.strictEqual(err, null);
          assert.ok(res);
          verifySpans(span);
          span.end();

          // check callback active context is parent span.
          const parentContext = context.active();
          assert.strictEqual(context.active(), parentContext);
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, numExecSpans + 1);
          done();
        });
        assert.strictEqual(res, undefined, 'No promise is returned');
      });
    });

    it('should intercept connection.execute(sql, callback) with out parent span', done => {
      const res = connection.execute(sql, (err, res) => {
        assert.strictEqual(err, null);
        assert.ok(res);
        verifySpans(null);
        done();
      });
      assert.strictEqual(res, undefined, 'No promise is returned');
    });

    it('should intercept connection.execute(sql, values)', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        instrumentation.setConfig({ enhancedDatabaseReporting: true });
        const resPromise = await connection.execute(sqlWithBinds, binds);
        try {
          assert.ok(resPromise);
          verifySpans(span, [
            executeAttributesInternalRoundTripBinds,
            attributesWithSensitiveDataBinds,
          ]);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
        span.end();
      });
    });

    it('should intercept connection.execute(sql, values) bind-by-name', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        instrumentation.setConfig({ enhancedDatabaseReporting: true });
        const resPromise = await connection.execute(
          sqlWithBindsByName,
          bindsByName
        );

        // update sql stmt. bindByName values are not dumped.
        const attrs = { ...attributesWithSensitiveDataNoBinds };
        attrs[SEMATTRS_DB_STATEMENT] = sqlWithBindsByName;

        try {
          assert.ok(resPromise);
          verifySpans(span, [attrs, attrs]);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
        span.end();
      });
    });

    it('should intercept connection.execute(sql, values) with out-binds', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        instrumentation.setConfig({ enhancedDatabaseReporting: true });
        const options = {};
        const resPromise = await connection.execute(
          sqlWithOutBinds,
          outBinds,
          options
        );

        // update sql stmt, operation.
        const attrs = { ...attributesWithSensitiveDataNoBinds };
        attrs[ATTR_DB_OPERATION_NAME] = 'BEGIN';
        attrs[SEMATTRS_DB_STATEMENT] = sqlWithOutBinds;

        try {
          assert.ok(resPromise);
          verifySpans(span, [attrs, attrs]);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
        span.end();
      });
    });

    it('should intercept connection.execute(sql, values) with default enhancedDatabaseReporting value', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        instrumentation.setConfig();
        const resPromise = await connection.execute(sqlWithBinds, binds);
        try {
          assert.ok(resPromise);
          verifySpans(span);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
        span.end();
      });
    });

    it('should intercept connection.execute with bindbyPosition and enhancedDatabaseReporting = true', async () => {
      const span = tracer.startSpan('test span');
      const buf = Buffer.from('hello');
      instrumentation.disable();
      const lob = await connection.createLob(oracledb.CLOB);

      // Get an pre-defined object type SYS.ODCIVARCHAR2LIST (a collection of VARCHAR2)
      const ODCIVarchar2List = await connection.getDbObjectClass(
        'SYS.ODCIVARCHAR2LIST'
      );
      const varchar2List = new ODCIVarchar2List([
        'TEST OBJECT',
        'DATA',
        'from',
        'node-oracledb-instrument',
      ]);
      instrumentation.enable();
      const date = new Date(1969, 11, 31, 0, 0, 0, 0);
      const localDateString = `"${date.toISOString()}"`;
      const sql =
        'select to_clob(:1), :2, TO_NUMBER(:3), to_char(:4), :5, :6, :7, :8, :9, :10 from dual';
      await context.with(trace.setSpan(context.active(), span), async () => {
        instrumentation.setConfig({ enhancedDatabaseReporting: true });
        const binds = [
          'Hello é World',
          lob,
          '43',
          43,
          date,
          buf,
          varchar2List,
          null,
          undefined,
          true,
        ];
        const bindsM = [
          'Hello é World',
          '[object Object]',
          '43',
          '43',
          localDateString,
          'hello',
          '["TEST OBJECT","DATA","from","node-oracledb-instrument"]',
          'null',
          'null',
          'true',
        ];
        const resPromise = await connection.execute(sql, binds);
        try {
          const attributesWithSensitiveData: Record<
            string,
            string | number | any[]
          > = {
            ...connAttributes,
            [ATTR_DB_OPERATION_NAME]: 'SELECT',
            [SEMATTRS_DB_STATEMENT]: sql,
            [AttributeNames.ORACLE_BIND_VALUES]: bindsM,
          };
          const attrs = { ...attributesWithSensitiveDataNoBinds };
          attrs[SEMATTRS_DB_STATEMENT] = sql;

          assert.ok(resPromise);
          // LOBs will cause an additional round trip for define types...
          verifySpans(
            span,
            [attrs, attrs, attributesWithSensitiveData],
            [SpanNames.EXECUTE_MSG, SpanNames.EXECUTE_MSG, SpanNames.EXECUTE]
          );
        } catch (e: any) {
          assert.ok(false, e.message);
        }
        span.end();
        lob.destroy();
      });
    });

    it('should intercept connection.execute(sql, values) with enhancedDatabaseReporting = false', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        instrumentation.setConfig({ enhancedDatabaseReporting: false });
        const resPromise = await connection.execute(sqlWithBinds, binds);
        try {
          assert.ok(resPromise);
          verifySpans(span);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
        span.end();
      });
    });

    it('should intercept connection.execute(sql, values) with dbStatementDump = true', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        instrumentation.setConfig({ dbStatementDump: true });
        const resPromise = await connection.execute(sqlWithBinds, binds);
        try {
          assert.ok(resPromise);
          const attrs = { ...executeAttributes };
          attrs[SEMATTRS_DB_STATEMENT] = sqlWithBinds;
          verifySpans(span, [attrs, attrs]);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
        span.end();
      });
    });

    it('should intercept connection.execute(sql, values) with dbStatementDump and enhancedDatabaseReporting as true', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        // enhancedDatabaseReporting overrides dbStatementDump config
        instrumentation.setConfig({
          enhancedDatabaseReporting: true,
          dbStatementDump: true,
        });
        const resPromise = await connection.execute(sqlWithBinds, binds);
        try {
          assert.ok(resPromise);
          verifySpans(span, [
            executeAttributesInternalRoundTripBinds,
            attributesWithSensitiveDataBinds,
          ]);
        } catch (e: any) {
          assert.ok(false, e.message);
        }
        span.end();
      });
    });

    it('should intercept connection.execute(sql, values, callback)', done => {
      const span = tracer.startSpan('test span');
      context.with(trace.setSpan(context.active(), span), () => {
        instrumentation.setConfig({ enhancedDatabaseReporting: true });
        const res = connection.execute(sqlWithBinds, binds, (err, res) => {
          assert.strictEqual(err, null);
          assert.ok(res);
          verifySpans(span, [
            executeAttributesInternalRoundTripBinds,
            attributesWithSensitiveDataBinds,
          ]);
          span.end();
          done();
        });
        assert.strictEqual(res, undefined, 'No promise is returned');
      });
    });

    it('should intercept connection.executeMany(sql, binds)', async () => {
      const span = tracer.startSpan('test span');
      const binds = [
        { a: 1, b: 'Test 1 (One)' },
        { a: 2, b: 'Test 2 (Two)' },
        { a: 3, b: 'Test 3 (Three)' },
        { a: 4 },
        { a: 5, b: 'Test 5 (Five)' },
      ];
      const sqlInsert = `INSERT INTO ${tableName} VALUES (:a, :b, 'clob')`;

      await context.with(trace.setSpan(context.active(), span), async () => {
        const res = await connection.executeMany<Array<string>>(
          sqlInsert,
          binds
        );
        try {
          assert.ok(res);
          verifySpans(
            span,
            [connAttributes, connAttributes],
            [SpanNames.EXECUTE_MSG, SpanNames.EXECUTE_MANY]
          );
        } catch (e: any) {
          assert.ok(false, e.message);
        } finally {
          await connection.commit();
          span.end();
        }
      });
    });

    it('should intercept connection.executeMany(sql, binds) with out parent span', async () => {
      instrumentation.enable();
      const binds = [
        { a: 1, b: 'Test 1 (One)' },
        { a: 2, b: 'Test 2 (Two)' },
        { a: 3, b: 'Test 3 (Three)' },
        { a: 4 },
        { a: 5, b: 'Test 5 (Five)' },
      ];
      const sqlInsert = `INSERT INTO ${tableName} VALUES (:a, :b, 'clob')`;
      const res = await connection.executeMany<Array<string>>(sqlInsert, binds);
      try {
        assert.ok(res);
        verifySpans(
          null,
          [connAttributes, connAttributes],
          [SpanNames.EXECUTE_MSG, SpanNames.EXECUTE_MANY]
        );
      } catch (e: any) {
        assert.ok(false, e.message);
      } finally {
        await connection.commit();
      }
    });

    it('Verify error message for negative tests', async () => {
      let errorMessage = 'NJS-009';
      // The error message remains same with instrumented module.
      await assert.rejects(
        // type assert 'connection' as 'any' preventing compilation check.
        async () => await (connection as any).execute(),
        /NJS-009/
      );
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      verifySpanData(
        spans[0],
        null,
        connAttributes,
        defaultEvents,
        errorStatus,
        errorMessage
      );
      memoryExporter.reset();

      errorMessage = 'NJS-005';
      await assert.rejects(
        async () => await (connection as any).execute(null),
        /NJS-005:/
      );
      spans = memoryExporter.getFinishedSpans();
      verifySpanData(
        spans[0],
        null,
        connAttributes,
        defaultEvents,
        errorStatus,
        errorMessage
      );
      memoryExporter.reset();

      await assert.rejects(
        async () => await (connection as any).execute(undefined),
        /NJS-005:/
      );
      spans = memoryExporter.getFinishedSpans();
      verifySpanData(
        spans[0],
        null,
        connAttributes,
        defaultEvents,
        errorStatus,
        errorMessage
      );
      memoryExporter.reset();

      errorMessage = 'ORA-00942';
      const wrongSql = 'select 1 from nonExistTable';
      const executeFailedAttributes = { ...executeAttributes };
      //executeFailedAttributes[SEMATTRS_DB_STATEMENT] = wrongSql;
      await assert.rejects(
        async () => await (connection as any).execute(wrongSql),
        /ORA-00942:/
      );
      const attrsList = [executeFailedAttributes, executeFailedAttributes];
      verifySpans(
        null,
        attrsList,
        [SpanNames.EXECUTE_MSG, SpanNames.EXECUTE],
        [defaultEvents, defaultEvents],
        [unsetStatus, errorStatus],
        ['', errorMessage]
      );
      memoryExporter.reset();
    });

    it('should not generate traces when requireParentSpan=true is specified', async () => {
      instrumentation.setConfig({
        requireParentSpan: true,
      });
      memoryExporter.reset();
      await connection.execute(sql);
      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);
      instrumentation.setConfig({
        requireParentSpan: false,
      });
      memoryExporter.reset();
    });
  });

  describe('#LOB operations (...)', () => {
    let lob: oracledb.Lob;

    afterEach(function () {
      if (lob) {
        lob.destroy();
      }
    });

    it('should intercept create Templob ', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        lob = await connection.createLob(oracledb.CLOB);
        try {
          assert.ok(lob);
          verifySpans(
            span,
            [connAttributes, connAttributes, connAttributes],
            [SpanNames.LOB_MESSAGE, SpanNames.LOB_MESSAGE, SpanNames.CREATE_LOB]
          );
        } catch (e: any) {
          assert.ok(false, e.message);
        }
        span.end();
      });
    });

    it('should intercept lob getData ', async () => {
      const span = tracer.startSpan('test span');
      await context.with(trace.setSpan(context.active(), span), async () => {
        const sqlInsert = `INSERT INTO ${tableName} VALUES (:a, :b, 'clob')`;
        instrumentation.disable();
        let result = await connection.execute(sqlInsert, [1, 'test']);
        result = await connection.execute(` select clobval from ${tableName}`);
        try {
          assert.ok(result.rows);
          assert.ok(Array.isArray(result.rows[0]));
          const lob: oracledb.Lob = result.rows[0][0] as oracledb.Lob;
          instrumentation.enable();
          await lob.getData();
          verifySpans(
            span,
            [connAttributes, connAttributes],
            [SpanNames.LOB_MESSAGE, SpanNames.LOB_GETDATA]
          );
        } catch (e: any) {
          assert.ok(false, e.message);
        }
        span.end();
      });
    });
  });

  describe('when specifying a requestHook configuration', () => {
    const key1 = 'CONNECT_DATA';
    const key2 = 'ARGS_DATA';
    const argVal = { 0: sql };

    describe('AND valid requestHook', () => {
      beforeEach(async () => {
        instrumentation.setConfig({
          enhancedDatabaseReporting: true,
          requestHook: (span, requestInfo) => {
            if (requestInfo) {
              span.setAttribute(key1, JSON.stringify(requestInfo.connection));
              span.setAttribute(key2, JSON.stringify(requestInfo.inputArgs));
            }
          },
        });
      });

      it('should attach request hook data to resulting spans for query returning a Promise', async () => {
        const span = tracer.startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          const res = await connection.execute(sql);
          try {
            assert.ok(res);
            const extendedConn: any = connection;
            verifySpans(span, [
              attributesWithSensitiveDataNoBinds,
              {
                ...attributesWithSensitiveDataNoBinds,
                [key1]: JSON.stringify(extendedConn.connectTraceConfig),
                [key2]: JSON.stringify(argVal),
              },
            ]);
          } catch (e: any) {
            assert.ok(false, e.message);
          }
          span.end();
        });
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, numExecSpans + 1);
      });

      it('should attach request hook data to resulting spans for query with callback)', done => {
        const span = tracer.startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const res = connection.execute(sql, (err, res) => {
            assert.strictEqual(err, null);
            assert.ok(res);
            const extendedConn: any = connection;
            verifySpans(span, [
              attributesWithSensitiveDataNoBinds,
              {
                ...attributesWithSensitiveDataNoBinds,
                [key1]: JSON.stringify(extendedConn.connectTraceConfig),
                [key2]: JSON.stringify(argVal),
              },
            ]);
            span.end();
            done();
          });
          assert.strictEqual(res, undefined, 'No promise is returned');
        });
      });
    });

    describe('AND invalid requestHook', () => {
      beforeEach(async () => {
        instrumentation.setConfig({
          enhancedDatabaseReporting: true,
          requestHook: (span, requestInfo) => {
            throw 'Failed!';
          },
        });
      });

      it('should not do any harm when throwing an exception', done => {
        const span = tracer.startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const res = connection.execute(sql, (err, res) => {
            assert.strictEqual(err, null);
            assert.ok(res);
            verifySpans(span, [
              attributesWithSensitiveDataNoBinds,
              attributesWithSensitiveDataNoBinds,
            ]);
            span.end();
            done();
          });
          assert.strictEqual(res, undefined, 'No promise is returned');
        });
      });
    });
  });

  describe('when specifying a responseHook configuration', () => {
    const key1 = 'QUERY_RESULT';

    describe('AND valid responseHook', () => {
      beforeEach(async () => {
        instrumentation.setConfig({
          enhancedDatabaseReporting: true,
          responseHook: (span, responseInfo) => {
            if (responseInfo) {
              span.setAttribute(key1, JSON.stringify(responseInfo.data));
            }
          },
        });
      });

      it('should attach response hook data to resulting spans for query returning a Promise', async () => {
        const span = tracer.startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          const res = await connection.execute(sql);
          try {
            assert.ok(res);
            verifySpans(span, [
              attributesWithSensitiveDataNoBinds,
              {
                ...attributesWithSensitiveDataNoBinds,
                [key1]: JSON.stringify(res),
              },
            ]);
          } catch (e: any) {
            assert.ok(false, e.message);
          }
          span.end();
        });
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, numExecSpans + 1);
      });

      it('should attach response hook data to resulting spans for query with callback)', done => {
        const span = tracer.startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const res = connection.execute(sql, (err, res) => {
            assert.strictEqual(err, null);
            assert.ok(res);
            verifySpans(span, [
              attributesWithSensitiveDataNoBinds,
              {
                ...attributesWithSensitiveDataNoBinds,
                [key1]: JSON.stringify(res),
              },
            ]);
            span.end();
            done();
          });
          assert.strictEqual(res, undefined, 'No promise is returned');
        });
      });
    });

    describe('AND invalid responseHook', () => {
      beforeEach(async () => {
        instrumentation.setConfig({
          enhancedDatabaseReporting: true,
          responseHook: (span, responseInfo) => {
            throw 'Failure!';
          },
        });
      });

      it('should not do any harm when throwing an exception', done => {
        const span = tracer.startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const res = connection.execute(sql, (err, res) => {
            assert.strictEqual(err, null);
            assert.ok(res);
            verifySpans(span, [
              attributesWithSensitiveDataNoBinds,
              attributesWithSensitiveDataNoBinds,
            ]);
            span.end();
            done();
          });
          assert.strictEqual(res, undefined, 'No promise is returned');
        });
      });
    });
  });
});
