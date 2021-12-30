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
} from '@opentelemetry/instrumentation';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import type * as tedious from 'tedious';
import { TediousInstrumentationConfig } from './types';
import { getSpanName, once } from './utils';
import { VERSION } from './version';

type UnknownFunction = (...args: any[]) => any;

const CURRENT_DATABASE = Symbol('OTEL_CURRENT_DATABASE');
const PATCHED_METHODS = [
  'callProcedure',
  'execSql',
  'execSqlBatch',
  'prepare',
  'execute',
];

export class TediousInstrumentation extends InstrumentationBase<
  typeof tedious
> {
  static readonly COMPONENT = 'tedious';

  constructor(config?: TediousInstrumentationConfig) {
    super('@opentelemetry/instrumentation-tedious', VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof tedious>(
        TediousInstrumentation.COMPONENT,
        ['14'],
        (moduleExports: any, moduleVersion) => {
          this._diag.debug(`Patching tedious@${moduleVersion}`);

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
        (moduleExports: any) => {
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
    return function patchedConnect(this: { config: any }) {
      Object.defineProperty(this, CURRENT_DATABASE, {
        value: this.config?.options?.database,
        writable: true,
      });
      const setDatabase = databaseName => {
        this[CURRENT_DATABASE] = databaseName;
      };

      this.on('databaseChange', setDatabase);
      this.once('end', () => {
        this.removeListener('databaseChange', setDatabase);
      });
      return original.apply(this, arguments);
    };
  }

  private _patchQuery(operation: string) {
    return (originalMethod: UnknownFunction): UnknownFunction => {
      const thisPlugin = this;
      this._diag.debug(
        `TediousInstrumentation: patched Connection.prototype.${operation}`
      );

      return function patchedMethod(
        this: { config: any },
        request: {
          sqlTextOrProcedure: string | undefined;
          callback: any;
          on: Function;
        }
      ) {
        let procCount = 0;
        let statementCount = 0;
        const incrementStatementCount = () => statementCount++;
        const incrementProcCount = () => procCount++;
        const databaseName = this[CURRENT_DATABASE];

        const span = thisPlugin.tracer.startSpan(
          getSpanName(operation, databaseName, request.sqlTextOrProcedure),
          {
            kind: api.SpanKind.CLIENT,
            attributes: {
              [SemanticAttributes.DB_SYSTEM]: DbSystemValues.MSSQL,
              [SemanticAttributes.DB_NAME]: databaseName,
              [SemanticAttributes.NET_PEER_PORT]: this.config?.options?.port,
              [SemanticAttributes.NET_PEER_NAME]: this.config?.server,
              [SemanticAttributes.DB_USER]:
                this.config?.authentication?.options?.userName,
              [SemanticAttributes.DB_STATEMENT]: request.sqlTextOrProcedure,
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
        }

        return api.context.with(
          api.trace.setSpan(api.context.active(), span),
          originalMethod,
          this,
          ...arguments
        );
      };
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
