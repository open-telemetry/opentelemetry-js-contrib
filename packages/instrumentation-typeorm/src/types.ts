/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
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
