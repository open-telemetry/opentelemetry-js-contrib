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

export interface MongoDBInstrumentationConfig extends InstrumentationConfig {
  /**
   * If true, additional information about query parameters and
   * results will be attached (as `attributes`) to spans representing
   * database operations.
   *
   * @default false
   */
  enhancedDatabaseReporting?: boolean;
}

export type Func<T> = (...args: unknown[]) => T;
export type MongoInternalCommand = {
  findandmodify: boolean;
  createIndexes: boolean;
  count: boolean;
  ismaster: boolean;
  indexes?: unknown[];
  query?: Record<string, unknown>;
  limit?: number;
  q?: Record<string, unknown>;
  u?: Record<string, unknown>;
};

export type CursorState = { cmd: MongoInternalCommand } & Record<
  string,
  unknown
>;

// https://github.com/mongodb/node-mongodb-native/blob/3.6/lib/core/wireprotocol/index.js
export type WireProtocolInternal = {
  insert: (
    server: MongoInternalTopology,
    ns: string,
    ops: unknown[],
    options: unknown | Function,
    callback?: Function
  ) => unknown;
  update: (
    server: MongoInternalTopology,
    ns: string,
    ops: unknown[],
    options: unknown | Function,
    callback?: Function
  ) => unknown;
  remove: (
    server: MongoInternalTopology,
    ns: string,
    ops: unknown[],
    options: unknown | Function,
    callback?: Function
  ) => unknown;
  killCursors: (
    server: MongoInternalTopology,
    ns: string,
    cursorState: CursorState,
    callback: Function
  ) => unknown;
  getMore: (
    server: MongoInternalTopology,
    ns: string,
    cursorState: CursorState,
    batchSize: number,
    options: unknown | Function,
    callback?: Function
  ) => unknown;
  query: (
    server: MongoInternalTopology,
    ns: string,
    cmd: MongoInternalCommand,
    cursorState: CursorState,
    options: unknown | Function,
    callback?: Function
  ) => unknown;
  command: (
    server: MongoInternalTopology,
    ns: string,
    cmd: MongoInternalCommand,
    options: unknown | Function,
    callback?: Function
  ) => unknown;
};

// https://github.com/mongodb/node-mongodb-native/blob/3.6/lib/topologies/server.js#L172
// https://github.com/mongodb/node-mongodb-native/blob/2.2/lib/server.js#L174
export type MongoInternalTopology = {
  s?: {
    // those are for mongodb@3
    options?: {
      host?: string;
      port?: number;
      servername?: string;
    };
    // those are for mongodb@2
    host?: string;
    port?: number;
  };
};

export enum MongodbCommandType {
  CREATE_INDEXES = 'createIndexes',
  FIND_AND_MODIFY = 'findAndModify',
  IS_MASTER = 'isMaster',
  COUNT = 'count',
  UNKNOWN = 'unknown',
}
