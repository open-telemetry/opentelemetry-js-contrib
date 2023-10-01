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
import type * as api from '@opentelemetry/api';

export interface GraphQLToolsExecutorInstrumentationExecutionResponseHook {
  (span: api.Span, data: any): void;
}

export interface GraphQLToolsExecutorInstrumentationConfig
  extends InstrumentationConfig {
  /**
   * When set to true it will not remove attributes values from schema source.
   * By default all values that can be sensitive are removed and replaced
   * with "*"
   *
   * @default false
   */
  allowValues?: boolean;

  /**
   * The maximum depth of fields/resolvers to instrument.
   * When set to 0 it will not instrument fields and resolvers
   *
   * @default undefined
   */
  depth?: number;

  /**
   * Don't create spans for the execution of the default resolver on object properties.
   *
   * When a resolver function is not defined on the schema for a field, graphql will
   * use the default resolver which just looks for a property with that name on the object.
   * If the property is not a function, it's not very interesting to trace.
   * This option can reduce noise and number of spans created.
   *
   * @default false
   */
  ignoreTrivialResolveSpans?: boolean;

  /**
   * Whether to merge list items into a single element.
   *
   * @example `users.*.name` instead of `users.0.name`, `users.1.name`
   *
   * @default false
   */
  mergeItems?: boolean;

  /**
   * Hook that allows adding custom span attributes based on the data
   * returned from "execute" GraphQL action.
   *
   * @param data - A GraphQL `ExecutionResult` object. For the exact type definitions, see the following:
   *  - {@linkcode https://github.com/graphql/graphql-js/blob/v14.7.0/src/execution/execute.js#L115 graphql@14}
   *  - {@linkcode https://github.com/graphql/graphql-js/blob/15.x.x/src/execution/execute.d.ts#L31 graphql@15}
   *  - {@linkcode https://github.com/graphql/graphql-js/blob/16.x.x/src/execution/execute.ts#L127 graphql@16}
   *
   * @default undefined
   */
  responseHook?: GraphQLToolsExecutorInstrumentationExecutionResponseHook;
}
