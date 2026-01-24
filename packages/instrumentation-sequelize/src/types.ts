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

import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface SequelizeQueryHookParams {
  /** The type of sql parameter depends on the database dialect. */
  sql: string | { query: string; values: unknown[] };
  /** The type of option parameter depends on the database dialect. */
  option: any;
}

export type SequelizeQueryHook<T = SequelizeQueryHookParams> = (
  span: Span,
  params: T
) => void;

export type SequelizeResponseCustomAttributesFunction = (
  span: Span,
  response: any
) => void;

export interface SequelizeInstrumentationConfig extends InstrumentationConfig {
  /** Hook for adding custom attributes using the query */
  queryHook?: SequelizeQueryHook;
  /** Hook for adding custom attributes using the response payload */
  responseHook?: SequelizeResponseCustomAttributesFunction;
  /** Set to true if you only want to trace operation which has parent spans */
  ignoreOrphanedSpans?: boolean;
  /**
   * Sequelize operation use postgres/mysql/mariadb/etc. under the hood.
   * If, for example, postgres instrumentation is enabled, a postgres operation will also create
   * a postgres span describing the communication.
   * Setting the `suppressInternalInstrumentation` config value to `true` will
   * cause the instrumentation to suppress instrumentation of underlying operations.
   */
  suppressInternalInstrumentation?: boolean;
}
