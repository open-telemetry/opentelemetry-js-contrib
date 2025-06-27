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
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
  context,
} from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from './semconv';
import {
  ExtendedDatabaseAttribute,
  TypeormInstrumentationConfig,
} from './types';
import {
  getParamNames,
  isTypeormInternalTracingSuppressed,
  suppressTypeormInternalTracing,
} from './utils';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import type * as typeorm from 'typeorm';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import * as util from 'util';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SelectQueryBuilderMethod = keyof typeorm.SelectQueryBuilder<any>;
const selectQueryBuilderExecuteMethods: SelectQueryBuilderMethod[] = [
  'getRawOne',
  'getCount',
  'getManyAndCount',
  'stream',
  'getMany',
  'getOneOrFail',
  'getOne',
  'getRawAndEntities',
  'getRawMany',
];
const rawQueryFuncName = 'query';
type EntityManagerMethods = keyof typeorm.EntityManager;
const functionsUsingEntityPersistExecutor: EntityManagerMethods[] = [
  'save',
  'remove',
  'softRemove',
  'recover',
];
const functionsUsingQueryBuilder: EntityManagerMethods[] = [
  'insert',
  'update',
  'delete',
  'softDelete',
  'restore',
  'count',
  'find',
  'findAndCount',
  'findByIds',
  'findOne',
  'increment',
  'decrement',
];
const entityManagerMethods: EntityManagerMethods[] = [
  ...functionsUsingEntityPersistExecutor,
  ...functionsUsingQueryBuilder,
];

