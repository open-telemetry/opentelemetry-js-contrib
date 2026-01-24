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
import type { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export enum ExtendedDatabaseAttribute {
  DB_STATEMENT_PARAMETERS = 'db.typeorm.parameters',
}

export interface HookInfo {
  response: any;
}

export type TypeormResponseCustomAttributesFunction = (
  span: Span,
  info: HookInfo
) => void;

export interface TypeormInstrumentationConfig extends InstrumentationConfig {
  /** hook for adding custom attributes using the response payload */
  responseHook?: TypeormResponseCustomAttributesFunction;
  /**
   * Typeorm operation use mongodb/postgres/mysql/mariadb/etc. under the hood.
   * If, for example, postgres instrumentation is enabled, a postgres operation will also create
   * a postgres span describing the communication.
   * Setting the `suppressInternalInstrumentation` config value to `true` will
   * cause the instrumentation to suppress instrumentation of underlying operations.
   */
  suppressInternalInstrumentation?: boolean;
  /** Some methods such as `getManyAndCount` can generate internally multiple spans.
   * To instrument those set this to `true`
   */
  enableInternalInstrumentation?: boolean;
  /** set to `true` if you want to capture the parameter values for parameterized SQL queries (**may leak sensitive information**) */
  enhancedDatabaseReporting?: boolean;
}
