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

import { diag, Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { DatabaseAttribute } from '@opentelemetry/semantic-conventions';
import type * as mysqlTypes from 'mysql';
import { MySQLInstrumentationConfig } from './types';
import { getConnectionAttributes, getDbStatement, getSpanName } from './utils';
import { VERSION } from './version';

type formatType = typeof mysqlTypes.format;

export class MySQLInstrumentation extends InstrumentationBase<
  typeof mysqlTypes
> {
  static readonly COMPONENT = 'mysql';
  static readonly COMMON_ATTRIBUTES = {
    [DatabaseAttribute.DB_SYSTEM]: MySQLInstrumentation.COMPONENT,
  };

  constructor(protected _config: MySQLInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-mysql', VERSION, _config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof mysqlTypes>(
        'mysql',
        ['2.*'],
        (moduleExports, moduleVersion) => {
          diag.debug(`Patching mysql@${moduleVersion}`);

          diag.debug('Patching mysql.createConnection');
          if (isWrapped(moduleExports.createConnection)) {
            this._unwrap(moduleExports, 'createConnection');
          }
          this._wrap(
            moduleExports,
            'createConnection',
            this._patchCreateConnection(moduleExports.format) as any
          );

          diag.debug('Patching mysql.createPool');
          if (isWrapped(moduleExports.createPool)) {
            this._unwrap(moduleExports, 'createPool');
          }
          this._wrap(
            moduleExports,
            'createPool',
            this._patchCreatePool(moduleExports.format) as any
          );

          diag.debug('Patching mysql.createPoolCluster');
          if (isWrapped(moduleExports.createPoolCluster)) {
            this._unwrap(moduleExports, 'createPoolCluster');
          }
          this._wrap(
            moduleExports,
            'createPoolCluster',
            this._patchCreatePoolCluster(moduleExports.format) as any
          );

          return moduleExports;
        },
        moduleExports => {
          if (moduleExports === undefined) return;
          this._unwrap(moduleExports, 'createConnection');
          this._unwrap(moduleExports, 'createPool');
          this._unwrap(moduleExports, 'createPoolCluster');
        }
      ),
    ];
  }

  // global export function
  private _patchCreateConnection(format: formatType) {
    return (originalCreateConnection: Function) => {
      const thisPlugin = this;
      diag.debug('MySQLInstrumentation#patch: patched mysql createConnection');

      return function createConnection(
        _connectionUri: string | mysqlTypes.ConnectionConfig
      ) {
        const originalResult = originalCreateConnection(...arguments);

        // This is unwrapped on next call after unpatch
        thisPlugin._wrap(
          originalResult,
          'query',
          thisPlugin._patchQuery(originalResult, format) as any
        );

        return originalResult;
      };
    };
  }

  // global export function
  private _patchCreatePool(format: formatType) {
    return (originalCreatePool: Function) => {
      const thisPlugin = this;
      diag.debug('MySQLInstrumentation#patch: patched mysql createPool');
      return function createPool(_config: string | mysqlTypes.PoolConfig) {
        const pool = originalCreatePool(...arguments);

        thisPlugin._wrap(pool, 'query', thisPlugin._patchQuery(pool, format));
        thisPlugin._wrap(
          pool,
          'getConnection',
          thisPlugin._patchGetConnection(pool, format)
        );

        return pool;
      };
    };
  }

  // global export function
  private _patchCreatePoolCluster(format: formatType) {
    return (originalCreatePoolCluster: Function) => {
      const thisPlugin = this;
      diag.debug('MySQLInstrumentation#patch: patched mysql createPoolCluster');
      return function createPool(_config: string | mysqlTypes.PoolConfig) {
        const cluster = originalCreatePoolCluster(...arguments);

        // This is unwrapped on next call after unpatch
        thisPlugin._wrap(
          cluster,
          'getConnection',
          thisPlugin._patchGetConnection(cluster, format)
        );

        return cluster;
      };
    };
  }

  // method on cluster or pool
  private _patchGetConnection(
    pool: mysqlTypes.Pool | mysqlTypes.PoolCluster,
    format: formatType
  ) {
    return (originalGetConnection: Function) => {
      const thisPlugin = this;
      diag.debug(
        'MySQLInstrumentation#patch: patched mysql pool getConnection'
      );
      return function getConnection(
        arg1?: unknown,
        arg2?: unknown,
        arg3?: unknown
      ) {
        // Unwrap if unpatch has been called
        if (!thisPlugin['_enabled']) {
          thisPlugin._unwrap(pool, 'getConnection');
          return originalGetConnection.apply(pool, arguments);
        }

        if (arguments.length === 1 && typeof arg1 === 'function') {
          const patchFn = thisPlugin._getConnectionCallbackPatchFn(
            arg1,
            format
          );
          return originalGetConnection.call(pool, patchFn);
        }
        if (arguments.length === 2 && typeof arg2 === 'function') {
          const patchFn = thisPlugin._getConnectionCallbackPatchFn(
            arg2,
            format
          );
          return originalGetConnection.call(pool, arg1, patchFn);
        }
        if (arguments.length === 3 && typeof arg3 === 'function') {
          const patchFn = thisPlugin._getConnectionCallbackPatchFn(
            arg3,
            format
          );
          return originalGetConnection.call(pool, arg1, arg2, patchFn);
        }

        return originalGetConnection.apply(pool, arguments);
      };
    };
  }

  private _getConnectionCallbackPatchFn(cb: Function, format: formatType) {
    const thisPlugin = this;
    return function () {
      if (arguments[1]) {
        // this is the callback passed into a query
        // no need to unwrap
        if (!isWrapped(arguments[1].query)) {
          thisPlugin._wrap(
            arguments[1],
            'query',
            thisPlugin._patchQuery(arguments[1], format)
          );
        }
      }
      if (typeof cb === 'function') {
        cb(...arguments);
      }
    };
  }

  private _patchQuery(
    connection: mysqlTypes.Connection | mysqlTypes.Pool,
    format: formatType
  ) {
    return (originalQuery: Function): mysqlTypes.QueryFunction => {
      const thisPlugin = this;
      diag.debug('MySQLInstrumentation: patched mysql query');

      return function query(
        query: string | mysqlTypes.Query | mysqlTypes.QueryOptions,
        _valuesOrCallback?: unknown[] | mysqlTypes.queryCallback,
        _callback?: mysqlTypes.queryCallback
      ) {
        if (!thisPlugin['_enabled']) {
          thisPlugin._unwrap(connection, 'query');
          return originalQuery.apply(connection, arguments);
        }

        const span = thisPlugin.tracer.startSpan(getSpanName(query), {
          kind: SpanKind.CLIENT,
          attributes: {
            ...MySQLInstrumentation.COMMON_ATTRIBUTES,
            ...getConnectionAttributes(connection.config),
          },
        });

        let values;

        if (Array.isArray(_valuesOrCallback)) {
          values = _valuesOrCallback;
        } else if (arguments[2]) {
          values = [_valuesOrCallback];
        }

        span.setAttribute(
          DatabaseAttribute.DB_STATEMENT,
          getDbStatement(query, format, values)
        );

        if (arguments.length === 1) {
          const streamableQuery: mysqlTypes.Query = originalQuery.apply(
            connection,
            arguments
          );

          return streamableQuery
            .on('error', err =>
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              })
            )
            .on('end', () => {
              span.end();
            });
        }

        if (typeof arguments[1] === 'function') {
          thisPlugin._wrap(arguments, 1, thisPlugin._patchCallbackQuery(span));
        } else if (typeof arguments[2] === 'function') {
          thisPlugin._wrap(arguments, 2, thisPlugin._patchCallbackQuery(span));
        }

        return originalQuery.apply(connection, arguments);
      };
    };
  }

  private _patchCallbackQuery(span: Span) {
    return (originalCallback: Function) => {
      return function (
        err: mysqlTypes.MysqlError | null,
        results?: any,
        fields?: mysqlTypes.FieldInfo[]
      ) {
        if (err) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          });
        }
        span.end();
        return originalCallback(...arguments);
      };
    };
  }
}
