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
import type { Connection, Request, TYPES, ConnectionConfig } from 'tedious';

type Method = keyof Connection & ('execSql' | 'execSqlBatch' | 'prepare');
export type tedious = {
  Connection: typeof Connection;
  Request: typeof Request;
  TYPES: typeof TYPES;
  ConnectionConfig: ConnectionConfig;
};

export const makeApi = (tedious: tedious) => {
  const fullName = (resource: string) => {
    assert.strictEqual(typeof resource, 'string');
    return `[dbo].[${resource}]`;
  };

  const createConnection = (config: ConnectionConfig): Promise<Connection> => {
    return new Promise((resolve, reject) => {
      const connection = new tedious.Connection(config);

      connection.on('connect', err => {
        if (err) {
          return reject(err);
        }
        return resolve(connection);
      });

      // <8.3.0 autoconnects
      // `state` and `STATE` are private API
      if ((connection as any).state !== (connection as any).STATE.CONNECTING) {
        connection.connect();
      }
    });
  };
  const closeConnection = (connection: Connection): Promise<boolean> => {
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

  const query = (
    connection: Connection,
    params: string,
    method: Method = 'execSql'
  ): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const result: any[] = [];
      const request = new tedious.Request(params, (err, rowCount, rows) => {
        if (err) {
          return reject(err);
        } else {
          resolve(result);
        }
      });

      // request.on('returnValue', console.log.bind(console, /*request.sqlTextOrProcedure,*/ 'returnValue:'));
      // request.on('error', console.log.bind(console, /*request.sqlTextOrProcedure,*/ 'error:'));
      // request.on('row', console.log.bind(console, /*request.sqlTextOrProcedure,*/ 'row:'));
      // request.on('done', console.log.bind(console, /*request.sqlTextOrProcedure,*/ 'done:'));
      // request.on('doneInProc', console.log.bind(console, /*request.sqlTextOrProcedure,*/ 'doneInProc:'));
      // request.on('doneProc', console.log.bind(console, /*request.sqlTextOrProcedure,*/ 'doneProc:'));
      // request.on('prepared', console.log.bind(console, /*request.sqlTextOrProcedure,*/ 'prepared:'));
      // request.on('columnMetadata', console.log.bind(console, /*request.sqlTextOrProcedure,*/ 'columnMetadata:'));

      request.on('row', (rows: any[]) => {
        result.push(...rows.map(r => r.value));
      });

      connection[method](request);
    });
  };

  const storedProcedure = {
    procedureName: '[dbo].[test_proced]',
    create: (connection: Connection): Promise<boolean> => {
      return new Promise((resolve, reject) => {
        const sql = `
        CREATE OR ALTER PROCEDURE ${storedProcedure.procedureName}
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
    },
    call: (connection: Connection): Promise<any> => {
      return new Promise((resolve, reject) => {
        const result: any = {};
        const request = new tedious.Request(
          storedProcedure.procedureName,
          err => {
            if (err) {
              return reject(err);
            }
            resolve(result);
          }
        );

        request.addParameter('inputVal', tedious.TYPES.VarChar, 'hello world');
        request.addOutputParameter('outputCount', tedious.TYPES.Int);

        request.on('returnValue', (paramName, value, metadata) => {
          result[paramName] = value;
        });

        connection.callProcedure(request);
      });
    },
  };

  const preparedSQL = {
    tableName: '[dbo].[test_prepared]',
    createTable: (connection: Connection): Promise<boolean> => {
      return new Promise((resolve, reject) => {
        const sql = `
        if not exists(SELECT * FROM sysobjects WHERE name='test_prepared' AND xtype='U')
        CREATE TABLE ${preparedSQL.tableName} (c1 int, c2 int)`.trim();
        const request = new tedious.Request(sql, (err, rowCount) => {
          if (err) {
            return reject(err);
          }
          resolve(true);
        });

        connection.execSql(request);
      });
    },
    prepare: (connection: Connection): Promise<Request> => {
      return new Promise((resolve, reject) => {
        const sql = `INSERT INTO ${preparedSQL.tableName} VALUES (@val1, @val2)`;
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
    },
    execute: (connection: Connection, request: Request): Promise<boolean> => {
      return new Promise((resolve, reject) => {
        request.on('error', reject);
        request.on('requestCompleted', () => {
          resolve(true);
        });
        connection.execute(request, { val1: 1, val2: 2 });
      });
    },
  };

  /*
    Connection has `inTransaction` boolean and `transactionDepth` property, but the
    reliability of those are questionable with `abortTransactionOnError` option enabled.
    Use cases to test for in the future:
  */
  const transaction = {
    tableName: '[dbo].[test_transact]',
    execute: async (connection: Connection) => {
      const tx = transaction.api(connection);
      await tx.begin();
      await query(
        connection,
        `CREATE TABLE ${transaction.tableName} (c1 int UNIQUE)`
      );
      await query(
        connection,
        `INSERT INTO ${transaction.tableName} VALUES ('1')`
      );
      await tx.commit();

      return query(connection, `SELECT * FROM ${transaction.tableName}`);
    },
    fail: async (connection: Connection) => {
      const tx = transaction.api(connection);
      await tx.begin();
      await query(
        connection,
        `CREATE TABLE ${transaction.tableName} (c1 int UNIQUE)`
      );
      await query(
        connection,
        `INSERT INTO ${transaction.tableName} VALUES ('1')`
      );
      await query(
        connection,
        `INSERT INTO ${transaction.tableName} VALUES ('1')`
      ).catch(() => {});
      await tx.rollback();
      return query(connection, `SELECT * FROM ${transaction.tableName}`).catch(
        () => true
      );
    },
    api: (connection: Connection) => {
      return {
        begin: () => {
          return promisify(connection.beginTransaction).call(connection);
        },
        commit: () => {
          return promisify(connection.commitTransaction).call(connection);
        },
        rollback: () => {
          return promisify(connection.rollbackTransaction).call(connection);
        },
      };
    },
  };

  const bulkLoad = {
    tableName: '[dbo].[test_bulk]',
    tableNameShort: 'test_bulk',
    createTable: (connection: Connection): Promise<boolean> => {
      return new Promise((resolve, reject) => {
        const sql = `
        if not exists(SELECT * FROM sysobjects WHERE name='test_bulk' AND xtype='U')
        CREATE TABLE ${bulkLoad.tableName} ([c1] [int]  DEFAULT 58, [c2] [varchar](30))`.trim();
        const request = new tedious.Request(sql, (err, rowCount) => {
          if (err) {
            return reject(err);
          }
          resolve(true);
        });

        connection.execSql(request);
      });
    },
    execute: (connection: Connection): Promise<number> => {
      return new Promise((resolve, reject) => {
        const requestDoneCb = (err: any, rowCount: number) => {
          if (err) {
            return reject(err);
          }
          resolve(rowCount);
        };
        // <2.2.0 didn't take bulkOptions
        const request =
          connection.newBulkLoad.length === 2
            ? connection.newBulkLoad(bulkLoad.tableNameShort, requestDoneCb)
            : (connection.newBulkLoad as any)(
                bulkLoad.tableNameShort,
                { keepNulls: true },
                requestDoneCb
              );

        request.addColumn('c1', tedious.TYPES.Int, { nullable: true });
        request.addColumn('c2', tedious.TYPES.NVarChar, {
          length: 50,
          nullable: true,
        });

        if (connection.execBulkLoad.length === 1) {
          // required in <=11.5. not supported in 14
          request.addRow({ c1: 1 });
          request.addRow({ c1: 2, c2: 'hello' });
          return connection.execBulkLoad(request);
        }

        (connection.execBulkLoad as any)(request, [
          { c1: 1 },
          { c1: 2, c2: 'hello' },
        ]);
      });
    },
  };

  const cleanup = (connection: Connection) => {
    return query(
      connection,
      `
      if exists(SELECT * FROM sysobjects WHERE name='test_prepared' AND xtype='U') DROP TABLE ${preparedSQL.tableName};
      if exists(SELECT * FROM sysobjects WHERE name='test_bulk' AND xtype='U') DROP TABLE ${bulkLoad.tableName};
      if exists(SELECT * FROM sysobjects WHERE name='test_transact' AND xtype='U') DROP TABLE ${transaction.tableName};
      if exists(SELECT * FROM sysobjects WHERE name='test_proced' AND xtype='U') DROP PROCEDURE ${storedProcedure.procedureName};
      if exists(SELECT * FROM sys.databases WHERE name = 'temp_otel_db') DROP DATABASE temp_otel_db;
    `.trim()
    );
  };

  return {
    fullName,
    bulkLoad,
    cleanup,
    closeConnection,
    createConnection,
    preparedSQL,
    query,
    storedProcedure,
    transaction,
  };
};

export default makeApi;
