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

import type * as pgTypes from 'pg';
import type * as pgPoolTypes from 'pg-pool';

export type PostgresCallback = (err: Error, res: object) => unknown;

// NB: this type describes the shape of a parsed, normalized form of the
// connection information that's stored inside each pg.Client instance. It's
// _not_ the same as the ConnectionConfig type exported from `@types/pg`. That
// type defines how data must be _passed in_ when creating a new `pg.Client`,
// which doesn't necessarily match the normalized internal form. E.g., a user
// can call `new Client({ connectionString: '...' }), but `connectionString`
// will never show up in the type below, because only the extracted host, port,
// etc. are recorded in this normalized config. The keys listed below are also
// incomplete, which is fine because the type is internal and these keys are the
// only ones our code is reading. See https://github.com/brianc/node-postgres/blob/fde5ec586e49258dfc4a2fcd861fcdecb4794fc3/lib/client.js#L25
export interface PgParsedConnectionParams {
  database?: string;
  host?: string;
  port?: number;
  user?: string;
}

export interface PgClientExtended extends pgTypes.Client {
  connectionParameters: PgParsedConnectionParams;
}

export type PgPoolCallback = (
  err: Error,
  client: any,
  done: (release?: any) => void
) => void;

export interface PgPoolOptionsParams {
  database: string;
  host: string;
  port: number;
  user: string;
  idleTimeoutMillis: number; // the minimum amount of time that an object may sit idle in the pool before it is eligible for eviction due to idle time
  maxClient: number; // maximum size of the pool
  connectionString?: string; // connection string if provided directly
}

export const EVENT_LISTENERS_SET = Symbol(
  'opentelemetry.instrumentation.pg.eventListenersSet'
);

export interface PgPoolExtended extends pgPoolTypes<pgTypes.Client> {
  options: PgPoolOptionsParams;
  [EVENT_LISTENERS_SET]?: boolean; // flag to identify if the event listeners for instrumentation have been set
}

export type PgClientConnect = (callback?: Function) => Promise<void> | void;
