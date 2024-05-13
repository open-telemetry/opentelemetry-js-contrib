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

import * as api from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  DBSYSTEMVALUES_MYSQL,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
} from '@opentelemetry/semantic-conventions';
import { addSqlCommenterComment } from '@opentelemetry/sql-common';
import type * as mysqlTypes from 'mysql2';
import { MySQL2InstrumentationConfig } from './types';
import {
  getConnectionAttributes,
  getDbStatement,
  getSpanName,
  once,
} from './utils';
import { NPM_PACKAGE_VERSION } from './version';

type formatType = typeof mysqlTypes.format;

export class MySQL2Instrumentation extends InstrumentationBase {
  static readonly COMMON_ATTRIBUTES = {
    [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_MYSQL,
  };

  constructor(config: MySQL2InstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-mysql2', NPM_PACKAGE_VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        'mysql2',
        ['>= 1.4.2 < 4.0'],
        (moduleExports: any) => {
          const ConnectionPrototype: mysqlTypes.Connection =
            moduleExports.Connection.prototype;
          if (isWrapped(ConnectionPrototype.query)) {
            this._unwrap(ConnectionPrototype, 'query');
          }
          this._wrap(
            ConnectionPrototype,
            'query',
            this._patchQuery(moduleExports.format, false) as any
          );

          if (isWrapped(ConnectionPrototype.execute)) {
            this._unwrap(ConnectionPrototype, 'execute');
          }
          this._wrap(
            ConnectionPrototype,
            'execute',
            this._patchQuery(moduleExports.format, true) as any
          );

          return moduleExports;
        },
        (moduleExports: any) => {
          if (moduleExports === undefined) return;
          const ConnectionPrototype: mysqlTypes.Connection =
            moduleExports.Connection.prototype;
          this._unwrap(ConnectionPrototype, 'query');
          this._unwrap(ConnectionPrototype, 'execute');
        }
      ),
    ];
  }

  private _patchQuery(format: formatType, isPrepared: boolean) {
    return (originalQuery: Function): Function => {
      const thisPlugin = this;
      return function query(
        this: mysqlTypes.Connection,
        query: string | mysqlTypes.Query | mysqlTypes.QueryOptions,
        _valuesOrCallback?: unknown[] | Function,
        _callback?: Function
      ) {
        const thisPluginConfig: MySQL2InstrumentationConfig =
          thisPlugin._config;

        let values;
        if (Array.isArray(_valuesOrCallback)) {
          values = _valuesOrCallback;
        } else if (arguments[2]) {
          values = [_valuesOrCallback];
        }

        const span = thisPlugin.tracer.startSpan(getSpanName(query), {
          kind: api.SpanKind.CLIENT,
          attributes: {
            ...MySQL2Instrumentation.COMMON_ATTRIBUTES,
            ...getConnectionAttributes(this.config),
            [SEMATTRS_DB_STATEMENT]: getDbStatement(query, format, values),
          },
        });

        if (!isPrepared && thisPluginConfig.addSqlCommenterCommentToQueries) {
          arguments[0] = query =
            typeof query === 'string'
              ? addSqlCommenterComment(span, query)
              : Object.assign(query, {
                  sql: addSqlCommenterComment(span, query.sql),
                });
        }

        const endSpan = once((err?: any, results?: any) => {
          if (err) {
            span.setStatus({
              code: api.SpanStatusCode.ERROR,
              message: err.message,
            });
          } else {
            if (typeof thisPluginConfig.responseHook === 'function') {
              safeExecuteInTheMiddle(
                () => {
                  thisPluginConfig.responseHook!(span, {
                    queryResults: results,
                  });
                },
                err => {
                  if (err) {
                    thisPlugin._diag.warn('Failed executing responseHook', err);
                  }
                },
                true
              );
            }
          }

          span.end();
        });

        if (arguments.length === 1) {
          if (typeof (query as any).onResult === 'function') {
            thisPlugin._wrap(
              query as any,
              'onResult',
              thisPlugin._patchCallbackQuery(endSpan)
            );
          }

          const streamableQuery: mysqlTypes.Query = originalQuery.apply(
            this,
            arguments
          );

          // `end` in mysql behaves similarly to `result` in mysql2.
          streamableQuery
            .once('error', err => {
              endSpan(err);
            })
            .once('result', results => {
              endSpan(undefined, results);
            });

          return streamableQuery;
        }

        if (typeof arguments[1] === 'function') {
          thisPlugin._wrap(
            arguments,
            1,
            thisPlugin._patchCallbackQuery(endSpan)
          );
        } else if (typeof arguments[2] === 'function') {
          thisPlugin._wrap(
            arguments,
            2,
            thisPlugin._patchCallbackQuery(endSpan)
          );
        }

        return originalQuery.apply(this, arguments);
      };
    };
  }

  private _patchCallbackQuery(endSpan: Function) {
    return (originalCallback: Function) => {
      return function (
        err: mysqlTypes.QueryError | null,
        results?: any,
        fields?: mysqlTypes.FieldPacket[]
      ) {
        endSpan(err, results);
        return originalCallback(...arguments);
      };
    };
  }
}
