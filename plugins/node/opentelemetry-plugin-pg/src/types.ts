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

import { Span } from '@opentelemetry/api';
import { PluginConfig } from '@opentelemetry/core';

import * as pgTypes from 'pg';

export type PostgresCallback = (err: Error, res: object) => unknown;

// These are not included in @types/pg, so manually define them.
// https://github.com/brianc/node-postgres/blob/fde5ec586e49258dfc4a2fcd861fcdecb4794fc3/lib/client.js#L25
export interface PgClientConnectionParams {
  database: string;
  host: string;
  port: number;
  user: string;
}

export interface PgClientExtended extends pgTypes.Client {
  connectionParameters: PgClientConnectionParams;
}

// Interface name based on original driver implementation
// https://github.com/brianc/node-postgres/blob/2ef55503738eb2cbb6326744381a92c0bc0439ab/packages/pg/lib/utils.js#L157
export interface NormalizedQueryConfig extends pgTypes.QueryConfig {
  callback?: PostgresCallback;
}

export interface PostgresPostQueryHookFunction {
  (ctx: QueryContext): void;
}

export interface QueryContext {
  span: Span;
  query?: string;
  config?: NormalizedQueryConfig;
  params?: unknown[];
}

// Options available for the Postgres Plugin
export interface PostgresPluginConfig extends PluginConfig {
  postQueryHook?: PostgresPostQueryHookFunction;
}
