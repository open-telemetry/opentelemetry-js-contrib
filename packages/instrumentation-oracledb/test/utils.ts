/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2025, 2026, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

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
  while (pool.connectionsOpen < pool.poolMin) {
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
