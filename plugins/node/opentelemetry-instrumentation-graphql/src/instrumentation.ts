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

import { context, trace } from '@opentelemetry/api';
import {
  isWrapped,
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import type * as graphqlTypes from 'graphql';
import { SpanNames } from './enum';
import { AttributeNames } from './enums/AttributeNames';
import { OTEL_GRAPHQL_DATA_SYMBOL } from './symbols';

import {
  executeFunctionWithObj,
  executeArgumentsArray,
  executeType,
  parseType,
  validateType,
  GraphQLInstrumentationParsedConfig,
  OtelExecutionArgs,
  ObjectWithGraphQLData,
  OPERATION_NOT_SUPPORTED,
  Maybe,
} from './internal-types';
import {
  addInputVariableAttributes,
  addSpanSource,
  endSpan,
  getOperation,
  isPromise,
  wrapFieldResolver,
  wrapFields,
} from './utils';

import { VERSION } from './version';
import * as api from '@opentelemetry/api';
import type { PromiseOrValue } from 'graphql/jsutils/PromiseOrValue';
import { GraphQLInstrumentationConfig } from './types';

const DEFAULT_CONFIG: GraphQLInstrumentationConfig = {
  mergeItems: false,
  depth: -1,
  allowValues: false,
  ignoreResolveSpans: false,
};

const supportedVersions = ['>=14 <17'];

export class GraphQLInstrumentation extends InstrumentationBase {
  constructor(
    config: GraphQLInstrumentationConfig & InstrumentationConfig = {}
  ) {
    super(
      '@opentelemetry/instrumentation-graphql',
      VERSION,
      Object.assign({}, DEFAULT_CONFIG, config)
    );
  }

  private _getConfig(): GraphQLInstrumentationParsedConfig {
    return this._config as GraphQLInstrumentationParsedConfig;
  }

  override setConfig(config: GraphQLInstrumentationConfig = {}) {
    this._config = Object.assign({}, DEFAULT_CONFIG, config);
  }

  protected init() {
    const module = new InstrumentationNodeModuleDefinition(
      'graphql',
      supportedVersions
    );
    module.files.push(this._addPatchingExecute());
    module.files.push(this._addPatchingParser());
    module.files.push(this._addPatchingValidate());

    return module;
  }

  private _addPatchingExecute(): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      'graphql/execution/execute.js',
      supportedVersions,
      // cannot make it work with appropriate type as execute function has 2
      //types and/cannot import function but only types
      (moduleExports: any, moduleVersion) => {
        this._diag.debug(`Applying patch for graphql@${moduleVersion} execute`);
        if (isWrapped(moduleExports.execute)) {
          this._unwrap(moduleExports, 'execute');
        }
        this._wrap(
          moduleExports,
          'execute',
          this._patchExecute(moduleExports.defaultFieldResolver)
        );
        return moduleExports;
      },
      (moduleExports, moduleVersion) => {
        if (moduleExports) {
          this._diag.debug(
            `Removing patch for graphql@${moduleVersion} execute`
          );
          this._unwrap(moduleExports, 'execute');
        }
      }
    );
  }

  private _addPatchingParser(): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      'graphql/language/parser.js',
      supportedVersions,
      (moduleExports: typeof graphqlTypes, moduleVersion) => {
        this._diag.debug(`Applying patch for graphql@${moduleVersion} parse`);
        if (isWrapped(moduleExports.parse)) {
          this._unwrap(moduleExports, 'parse');
        }
        this._wrap(moduleExports, 'parse', this._patchParse());
        return moduleExports;
      },
      (moduleExports: typeof graphqlTypes, moduleVersion) => {
        if (moduleExports) {
          this._diag.debug(`Removing patch for graphql@${moduleVersion} parse`);
          this._unwrap(moduleExports, 'parse');
        }
      }
    );
  }

  private _addPatchingValidate(): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      'graphql/validation/validate.js',
      supportedVersions,
      (moduleExports, moduleVersion) => {
        this._diag.debug(
          `Applying patch for graphql@${moduleVersion} validate`
        );
        if (isWrapped(moduleExports.validate)) {
          this._unwrap(moduleExports, 'validate');
        }
        this._wrap(moduleExports, 'validate', this._patchValidate());
        return moduleExports;
      },
      (moduleExports, moduleVersion) => {
        if (moduleExports) {
          this._diag.debug(
            `Removing patch for graphql@${moduleVersion} validate`
          );
          this._unwrap(moduleExports, 'validate');
        }
      }
    );
  }

  private _patchExecute(
    defaultFieldResolved: graphqlTypes.GraphQLFieldResolver<any, any>
  ): (original: executeType) => executeType {
    const instrumentation = this;
    return function execute(original) {
      return function patchExecute(
        this: executeType
      ): PromiseOrValue<graphqlTypes.ExecutionResult> {
        let processedArgs: OtelExecutionArgs;

        // case when apollo server is used for example
        if (arguments.length >= 2) {
          const args = arguments as unknown as executeArgumentsArray;
          processedArgs = instrumentation._wrapExecuteArgs(
            args[0],
            args[1],
            args[2],
            args[3],
            args[4],
            args[5],
            args[6],
            args[7],
            defaultFieldResolved
          );
        } else {
          const args = arguments[0] as graphqlTypes.ExecutionArgs;
          processedArgs = instrumentation._wrapExecuteArgs(
            args.schema,
            args.document,
            args.rootValue,
            args.contextValue,
            args.variableValues,
            args.operationName,
            args.fieldResolver,
            args.typeResolver,
            defaultFieldResolved
          );
        }

        const operation = getOperation(
          processedArgs.document,
          processedArgs.operationName
        );

        const span = instrumentation._createExecuteSpan(
          operation,
          processedArgs
        );

        processedArgs.contextValue[OTEL_GRAPHQL_DATA_SYMBOL] = {
          source: processedArgs.document
            ? processedArgs.document ||
              (processedArgs.document as ObjectWithGraphQLData)[
                OTEL_GRAPHQL_DATA_SYMBOL
              ]
            : undefined,
          span,
          fields: {},
        };

        return context.with(trace.setSpan(context.active(), span), () => {
          return safeExecuteInTheMiddle<
            PromiseOrValue<graphqlTypes.ExecutionResult>
          >(
            () => {
              return (original as executeFunctionWithObj).apply(this, [
                processedArgs,
              ]);
            },
            (err, result) => {
              instrumentation._handleExecutionResult(span, err, result);
            }
          );
        });
      };
    };
  }

  private _handleExecutionResult(
    span: api.Span,
    err?: Error,
    result?: PromiseOrValue<graphqlTypes.ExecutionResult>
  ) {
    const config = this._getConfig();
    if (result === undefined || err) {
      endSpan(span, err);
      return;
    }

    if (isPromise(result)) {
      (result as Promise<graphqlTypes.ExecutionResult>).then(
        resultData => {
          if (typeof config.responseHook !== 'function') {
            endSpan(span);
            return;
          }
          this._executeResponseHook(span, resultData);
        },
        error => {
          endSpan(span, error);
        }
      );
    } else {
      if (typeof config.responseHook !== 'function') {
        endSpan(span);
        return;
      }
      this._executeResponseHook(span, result as graphqlTypes.ExecutionResult);
    }
  }

  private _executeResponseHook(
    span: api.Span,
    result: graphqlTypes.ExecutionResult
  ) {
    const config = this._getConfig();
    safeExecuteInTheMiddle(
      () => {
        config.responseHook(span, result);
      },
      err => {
        if (err) {
          this._diag.error('Error running response hook', err);
        }

        endSpan(span, undefined);
      },
      true
    );
  }

  private _patchParse(): (original: parseType) => parseType {
    const instrumentation = this;
    return function parse(original) {
      return function patchParse(
        this: parseType,
        source: string | graphqlTypes.Source,
        options?: graphqlTypes.ParseOptions
      ): graphqlTypes.DocumentNode {
        return instrumentation._parse(this, original, source, options);
      };
    };
  }

  private _patchValidate(): (original: validateType) => validateType {
    const instrumentation = this;
    return function validate(original: validateType) {
      return function patchValidate(
        this: validateType,
        schema: graphqlTypes.GraphQLSchema,
        documentAST: graphqlTypes.DocumentNode,
        rules?: ReadonlyArray<graphqlTypes.ValidationRule>,
        options?: { maxErrors?: number },
        typeInfo?: graphqlTypes.TypeInfo
      ): ReadonlyArray<graphqlTypes.GraphQLError> {
        return instrumentation._validate(
          this,
          original,
          schema,
          documentAST,
          rules,
          typeInfo,
          options
        );
      };
    };
  }

  private _parse(
    obj: parseType,
    original: parseType,
    source: string | graphqlTypes.Source,
    options?: graphqlTypes.ParseOptions
  ): graphqlTypes.DocumentNode {
    const config = this._getConfig();
    const span = this.tracer.startSpan(SpanNames.PARSE);

    return context.with(trace.setSpan(context.active(), span), () => {
      return safeExecuteInTheMiddle<
        graphqlTypes.DocumentNode & ObjectWithGraphQLData
      >(
        () => {
          return original.call(obj, source, options);
        },
        (err, result) => {
          if (result) {
            const operation = getOperation(result);
            if (!operation) {
              span.updateName(SpanNames.SCHEMA_PARSE);
            } else if (result.loc) {
              addSpanSource(span, result.loc, config.allowValues);
            }
          }
          endSpan(span, err);
        }
      );
    });
  }

  private _validate(
    obj: validateType,
    original: validateType,
    schema: graphqlTypes.GraphQLSchema,
    documentAST: graphqlTypes.DocumentNode,
    rules?: ReadonlyArray<graphqlTypes.ValidationRule>,
    typeInfo?: graphqlTypes.TypeInfo,
    options?: { maxErrors?: number }
  ): ReadonlyArray<graphqlTypes.GraphQLError> {
    const span = this.tracer.startSpan(SpanNames.VALIDATE, {});

    return context.with(trace.setSpan(context.active(), span), () => {
      return safeExecuteInTheMiddle<ReadonlyArray<graphqlTypes.GraphQLError>>(
        () => {
          return original.call(
            obj,
            schema,
            documentAST,
            rules,
            options,
            typeInfo
          );
        },
        (err, errors) => {
          if (!documentAST.loc) {
            span.updateName(SpanNames.SCHEMA_VALIDATE);
          }
          if (errors && errors.length) {
            span.recordException({
              name: AttributeNames.ERROR_VALIDATION_NAME,
              message: JSON.stringify(errors),
            });
          }
          endSpan(span, err);
        }
      );
    });
  }

  private _createExecuteSpan(
    operation: graphqlTypes.DefinitionNode | undefined,
    processedArgs: graphqlTypes.ExecutionArgs
  ): api.Span {
    const config = this._getConfig();

    const span = this.tracer.startSpan(SpanNames.EXECUTE, {});
    if (operation) {
      const { operation: operationType, name: nameNode } =
        operation as graphqlTypes.OperationDefinitionNode;

      span.setAttribute(AttributeNames.OPERATION_TYPE, operationType);

      const operationName = nameNode?.value;

      // https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/instrumentation/graphql/
      // > The span name MUST be of the format <graphql.operation.type> <graphql.operation.name> provided that graphql.operation.type and graphql.operation.name are available.
      // > If graphql.operation.name is not available, the span SHOULD be named <graphql.operation.type>.
      if (operationName) {
        span.setAttribute(AttributeNames.OPERATION_NAME, operationName);
        span.updateName(`${operationType} ${operationName}`);
      } else {
        span.updateName(operationType);
      }
    } else {
      let operationName = ' ';
      if (processedArgs.operationName) {
        operationName = ` "${processedArgs.operationName}" `;
      }
      operationName = OPERATION_NOT_SUPPORTED.replace(
        '$operationName$',
        operationName
      );
      span.setAttribute(AttributeNames.OPERATION_NAME, operationName);
    }

    if (processedArgs.document?.loc) {
      addSpanSource(span, processedArgs.document.loc, config.allowValues);
    }

    if (processedArgs.variableValues && config.allowValues) {
      addInputVariableAttributes(span, processedArgs.variableValues);
    }

    return span;
  }

  private _wrapExecuteArgs(
    schema: graphqlTypes.GraphQLSchema,
    document: graphqlTypes.DocumentNode,
    rootValue: any,
    contextValue: any,
    variableValues: Maybe<{ [key: string]: any }>,
    operationName: Maybe<string>,
    fieldResolver: Maybe<graphqlTypes.GraphQLFieldResolver<any, any>>,
    typeResolver: Maybe<graphqlTypes.GraphQLTypeResolver<any, any>>,
    defaultFieldResolved: graphqlTypes.GraphQLFieldResolver<any, any>
  ): OtelExecutionArgs {
    if (!contextValue) {
      contextValue = {};
    }

    if (
      contextValue[OTEL_GRAPHQL_DATA_SYMBOL] ||
      this._getConfig().ignoreResolveSpans
    ) {
      return {
        schema,
        document,
        rootValue,
        contextValue,
        variableValues,
        operationName,
        fieldResolver,
        typeResolver,
      };
    }

    const isUsingDefaultResolver = fieldResolver == null;
    // follows graphql implementation here:
    // https://github.com/graphql/graphql-js/blob/0b7daed9811731362c71900e12e5ea0d1ecc7f1f/src/execution/execute.ts#L494
    const fieldResolverForExecute = fieldResolver ?? defaultFieldResolved;
    fieldResolver = wrapFieldResolver(
      this.tracer,
      this._getConfig.bind(this),
      fieldResolverForExecute,
      isUsingDefaultResolver
    );

    if (schema) {
      wrapFields(
        schema.getQueryType(),
        this.tracer,
        this._getConfig.bind(this)
      );
      wrapFields(
        schema.getMutationType(),
        this.tracer,
        this._getConfig.bind(this)
      );
    }

    return {
      schema,
      document,
      rootValue,
      contextValue,
      variableValues,
      operationName,
      fieldResolver,
      typeResolver,
    };
  }
}