export class TypeormInstrumentation extends InstrumentationBase<TypeormInstrumentationConfig> {
  constructor(config: TypeormInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  protected init() {
    const selectQueryBuilder = new InstrumentationNodeModuleFile(
      'typeorm/query-builder/SelectQueryBuilder.js',
      ['>=0.3.0 <1'],
      moduleExports => {
        selectQueryBuilderExecuteMethods.map(method => {
          if (isWrapped(moduleExports.SelectQueryBuilder.prototype?.[method])) {
            this._unwrap(moduleExports.SelectQueryBuilder.prototype, method);
          }
          this._wrap(
            moduleExports.SelectQueryBuilder.prototype,
            method,
            this._patchQueryBuilder()
          );
        });

        return moduleExports;
      },
      moduleExports => {
        selectQueryBuilderExecuteMethods.map(method => {
          if (isWrapped(moduleExports.SelectQueryBuilder.prototype?.[method])) {
            this._unwrap(moduleExports.SelectQueryBuilder.prototype, method);
          }
        });
        return moduleExports;
      }
    );

    const dataSource = new InstrumentationNodeModuleFile(
      'typeorm/data-source/DataSource.js',
      ['>=0.3.0 <1'],
      moduleExports => {
        if (isWrapped(moduleExports.DataSource.prototype?.[rawQueryFuncName])) {
          this._unwrap(moduleExports.DataSource.prototype, rawQueryFuncName);
        }
        this._wrap(
          moduleExports.DataSource.prototype,
          rawQueryFuncName,
          this._patchRawQuery()
        );

        return moduleExports;
      },
      moduleExports => {
        if (isWrapped(moduleExports.DataSource.prototype?.[rawQueryFuncName])) {
          this._unwrap(moduleExports.DataSource.prototype, rawQueryFuncName);
        }
        return moduleExports;
      }
    );

    const entityManager = new InstrumentationNodeModuleFile(
      'typeorm/entity-manager/EntityManager.js',
      ['>=0.3.0 <1'],
      moduleExports => {
        entityManagerMethods.map(method => {
          if (isWrapped(moduleExports.EntityManager.prototype?.[method])) {
            this._unwrap(moduleExports.EntityManager.prototype, method);
          }
          this._wrap(
            moduleExports.EntityManager.prototype,
            method,
            this._patchEntityManagerFunction(method)
          );
        });

        return moduleExports;
      },
      moduleExports => {
        entityManagerMethods.map(method => {
          if (isWrapped(moduleExports.EntityManager.prototype?.[method])) {
            this._unwrap(moduleExports.EntityManager.prototype, method);
          }
        });
        return moduleExports;
      }
    );

    const module = new InstrumentationNodeModuleDefinition(
      'typeorm',
      ['>=0.3.0 <1'],
      undefined,
      undefined,
      [selectQueryBuilder, entityManager, dataSource]
    );
    return module;
  }

  private _patchEntityManagerFunction(opName: string) {
    const self = this;
    return (original: Function) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function (this: any, ...args: unknown[]) {
        if (isTypeormInternalTracingSuppressed(context.active())) {
          return original.apply(this, args);
        }
        const connectionOptions = this?.connection?.options ?? {};
        const attributes: Record<string, any> = {
          [ATTR_DB_SYSTEM_NAME]: connectionOptions.type,
          [ATTR_SERVER_ADDRESS]: connectionOptions.host,
          [ATTR_SERVER_PORT]: connectionOptions.port,
          [ATTR_DB_NAMESPACE]: connectionOptions.database,
          [ATTR_DB_OPERATION_NAME]: opName,
          [ATTR_DB_QUERY_TEXT]: JSON.stringify(buildStatement(original, args)),
        };

        //ignore EntityMetadataNotFoundError
        try {
          if (this.metadata) {
            attributes[ATTR_DB_COLLECTION_NAME] = this.metadata.tableName;
          } else {
            const entity = args[0];
            const name =
              typeof entity === 'object' ? entity?.constructor?.name : entity;
            const metadata = this.connection.getMetadata(name);
            if (metadata?.tableName) {
              attributes[ATTR_DB_COLLECTION_NAME] = metadata.tableName;
            }
          }
        } catch {
          /* */
        }

        Object.entries(attributes).forEach(([key, value]) => {
          if (value === undefined) delete attributes[key];
        });

        const span: Span = self.tracer.startSpan(
          buildSpanName(opName, attributes[ATTR_DB_COLLECTION_NAME]),
          {
            kind: SpanKind.CLIENT,
            attributes,
          }
        );

        const contextWithSpan = trace.setSpan(context.active(), span);

        const traceContext = self.getConfig().enableInternalInstrumentation
          ? contextWithSpan
          : suppressTypeormInternalTracing(contextWithSpan);

        const contextWithSuppressTracing = self.getConfig()
          .suppressInternalInstrumentation
          ? suppressTracing(traceContext)
          : traceContext;

        return context.with(contextWithSuppressTracing, () =>
          self._endSpan(() => original.apply(this, args), span)
        );
      };
    };
  }

  private _patchQueryBuilder() {
    const self = this;
    return (original: Function) => {
      return function (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this: typeorm.SelectQueryBuilder<any>,
        ...args: unknown[]
      ) {
        if (isTypeormInternalTracingSuppressed(context.active())) {
          return original.apply(this, args);
        }
        const sql = this.getQuery();
        const parameters = this.getParameters();
        const mainTableName = this.getMainTableName();
        const operation = this.expressionMap.queryType;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connectionOptions: any = this.connection?.options;
        const attributes: Record<string, any> = {
          [ATTR_DB_SYSTEM_NAME]: connectionOptions.type,
          [ATTR_SERVER_ADDRESS]: connectionOptions.host,
          [ATTR_SERVER_PORT]: connectionOptions.port,
          [ATTR_DB_NAMESPACE]: connectionOptions.database,
          [ATTR_DB_OPERATION_NAME]: operation,
          [ATTR_DB_QUERY_TEXT]: sql,
          [ATTR_DB_COLLECTION_NAME]: mainTableName,
        };
        if (self.getConfig().enhancedDatabaseReporting) {
          try {
            attributes[ExtendedDatabaseAttribute.DB_STATEMENT_PARAMETERS] =
              JSON.stringify(parameters);
          } catch (err) {
            /* */
          }
        }
        const span: Span = self.tracer.startSpan(
          buildSpanName(operation, attributes[ATTR_DB_COLLECTION_NAME]),
          {
            kind: SpanKind.CLIENT,
            attributes,
          }
        );

        const contextWithSpan = trace.setSpan(context.active(), span);

        const traceContext = self.getConfig().enableInternalInstrumentation
          ? contextWithSpan
          : suppressTypeormInternalTracing(contextWithSpan);

        const contextWithSuppressTracing = self.getConfig()
          ?.suppressInternalInstrumentation
          ? suppressTracing(traceContext)
          : traceContext;

        return context.with(contextWithSuppressTracing, () =>
          self._endSpan(() => original.apply(this, args), span)
        );
      };
    };
  }

