import { Span, SpanKind, SpanStatusCode, trace, context, diag } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { ExtendedDatabaseAttribute, TypeormInstrumentationConfig } from './types';
import { getParamNames, isTypeormInternalTracingSuppressed, suppressTypeormInternalTracing } from './utils';
import { VERSION } from './version';
import type * as typeorm from 'typeorm';
import {
    InstrumentationBase,
    InstrumentationModuleDefinition,
    InstrumentationNodeModuleDefinition,
    InstrumentationNodeModuleFile,
    isWrapped,
    safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import isPromise from 'is-promise';

type SelectQueryBuilderMethods = keyof typeorm.SelectQueryBuilder<any>;
const selectQueryBuilderExecuteMethods: SelectQueryBuilderMethods[] = [
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
const functionsUsingEntityPersistExecutor: EntityManagerMethods[] = ['save', 'remove', 'softRemove', 'recover'];
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

export class TypeormInstrumentation extends InstrumentationBase<any> {
    protected override _config!: TypeormInstrumentationConfig;
    constructor(config: TypeormInstrumentationConfig = {}) {
        super('@opentelemetry/instrumentation-typeorm', VERSION, Object.assign({}, config));
    }

    protected init(): InstrumentationModuleDefinition<any> {
        const selectQueryBuilder = new InstrumentationNodeModuleFile<any>(
            'typeorm/query-builder/SelectQueryBuilder.js',
            ['>0.2.28'],
            (moduleExports, moduleVersion) => {
                selectQueryBuilderExecuteMethods.map((method) => {
                    if (isWrapped(moduleExports.SelectQueryBuilder.prototype?.[method])) {
                        this._unwrap(moduleExports.SelectQueryBuilder.prototype, method);
                    }
                    this._wrap(
                        moduleExports.SelectQueryBuilder.prototype,
                        method,
                        this._patchQueryBuilder(moduleVersion)
                    );
                });

                return moduleExports;
            },
            (moduleExports) => {
                selectQueryBuilderExecuteMethods.map((method) => {
                    if (isWrapped(moduleExports.SelectQueryBuilder.prototype?.[method])) {
                        this._unwrap(moduleExports.SelectQueryBuilder.prototype, method);
                    }
                });
                return moduleExports;
            }
        );

        const connection = new InstrumentationNodeModuleFile<any>(
            'typeorm/connection/Connection.js',
            ['>0.2.28 <0.3.0'],
            (moduleExports, moduleVersion) => {
                if (isWrapped(moduleExports.Connection.prototype?.[rawQueryFuncName])) {
                    this._unwrap(moduleExports.Connection.prototype, rawQueryFuncName);
                }
                this._wrap(moduleExports.Connection.prototype, rawQueryFuncName, this._patchRawQuery(moduleVersion));

                return moduleExports;
            },
            (moduleExports) => {
                if (isWrapped(moduleExports.Connection.prototype?.[rawQueryFuncName])) {
                    this._unwrap(moduleExports.Connection.prototype, rawQueryFuncName);
                }
                return moduleExports;
            }
        );

        const dataSource = new InstrumentationNodeModuleFile<any>(
            'typeorm/data-source/DataSource.js',
            ['>=0.3.0'],
            (moduleExports, moduleVersion) => {
                if (isWrapped(moduleExports.DataSource.prototype?.[rawQueryFuncName])) {
                    this._unwrap(moduleExports.DataSource.prototype, rawQueryFuncName);
                }
                this._wrap(moduleExports.DataSource.prototype, rawQueryFuncName, this._patchRawQuery(moduleVersion));

                return moduleExports;
            },
            (moduleExports) => {
                if (isWrapped(moduleExports.DataSource.prototype?.[rawQueryFuncName])) {
                    this._unwrap(moduleExports.DataSource.prototype, rawQueryFuncName);
                }
                return moduleExports;
            }
        );

        const entityManager = new InstrumentationNodeModuleFile<any>(
            'typeorm/entity-manager/EntityManager.js',
            ['>0.2.28'],
            (moduleExports, moduleVersion) => {
                entityManagerMethods.map((method) => {
                    if (isWrapped(moduleExports.EntityManager.prototype?.[method])) {
                        this._unwrap(moduleExports.EntityManager.prototype, method);
                    }
                    this._wrap(
                        moduleExports.EntityManager.prototype,
                        method,
                        this._patchEntityManagerFunction(method, moduleVersion)
                    );
                });

                return moduleExports;
            },
            (moduleExports) => {
                entityManagerMethods.map((method) => {
                    if (isWrapped(moduleExports.EntityManager.prototype?.[method])) {
                        this._unwrap(moduleExports.EntityManager.prototype, method);
                    }
                });
                return moduleExports;
            }
        );

        const module = new InstrumentationNodeModuleDefinition<any>('typeorm', ['>0.2.28'], null, null, [
            selectQueryBuilder,
            entityManager,
            connection,
            dataSource,
        ]);
        return module;
    }

    private _patchEntityManagerFunction(opName: string, moduleVersion?: string) {
        const self = this;
        diag.debug(`typeorm instrumentation: patched EntityManager ${opName} prototype`);
        return (original: any) => {
            return function (...args: any[]) {
                if (isTypeormInternalTracingSuppressed(context.active())) {
                    return original.apply(this, arguments);
                }
                const connectionOptions = this?.connection?.options ?? {};
                const attributes = {
                    [SemanticAttributes.DB_SYSTEM]: connectionOptions.type,
                    [SemanticAttributes.DB_USER]: connectionOptions.username,
                    [SemanticAttributes.NET_PEER_NAME]: connectionOptions.host,
                    [SemanticAttributes.NET_PEER_PORT]: connectionOptions.port,
                    [SemanticAttributes.DB_NAME]: connectionOptions.database,
                    [SemanticAttributes.DB_OPERATION]: opName,
                    [SemanticAttributes.DB_STATEMENT]: JSON.stringify(buildStatement(original, args)),
                };

                if (self._config.moduleVersionAttributeName && moduleVersion) {
                    attributes[self._config.moduleVersionAttributeName] = moduleVersion;
                }

                //ignore EntityMetadataNotFoundError
                try {
                    if (this.metadata) {
                        attributes[SemanticAttributes.DB_SQL_TABLE] = this.metadata.tableName;
                    } else {
                        const entity = args[0];
                        const name = typeof entity === 'object' ? entity?.constructor?.name : entity;
                        const metadata = this.connection.getMetadata(name);
                        if (metadata?.tableName) {
                            attributes[SemanticAttributes.DB_SQL_TABLE] = metadata.tableName;
                        }
                    }
                } catch {}

                Object.entries(attributes).forEach(([key, value]) => {
                    if (value === undefined) delete attributes[key];
                });

                const span: Span = self.tracer.startSpan(`TypeORM ${opName}`, {
                    kind: SpanKind.CLIENT,
                    attributes,
                });

                const contextWithSpan = trace.setSpan(context.active(), span);

                const traceContext = self._config.enableInternalInstrumentation
                    ? contextWithSpan
                    : suppressTypeormInternalTracing(contextWithSpan);

                const contextWithSuppressTracing = self._config.suppressInternalInstrumentation
                    ? suppressTracing(traceContext)
                    : traceContext;

                return context.with(contextWithSuppressTracing, () =>
                    self._endSpan(() => original.apply(this, arguments), span)
                );
            };
        };
    }

    private _patchQueryBuilder(moduleVersion: string) {
        const self = this;
        return (original: any) => {
            return function () {
                if (isTypeormInternalTracingSuppressed(context.active())) {
                    return original.apply(this, arguments);
                }
                const queryBuilder: typeorm.QueryBuilder<any> = this;
                const sql = queryBuilder.getQuery();
                const parameters = queryBuilder.getParameters();
                const mainTableName = this.getMainTableName();
                const operation = queryBuilder.expressionMap.queryType;
                const connectionOptions: any = queryBuilder?.connection?.options;
                const attributes = {
                    [SemanticAttributes.DB_SYSTEM]: connectionOptions.type,
                    [SemanticAttributes.DB_USER]: connectionOptions.username,
                    [SemanticAttributes.NET_PEER_NAME]: connectionOptions.host,
                    [SemanticAttributes.NET_PEER_PORT]: connectionOptions.port,
                    [SemanticAttributes.DB_NAME]: connectionOptions.database,
                    [SemanticAttributes.DB_OPERATION]: operation,
                    [SemanticAttributes.DB_STATEMENT]: sql,
                    [SemanticAttributes.DB_SQL_TABLE]: mainTableName,
                };
                if (self._config.collectParameters) {
                    try {
                        attributes[ExtendedDatabaseAttribute.DB_STATEMENT_PARAMETERS] = JSON.stringify(parameters);
                    } catch (err) {}
                }
                const span: Span = self.tracer.startSpan(`TypeORM ${operation} ${mainTableName}`, {
                    kind: SpanKind.CLIENT,
                    attributes,
                });

                const contextWithSpan = trace.setSpan(context.active(), span);

                const traceContext = self._config.enableInternalInstrumentation
                    ? contextWithSpan
                    : suppressTypeormInternalTracing(contextWithSpan);

                const contextWithSuppressTracing = self._config?.suppressInternalInstrumentation
                    ? suppressTracing(traceContext)
                    : traceContext;

                return context.with(contextWithSuppressTracing, () =>
                    self._endSpan(() => original.apply(this, arguments), span)
                );
            };
        };
    }

    private getOperationName(statement: string) {
        let operation = 'raw query';
        if (typeof statement === 'string') {
            statement = statement.trim();
            try {
                operation = statement.split(' ')[0].toUpperCase();
            } catch (e) {}
        }

        return operation;
    }

    private _patchRawQuery(moduleVersion: string) {
        const self = this;
        return (original: any) => {
            return function () {
                if (isTypeormInternalTracingSuppressed(context.active())) {
                    return original.apply(this, arguments);
                }
                const conn: typeorm.Connection = this;
                const sql = arguments[0];
                const operation = self.getOperationName(sql);
                const connectionOptions: any = conn.options;
                const attributes = {
                    [SemanticAttributes.DB_SYSTEM]: connectionOptions.type,
                    [SemanticAttributes.DB_USER]: connectionOptions.username,
                    [SemanticAttributes.NET_PEER_NAME]: connectionOptions.host,
                    [SemanticAttributes.NET_PEER_PORT]: connectionOptions.port,
                    [SemanticAttributes.DB_NAME]: connectionOptions.database,
                    [SemanticAttributes.DB_OPERATION]: operation,
                    [SemanticAttributes.DB_STATEMENT]: sql,
                };

                const span: Span = self.tracer.startSpan(`TypeORM ${operation}`, {
                    kind: SpanKind.CLIENT,
                    attributes,
                });

                const contextWithSpan = trace.setSpan(context.active(), span);

                const traceContext = self._config.enableInternalInstrumentation
                    ? contextWithSpan
                    : suppressTypeormInternalTracing(contextWithSpan);

                const contextWithSuppressTracing = self._config?.suppressInternalInstrumentation
                    ? suppressTracing(traceContext)
                    : traceContext;

                return context.with(contextWithSuppressTracing, () =>
                    self._endSpan(() => original.apply(this, arguments), span)
                );
            };
        };
    }

    private _endSpan(traced: any, span: Span) {
        const executeResponseHook = (response: any) => {
            if (this._config?.responseHook) {
                safeExecuteInTheMiddle(
                    () => this._config.responseHook(span, response),
                    (e: Error) => {
                        if (e) diag.error('typeorm instrumentation: responseHook error', e);
                    },
                    true
                );
            }
            return response;
        };
        try {
            const response = traced();
            if (isPromise(response)) {
                return Promise.resolve(response)
                    .then((response) => executeResponseHook(response))
                    .catch((err) => {
                        if (err) {
                            if (typeof err === 'string') {
                                span.setStatus({ code: SpanStatusCode.ERROR, message: err });
                            } else {
                                span.recordException(err);
                                span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
                            }
                        }
                        throw err;
                    })
                    .finally(() => span.end());
            } else {
                span.end();
                return executeResponseHook(response);
            }
        } catch (error: any) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
            span.end();
            throw error;
        }
    }
}

const buildStatement = (func: Function, args: any[]) => {
    const paramNames = getParamNames(func);
    const statement = {};
    paramNames.forEach((pName, i) => {
        const value = args[i];
        if (!value) return;

        try {
            const stringified = JSON.stringify(value);
            if (stringified) {
                statement[pName] = args[i];
                return;
            }
        } catch (err) {}
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
