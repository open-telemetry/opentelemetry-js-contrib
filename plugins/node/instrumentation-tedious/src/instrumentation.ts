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
import { EventEmitter } from 'events';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import type * as tedious from 'tedious';
import { TediousInstrumentationConfig } from './types';
import { getSpanName, once } from './utils';
import { VERSION } from './version';

const CURRENT_DATABASE = Symbol(
  'opentelemetry.instrumentation-tedious.current-database'
);
const PATCHED_METHODS = [
  'callProcedure',
  'execSql',
  'execSqlBatch',
  'execBulkLoad',
  'prepare',
  'execute',
];

type UnknownFunction = (...args: any[]) => any;
type ApproxConnection = EventEmitter & {
  [CURRENT_DATABASE]: string;
  config: any;
};
type ApproxRequest = EventEmitter & {
  sqlTextOrProcedure: string | undefined;
  callback: any;
  table: string | undefined;
  parametersByName: any;
};

function setDatabase(this: ApproxConnection, databaseName: string) {
  Object.defineProperty(this, CURRENT_DATABASE, {
    value: databaseName,
    writable: true,
  });
}

export class TediousInstrumentation extends InstrumentationBase {
  static readonly COMPONENT = 'tedious';

  constructor(config: TediousInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-tedious', VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        TediousInstrumentation.COMPONENT,
        ['>=1.11.0 <=15'],
        (moduleExports: typeof tedious) => {
          const ConnectionPrototype: any = moduleExports.Connection.prototype;
          for (const method of PATCHED_METHODS) {
            if (isWrapped(ConnectionPrototype[method])) {
              this._unwrap(ConnectionPrototype, method);
            }
            this._wrap(
              ConnectionPrototype,
              method,
              this._patchQuery(method) as any
            );
          }

          if (isWrapped(ConnectionPrototype.connect)) {
            this._unwrap(ConnectionPrototype, 'connect');
          }
          this._wrap(ConnectionPrototype, 'connect', this._patchConnect);

          return moduleExports;
        },
        (moduleExports: typeof tedious) => {
          if (moduleExports === undefined) return;
          const ConnectionPrototype: any = moduleExports.Connection.prototype;
          for (const method of PATCHED_METHODS) {
            this._unwrap(ConnectionPrototype, method);
          }
          this._unwrap(ConnectionPrototype, 'connect');
        }
      ),
    ];
  }

  private _patchConnect(original: UnknownFunction): UnknownFunction {
    return function patchedConnect(this: ApproxConnection) {
      setDatabase.call(this, this.config?.options?.database);

      // remove the listener first in case it's already added
      this.removeListener('databaseChange', setDatabase);
      this.on('databaseChange', setDatabase);

      this.once('end', () => {
        this.removeListener('databaseChange', setDatabase);
      });
      return original.apply(this, arguments as unknown as any[]);
    };
  }

  private _patchQuery(operation: string) {
    return (originalMethod: UnknownFunction): UnknownFunction => {
      const thisPlugin = this;
      this._diag.debug(
        `TediousInstrumentation: patched Connection.prototype.${operation}`
      );

      function patchedMethod(this: ApproxConnection, request: ApproxRequest) {
        if (!(request instanceof EventEmitter)) {
          thisPlugin._diag.warn(
            `Unexpected invocation of patched ${operation} method. Span not recorded`
          );
          return originalMethod.apply(this, arguments as unknown as any[]);
        }
        let procCount = 0;
        let statementCount = 0;
        const incrementStatementCount = () => statementCount++;
        const incrementProcCount = () => procCount++;
        const databaseName = this[CURRENT_DATABASE];
        const sql = (request => {
          // Required for <11.0.9
          if (
            request.sqlTextOrProcedure === 'sp_prepare' &&
            request.parametersByName?.stmt?.value
          ) {
            return request.parametersByName.stmt.value;
          }
          return request.sqlTextOrProcedure;
        })(request);

        const span = thisPlugin.tracer.startSpan(
          getSpanName(operation, databaseName, sql, request.table),
          {
            kind: api.SpanKind.CLIENT,
            attributes: {
              [SemanticAttributes.DB_SYSTEM]: DbSystemValues.MSSQL,
              [SemanticAttributes.DB_NAME]: databaseName,
              [SemanticAttributes.NET_PEER_PORT]: this.config?.options?.port,
              [SemanticAttributes.NET_PEER_NAME]: this.config?.server,
              // >=4 uses `authentication` object, older versions just userName and password pair
              [SemanticAttributes.DB_USER]:
                this.config?.userName ??
                this.config?.authentication?.options?.userName,
              [SemanticAttributes.DB_STATEMENT]: sql,
              [SemanticAttributes.DB_SQL_TABLE]: request.table,
            },
          }
        );

        const endSpan = once((err?: any) => {
          request.removeListener('done', incrementStatementCount);
          request.removeListener('doneInProc', incrementStatementCount);
          request.removeListener('doneProc', incrementProcCount);
          request.removeListener('error', endSpan);
          this.removeListener('end', endSpan);

          span.setAttribute('tedious.procedure_count', procCount);
          span.setAttribute('tedious.statement_count', statementCount);
          if (err) {
            span.setStatus({
              code: api.SpanStatusCode.ERROR,
              message: err.message,
            });
          }
          span.end();
        });

        request.on('done', incrementStatementCount);
        request.on('doneInProc', incrementStatementCount);
        request.on('doneProc', incrementProcCount);
        request.once('error', endSpan);
        this.on('end', endSpan);

        if (typeof request.callback === 'function') {
          thisPlugin._wrap(
            request,
            'callback',
            thisPlugin._patchCallbackQuery(endSpan)
          );
        } else {
          thisPlugin._diag.error('Expected request.callback to be a function');
        }

        return api.context.with(
          api.trace.setSpan(api.context.active(), span),
          originalMethod,
          this,
          ...arguments
        );
      }

      Object.defineProperty(patchedMethod, 'length', {
        value: originalMethod.length,
        writable: false,
      });

      return patchedMethod;
    };
  }

  private _patchCallbackQuery(endSpan: Function) {
    return (originalCallback: Function) => {
      return function (
        this: any,
        err: Error | undefined | null,
        rowCount?: number,
        rows?: any
      ) {
        endSpan(err);
        return originalCallback.apply(this, arguments);
      };
    };
  }
}
