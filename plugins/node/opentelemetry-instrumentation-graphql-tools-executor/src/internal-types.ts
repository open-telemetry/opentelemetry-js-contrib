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
import type { PromiseOrValue } from 'graphql/jsutils/PromiseOrValue';
import type * as executor from '@graphql-tools/executor';
import { GraphQLToolsExecutorInstrumentationConfig } from './types';
export type {
  executeArgumentsArray,
  OtelExecutionArgs,
  Maybe,
  GraphQLPath,
  OtelPatched,
  ObjectWithGraphQLData,
  GraphQLField,
} from '@opentelemetry/instrumentation-graphql/build/src/internal-types';
import type { Maybe } from '@opentelemetry/instrumentation-graphql/build/src/internal-types';
export { OPERATION_NOT_SUPPORTED } from '@opentelemetry/instrumentation-graphql/build/src/internal-types';

/**
 * Merged and parsed config of default instrumentation config and GraphQL
 */
export type GraphQLInstrumentationParsedConfig =
  Required<GraphQLToolsExecutorInstrumentationConfig> & InstrumentationConfig;

export type executeFunctionWithObj = (
  args: executor.ExecutionArgs
) => PromiseOrValue<executor.SingularExecutionResult>;

export type executeFunctionWithArgs = (
  schema: graphqlTypes.GraphQLSchema,
  document: graphqlTypes.DocumentNode,
  rootValue?: any,
  contextValue?: any,
  variableValues?: Maybe<{ [key: string]: any }>,
  operationName?: Maybe<string>,
  fieldResolver?: Maybe<graphqlTypes.GraphQLFieldResolver<any, any>>,
  typeResolver?: Maybe<graphqlTypes.GraphQLTypeResolver<any, any>>
) => PromiseOrValue<executor.SingularExecutionResult>;

export type executeType = executeFunctionWithObj | executeFunctionWithArgs;
