/*
 * Copyright The OpenTelemetry Authors, Aspecto
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
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
  diag,
  Attributes,
} from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  ATTR_NETWORK_TRANSPORT,
  NETWORK_TRANSPORT_VALUE_TCP,
} from '@opentelemetry/semantic-conventions';
import type * as sequelize from 'sequelize';
import { SequelizeInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { extractTableFromQuery } from './utils';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';

export class SequelizeInstrumentation extends InstrumentationBase<SequelizeInstrumentationConfig> {
  static readonly component = 'sequelize';
  static readonly supportedVersions = '>=6 <7';

  constructor(config: SequelizeInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  protected init() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unpatchConnectionManager = (moduleExports: any) => {
      if (
        isWrapped(moduleExports?.ConnectionManager?.prototype?.getConnection)
      ) {
        this._unwrap(
          moduleExports.ConnectionManager.prototype,
          'getConnection'
        );
      }
      return moduleExports;
    };
    const connectionManagerInstrumentation = new InstrumentationNodeModuleFile(
      'sequelize/lib/dialects/abstract/connection-manager.js',
      [SequelizeInstrumentation.supportedVersions],
      moduleExports => {
        if (moduleExports === undefined || moduleExports === null) {
          return moduleExports;
        }
        unpatchConnectionManager(moduleExports);
        this._wrap(
          moduleExports.ConnectionManager.prototype,
          'getConnection',
          this._getConnectionPatch()
        );
        return moduleExports;
      },
      unpatchConnectionManager
    );

    const unpatch = (moduleExports: typeof sequelize) => {
      if (isWrapped(moduleExports.Sequelize.prototype.query)) {
        this._unwrap(moduleExports.Sequelize.prototype, 'query');
      }
    };
    const module = new InstrumentationNodeModuleDefinition(
      SequelizeInstrumentation.component,
      [SequelizeInstrumentation.supportedVersions],
      moduleExports => {
        if (moduleExports === undefined || moduleExports === null) {
          return moduleExports;
        }

        unpatch(moduleExports);
        this._wrap(
          moduleExports.Sequelize.prototype,
          'query',
          this._createQueryPatch()
        );

        return moduleExports;
      },
      unpatch,
      [connectionManagerInstrumentation]
    );
    return module;
  }

  // run getConnection with suppressTracing, as it might call internally to `databaseVersion` function
  // which calls `query` and create internal span which we don't need to instrument
  private _getConnectionPatch() {
    return (original: Function) => {
      return function (this: unknown, ...args: unknown[]) {
        return context.with(suppressTracing(context.active()), () =>
          original.apply(this, args)
        );
      };
    };
  }

  private _createQueryPatch() {
    const self = this;
    return (original: sequelize.Sequelize['query']) => {
      return function query(
        this: sequelize.Sequelize,
        ...args: Parameters<sequelize.Sequelize['query']>
      ) {
        if (
          self.getConfig().ignoreOrphanedSpans &&
          !trace.getSpan(context.active())
        ) {
          return original.apply(this, args);
        }

        const sqlOrQuery = args[0];
        const extractStatement = (sql: typeof sqlOrQuery) => {
          if (typeof sql === 'string') return sql;
          return sql?.query || '';
        };
        const statement = extractStatement(args[0]).trim();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const option = args[1] as any;
        let operation = option?.type;

        if (!operation) operation = statement.split(' ')[0];

        const sequelizeInstance: sequelize.Sequelize = this;
        const config = sequelizeInstance?.config;

        let tableName = option?.instance?.constructor?.tableName;
        if (!tableName) {
          if (Array.isArray(option?.tableNames) && option.tableNames.length > 0)
            tableName = option?.tableNames.sort().join(',');
          else tableName = extractTableFromQuery(statement);
        }

        const attributes: Attributes = {
          [ATTR_DB_SYSTEM_NAME]: sequelizeInstance.getDialect(),
          [ATTR_DB_NAMESPACE]: config?.database,
          [ATTR_DB_OPERATION_NAME]: operation,
          [ATTR_DB_QUERY_TEXT]: statement,
          [ATTR_DB_COLLECTION_NAME]: tableName,
          [ATTR_SERVER_ADDRESS]: config?.host,
          [ATTR_SERVER_PORT]: config?.port ? Number(config?.port) : undefined,
          [ATTR_NETWORK_TRANSPORT]: self._getNetTransport(config?.protocol),
        };

        const newSpan: Span = self.tracer.startSpan(`Sequelize ${operation}`, {
          kind: SpanKind.CLIENT,
          attributes,
        });

        const activeContextWithSpan = trace.setSpan(context.active(), newSpan);

        const hook = self.getConfig().queryHook;
        if (hook !== undefined && sqlOrQuery !== undefined) {
          safeExecuteInTheMiddle(
            () => hook(newSpan, { sql: sqlOrQuery, option }),
            e => {
              if (e)
                diag.error('sequelize instrumentation: queryHook error', e);
            },
            true
          );
        }

        return (
          context
            .with(
              self.getConfig().suppressInternalInstrumentation
                ? suppressTracing(activeContextWithSpan)
                : activeContextWithSpan,
              () => original.apply(this, args)
            )
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then((response: any) => {
              const responseHook = self.getConfig().responseHook;
              if (responseHook !== undefined) {
                safeExecuteInTheMiddle(
                  () => responseHook(newSpan, response),
                  e => {
                    if (e)
                      diag.error(
                        'sequelize instrumentation: responseHook error',
                        e
                      );
                  },
                  true
                );
              }
              return response;
            })
            .catch((err: Error) => {
              newSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              });
              throw err;
            })
            .finally(() => {
              newSpan.end();
            })
        );
      };
    };
  }

  private _getNetTransport(protocol: string) {
    switch (protocol) {
      case 'tcp':
        return NETWORK_TRANSPORT_VALUE_TCP;
      default:
        return undefined;
    }
  }
}
