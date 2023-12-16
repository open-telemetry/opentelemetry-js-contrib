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

import {
  context,
  Context,
  diag,
  trace,
  Span,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import type * as mysqlTypes from 'mysql';
import { AttributeNames } from './AttributeNames';
import { MySQLInstrumentationConfig } from './types';
import {
  getConnectionAttributes,
  getDbStatement,
  getDbValues,
  getSpanName,
  getPoolName,
} from './utils';
import { VERSION } from './version';
import { UpDownCounter, MeterProvider } from '@opentelemetry/api';

type getConnectionCallbackType = (
  err: mysqlTypes.MysqlError,
  connection: mysqlTypes.PoolConnection
) => void;

export class MySQLInstrumentation extends InstrumentationBase<
  typeof mysqlTypes
> {
  static readonly COMMON_ATTRIBUTES = {
    [SemanticAttributes.DB_SYSTEM]: DbSystemValues.MYSQL,
  };
  private _connectionsUsage!: UpDownCounter;

  constructor(config?: MySQLInstrumentationConfig) {
    super('@opentelemetry/instrumentation-mysql', VERSION, config);
    this._setMetricInstruments();
  }

  override setMeterProvider(meterProvider: MeterProvider) {
    super.setMeterProvider(meterProvider);
    this._setMetricInstruments();
  }

  private _setMetricInstruments() {
    this._connectionsUsage = this.meter.createUpDownCounter(
      'db.client.connections.usage', //TODO:: use semantic convention
      {
        description:
          'The number of connections that are currently in state described by the state attribute.',
        unit: '{connection}',
      }
    );
  }

  init() {
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
            this._patchCreateConnection() as any
          );

          diag.debug('Patching mysql.createPool');
          if (isWrapped(moduleExports.createPool)) {
            this._unwrap(moduleExports, 'createPool');
          }
          this._wrap(
            moduleExports,
            'createPool',
            this._patchCreatePool() as any
          );

          diag.debug('Patching mysql.createPoolCluster');
          if (isWrapped(moduleExports.createPoolCluster)) {
            this._unwrap(moduleExports, 'createPoolCluster');
          }
          this._wrap(
            moduleExports,
            'createPoolCluster',
            this._patchCreatePoolCluster() as any
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
  private _patchCreateConnection() {
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
          thisPlugin._patchQuery(originalResult) as any
        );

        return originalResult;
      };
    };
  }

  // global export function
  private _patchCreatePool() {
    return (originalCreatePool: Function) => {
      const thisPlugin = this;
      diag.debug('MySQLInstrumentation#patch: patched mysql createPool');
      return function createPool(_config: string | mysqlTypes.PoolConfig) {
        const pool = originalCreatePool(...arguments);

        thisPlugin._wrap(pool, 'query', thisPlugin._patchQuery(pool));
        thisPlugin._wrap(
          pool,
          'getConnection',
          thisPlugin._patchGetConnection(pool)
        );
        thisPlugin._wrap(pool, 'end', thisPlugin._patchPoolEnd(pool));
        thisPlugin._setPoolcallbacks(pool, thisPlugin, '');

        return pool;
      };
    };
  }
  private _patchPoolEnd(pool: any) {
    return (originalPoolEnd: Function) => {
      const thisPlugin = this;
      diag.debug('MySQLInstrumentation#patch: patched mysql pool end');
      return function end(callback?: unknown) {
        const nAll = (pool as any)._allConnections.length;
        const nFree = (pool as any)._freeConnections.length;
        const nUsed = nAll - nFree;
        const poolName = getPoolName(pool);
        thisPlugin._connectionsUsage.add(-nUsed, {
          state: 'used',
          name: poolName,
        });
        thisPlugin._connectionsUsage.add(-nFree, {
          state: 'idle',
          name: poolName,
        });
        originalPoolEnd.apply(pool, arguments);
      };
    };
  }

  // global export function
  private _patchCreatePoolCluster() {
    return (originalCreatePoolCluster: Function) => {
      const thisPlugin = this;
      diag.debug('MySQLInstrumentation#patch: patched mysql createPoolCluster');
      return function createPool(_config: string | mysqlTypes.PoolConfig) {
        const cluster = originalCreatePoolCluster(...arguments);

        // This is unwrapped on next call after unpatch
        thisPlugin._wrap(
          cluster,
          'getConnection',
          thisPlugin._patchGetConnection(cluster)
        );
        thisPlugin._wrap(cluster, 'add', thisPlugin._patchAdd(cluster));

        return cluster;
      };
    };
  }
  private _patchAdd(cluster: mysqlTypes.PoolCluster) {
    return (originalAdd: Function) => {
      const thisPlugin = this;
      diag.debug('MySQLInstrumentation#patch: patched mysql pool cluster add');
      return function add(id: string, config: unknown) {
        // Unwrap if unpatch has been called
        if (!thisPlugin['_enabled']) {
          thisPlugin._unwrap(cluster, 'add');
          return originalAdd.apply(cluster, arguments);
        }
        originalAdd.apply(cluster, arguments);
        const nodes = cluster['_nodes' as keyof mysqlTypes.PoolCluster] as any;
        if (nodes) {
          const nodeId =
            typeof id === 'object'
              ? 'CLUSTER::' + (cluster as any)._lastId
              : String(id);

          const pool = nodes[nodeId].pool;
          thisPlugin._setPoolcallbacks(pool, thisPlugin, id);
        }
      };
    };
  }

  // method on cluster or pool
  private _patchGetConnection(pool: mysqlTypes.Pool | mysqlTypes.PoolCluster) {
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
            arg1 as getConnectionCallbackType
          );
          return originalGetConnection.call(pool, patchFn);
        }
        if (arguments.length === 2 && typeof arg2 === 'function') {
          const patchFn = thisPlugin._getConnectionCallbackPatchFn(
            arg2 as getConnectionCallbackType
          );
          return originalGetConnection.call(pool, arg1, patchFn);
        }
        if (arguments.length === 3 && typeof arg3 === 'function') {
          const patchFn = thisPlugin._getConnectionCallbackPatchFn(
            arg3 as getConnectionCallbackType
          );
          return originalGetConnection.call(pool, arg1, arg2, patchFn);
        }

        return originalGetConnection.apply(pool, arguments);
      };
    };
  }

  private _getConnectionCallbackPatchFn(cb: getConnectionCallbackType) {
    const thisPlugin = this;
    const activeContext = context.active();
    return function (
      this: any,
      err: mysqlTypes.MysqlError,
      connection: mysqlTypes.PoolConnection
    ) {
      if (connection) {
        // this is the callback passed into a query
        // no need to unwrap
        if (!isWrapped(connection.query)) {
          thisPlugin._wrap(
            connection,
            'query',
            thisPlugin._patchQuery(connection)
          );
        }
      }
      if (typeof cb === 'function') {
        context.with(activeContext, cb, this, err, connection);
      }
    };
  }

  private _patchQuery(connection: mysqlTypes.Connection | mysqlTypes.Pool) {
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

        span.setAttribute(
          SemanticAttributes.DB_STATEMENT,
          getDbStatement(query)
        );

        const instrumentationConfig: MySQLInstrumentationConfig =
          thisPlugin.getConfig();

        if (instrumentationConfig.enhancedDatabaseReporting) {
          let values;

          if (Array.isArray(_valuesOrCallback)) {
            values = _valuesOrCallback;
          } else if (arguments[2]) {
            values = [_valuesOrCallback];
          }

          span.setAttribute(
            AttributeNames.MYSQL_VALUES,
            getDbValues(query, values)
          );
        }

        const cbIndex = Array.from(arguments).findIndex(
          arg => typeof arg === 'function'
        );

        const parentContext = context.active();

        if (cbIndex === -1) {
          const streamableQuery: mysqlTypes.Query = context.with(
            trace.setSpan(context.active(), span),
            () => {
              return originalQuery.apply(connection, arguments);
            }
          );
          context.bind(parentContext, streamableQuery);

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
        } else {
          thisPlugin._wrap(
            arguments,
            cbIndex,
            thisPlugin._patchCallbackQuery(span, parentContext)
          );

          return context.with(trace.setSpan(context.active(), span), () => {
            return originalQuery.apply(connection, arguments);
          });
        }
      };
    };
  }

  private _patchCallbackQuery(span: Span, parentContext: Context) {
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
        return context.with(parentContext, () =>
          originalCallback(...arguments)
        );
      };
    };
  }
  private _setPoolcallbacks(
    pool: mysqlTypes.Pool,
    thisPlugin: MySQLInstrumentation,
    id: string
  ) {
    //TODO:: use semantic convention
    const poolName = id || getPoolName(pool);

    pool.on('connection', connection => {
      thisPlugin._connectionsUsage.add(1, {
        state: 'idle',
        name: poolName,
      });
    });

    pool.on('acquire', connection => {
      thisPlugin._connectionsUsage.add(-1, {
        state: 'idle',
        name: poolName,
      });
      thisPlugin._connectionsUsage.add(1, {
        state: 'used',
        name: poolName,
      });
    });

    pool.on('release', connection => {
      thisPlugin._connectionsUsage.add(-1, {
        state: 'used',
        name: poolName,
      });
      thisPlugin._connectionsUsage.add(1, {
        state: 'idle',
        name: poolName,
      });
    });
  }
}
