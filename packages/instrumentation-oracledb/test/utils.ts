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
import * as oracledb from 'oracledb';

export const CONFIG = {
  user: process.env.ORACLE_USER,
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECTSTRING,
};
export const POOL_CONFIG = {
  ...CONFIG,
  poolMin: 2,
  poolMax: 10,
  poolIncrement: 1,
  poolTimeout: 5,
  stmtCacheSize: 23,
};

export async function waitForCreatePool(pool: oracledb.Pool, time: number) {
  let retryCount = 5; // counter to wait for new connections to appear
  while (pool.connectionsOpen !== pool.poolMin) {
    // Let background thread complete poolMin conns.
    await new Promise(r => setTimeout(r, time));
    retryCount -= 1;
    if (retryCount === 0) {
      console.log('skipping the test on slow networks');
      return false;
    }
  }
  return true;
}

export function sqlDropTable(tableName: string) {
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
}

export async function sqlCreateTable(
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
}

export const metricsDescription = [{
  description:
    'The number of connections that are currently in state described by the state attribute.',
  unit: '{connection}',
}, {
  description:
    'The number of current pending requests for an open connection.',
  unit: '{request}',
}, {
  description:
    'The number of connection timeouts that have occurred trying to obtain a connection from the pool.',
  unit: '{timeout}',
}, {
  description: 'Duration of database client operations.',
  unit: 's',
  valueType: 1,
  advice: {
    explicitBucketBoundaries: [
      0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10,
    ],
  },
}]