  private _patchRawQuery() {
    const self = this;
    return (original: Function) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function (this: any, ...args: unknown[]) {
        if (isTypeormInternalTracingSuppressed(context.active())) {
          return original.apply(this, args);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sql = args[0] as any;
        const operation = 'raw query';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const connectionOptions: any = this.options;
        const attributes = {
          [ATTR_DB_SYSTEM_NAME]: connectionOptions.type,
          [ATTR_SERVER_ADDRESS]: connectionOptions.host,
          [ATTR_SERVER_PORT]: connectionOptions.port,
          [ATTR_DB_NAMESPACE]: connectionOptions.database,
          [ATTR_DB_OPERATION_NAME]: operation,
          [ATTR_DB_QUERY_TEXT]: sql,
        };

        const span: Span = self.tracer.startSpan(operation, {
          kind: SpanKind.CLIENT,
          attributes,
        });

        const contextWithSpan = trace.setSpan(context.active(), span);

        const traceContext = self.getConfig().enableInternalInstrumentation
          ? contextWithSpan
          : suppressTypeormInternalTracing(contextWithSpan);

        const contextWithSuppressTracing = self.getConfig()
          ?.suppressInternalInstrumentation
          ? suppressTracing(traceContext)
          : traceContext;

        return context.with(contextWithSuppressTracing, () =>
          self._endSpan(() => original.apply(this, args), span)
        );
      };
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _endSpan(traced: any, span: Span) {
    const executeResponseHook = (response: unknown) => {
      const hook = this.getConfig().responseHook;
      if (hook !== undefined) {
        safeExecuteInTheMiddle(
          () => hook(span, { response }),
          e => {
            if (e) this._diag.error('responseHook error', e);
          },
          true
        );
      }
      return response;
    };
    try {
      const response = traced();
      if (util.types.isPromise(response)) {
        return Promise.resolve(response)
          .then(response => executeResponseHook(response))
          .catch(err => {
            if (err) {
              if (typeof err === 'string') {
                span.setStatus({ code: SpanStatusCode.ERROR, message: err });
              } else {
                span.recordException(err);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: err?.message,
                });
              }
            }
            throw err;
          })
          .finally(() => span.end());
      } else {
        span.end();
        return executeResponseHook(response);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
      span.end();
      throw error;
    }
  }
}

const buildStatement = (func: Function, args: any[]) => {
  const paramNames = getParamNames(func) || [];
  const statement: Record<string, any> = {};
  paramNames.forEach((pName, i) => {
    const value = args[i];
    if (!value) return;

    try {
      const stringified = JSON.stringify(value);
      if (stringified) {
        statement[pName] = args[i];
        return;
      }
    } catch (_err) {
      /* */
    }
    if (value?.name) {
      statement[pName] = value.name;
      return;
    }
    if (value?.constructor?.name) {
      statement[pName] = value.constructor.name;
    }
  });
  return statement;
};

function buildSpanName(operation: string, target: string | undefined): string {
  if (target !== undefined) {
    return `${operation} ${target}`;
  }

  return operation;
}
