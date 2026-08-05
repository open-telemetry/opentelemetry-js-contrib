/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
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
