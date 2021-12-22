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
import type { Connection, Request, TYPES, ConnectionConfig } from 'tedious';

export type tedious = {
  Connection: typeof Connection;
  Request: typeof Request;
  TYPES: typeof TYPES;
  ConnectionConfig: ConnectionConfig;
};

export const createConnection = (
  tedious: tedious,
  config: ConnectionConfig
): Promise<Connection> => {
  return new Promise((resolve, reject) => {
    const connection = new tedious.Connection(config);

    connection.on('connect', err => {
      if (err) {
        return reject(err);
      }
      return resolve(connection);
    });

    // Initialize the connection.
    connection.connect();
  });
};
export const closeConnection = (connection: Connection): Promise<boolean> => {
  assert(connection);
  assert(connection.once);
  return new Promise((resolve, reject) => {
    connection.once('end', err => {
      if (err) {
        return reject(err);
      }
      return resolve(true);
    });
    connection.close();
  });
};

type Method = keyof Connection & ('execSql' | 'execSqlBatch' | 'prepare');

export function query(
  tedious: tedious,
  connection: Connection,
  params: string,
  method: Method = 'execSql'
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const result: any[] = [];
    const request = new tedious.Request(params, (err, rowCount, rows) => {
      if (err) {
        return reject(err);
      } else {
        resolve(result);
      }
    });

    // request.on('returnValue', console.log.bind(console, 'returnValue:'));
    // request.on('error', console.log.bind(console, 'error:'));
    // request.on('row', console.log.bind(console, 'row:'));
    // request.on('done', console.log.bind(console, 'done:'));
    // request.on('doneInProc', console.log.bind(console, 'doneInProc:'));
    // request.on('doneProc', console.log.bind(console, 'doneProc:'));
    // request.on('prepared', console.log.bind(console, 'prepared:'));
    // request.on('columnMetadata', console.log.bind(console, 'columnMetadata:'));

    request.on('row', (rows: any[]) => {
      result.push(...rows.map(r => r.value));
    });

    connection[method](request);
  });
}

export const storedProcedure = '[dbo].[test_proced]';
export function createStoredProcedure(
  tedious: tedious,
  connection: Connection
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const sql = `
    CREATE OR ALTER PROCEDURE${storedProcedure}
      @inputVal varchar(30),
      @outputCount int OUTPUT
    AS
      set @outputCount = LEN(@inputVal);`.trim();

    const request = new tedious.Request(sql, err => {
      if (err) {
        return reject(err);
      }

      resolve(true);
    });

    connection.execSql(request);
  });
}
export function callProcedureWithParameters(
  tedious: tedious,
  connection: Connection
): Promise<any> {
  return new Promise((resolve, reject) => {
    const result: any = {};
    const request = new tedious.Request(storedProcedure, (err) => {
      if (err) {
        return reject(err);
      }
      resolve(result);
    });

    request.addParameter('inputVal', tedious.TYPES.VarChar, 'hello world');
    request.addOutputParameter('outputCount', tedious.TYPES.Int);

    request.on('returnValue', (paramName, value, metadata) => {
      result[paramName] = value;
    });

    connection.callProcedure(request);
  });
}

const table = '[dbo].[test_prepared]';
export function createTable(
  tedious: tedious,
  connection: Connection
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const sql = `
    if not exists(select * from sysobjects where name='test_prepared' and xtype='U')
    CREATE TABLE ${table} (c1 int, c2 int)`.trim();
    const request = new tedious.Request(sql, (err, rowCount) => {
      if (err) {
        return reject(err);
      }
      resolve(true);
    });

    connection.execSql(request);
  });
}
export function prepareSQL(
  tedious: tedious,
  connection: Connection
): Promise<Request> {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO ${table} VALUES (@val1, @val2)`;
    const request = new tedious.Request(sql, (err, rowCount) => {
      if (err) {
        return reject(err);
      }
    });

    // Types for tedious doesn't take this usecase into account, thus the cast to any
    (request as any).addParameter('val1', tedious.TYPES.Int);
    (request as any).addParameter('val2', tedious.TYPES.Int);

    request.on('prepared', () => {
      resolve(request);
    });

    connection.prepare(request);
  });
}

export function executePreparedSQL(
  connection: Connection,
  request: Request
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    request.on('error', reject);
    request.on('requestCompleted', () => {
      resolve(true);
    });
    connection.execute(request, { val1: 1, val2: 2 });
  });
}
