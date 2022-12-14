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

import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type * as graphqlTypes from 'graphql';
import type * as api from '@opentelemetry/api';
import type { PromiseOrValue } from 'graphql/jsutils/PromiseOrValue';
import { DocumentNode } from 'graphql/language/ast';
import {
  GraphQLFieldResolver,
  GraphQLTypeResolver,
} from 'graphql/type/definition';
import { OTEL_GRAPHQL_DATA_SYMBOL, OTEL_PATCHED_SYMBOL } from './symbols';
import { GraphQLInstrumentationConfig } from './types';

export const OPERATION_NOT_SUPPORTED =
  'Operation$operationName$not' + ' supported';

/**
 * Merged and parsed config of default instrumentation config and GraphQL
 */
export type GraphQLInstrumentationParsedConfig =
  Required<GraphQLInstrumentationConfig> & InstrumentationConfig;

export type executeFunctionWithObj = (
  args: graphqlTypes.ExecutionArgs
) => PromiseOrValue<graphqlTypes.ExecutionResult>;

export type executeArgumentsArray = [
  graphqlTypes.GraphQLSchema,
  graphqlTypes.DocumentNode,
  any,
  any,
  Maybe<{ [key: string]: any }>,
  Maybe<string>,
  Maybe<graphqlTypes.GraphQLFieldResolver<any, any>>,
  Maybe<graphqlTypes.GraphQLTypeResolver<any, any>>
];

export type executeFunctionWithArgs = (
  schema: graphqlTypes.GraphQLSchema,
  document: graphqlTypes.DocumentNode,
  rootValue?: any,
  contextValue?: any,
  variableValues?: Maybe<{ [key: string]: any }>,
  operationName?: Maybe<string>,
  fieldResolver?: Maybe<graphqlTypes.GraphQLFieldResolver<any, any>>,
  typeResolver?: Maybe<graphqlTypes.GraphQLTypeResolver<any, any>>
) => PromiseOrValue<graphqlTypes.ExecutionResult>;

export interface OtelExecutionArgs {
  schema: graphqlTypes.GraphQLSchema;
  document: DocumentNode & ObjectWithGraphQLData;
  rootValue?: any;
  contextValue?: any & ObjectWithGraphQLData;
  variableValues?: Maybe<{ [key: string]: any }>;
  operationName?: Maybe<string>;
  fieldResolver?: Maybe<GraphQLFieldResolver<any, any> & OtelPatched>;
  typeResolver?: Maybe<GraphQLTypeResolver<any, any>>;
}

export type executeType = executeFunctionWithObj | executeFunctionWithArgs;

export type parseType = (
  source: string | graphqlTypes.Source,
  options?: graphqlTypes.ParseOptions
) => graphqlTypes.DocumentNode;

export type validateType = (
  schema: graphqlTypes.GraphQLSchema,
  documentAST: graphqlTypes.DocumentNode,
  rules?: ReadonlyArray<graphqlTypes.ValidationRule>,
  options?: { maxErrors?: number },
  typeInfo?: graphqlTypes.TypeInfo
) => ReadonlyArray<graphqlTypes.GraphQLError>;

export interface GraphQLField {
  parent: api.Span;
  span: api.Span;
  error: Error | null;
}

interface OtelGraphQLData {
  source?: any;
  span: api.Span;
  fields: { [key: string]: GraphQLField };
}

export interface ObjectWithGraphQLData {
  [OTEL_GRAPHQL_DATA_SYMBOL]?: OtelGraphQLData;
}

export interface OtelPatched {
  [OTEL_PATCHED_SYMBOL]?: boolean;
}

export interface GraphQLPath {
  prev: GraphQLPath | undefined;
  key: string | number;
  /**
   * optional as it didn't exist yet in ver 14
   */
  typename?: string | undefined;
}

/**
 * Moving this type from ver 15 of graphql as it is nto available in ver. 14s
 * this way it can compile against ver 14.
 */
export type Maybe<T> = null | undefined | T;
