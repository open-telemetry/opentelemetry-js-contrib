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
import { Span } from '@opentelemetry/api';

export interface MongoDBInstrumentationExecutionResponseHook {
  (span: Span, responseInfo: MongoResponseHookInformation): void;
}

/**
 * Function that can be used to serialize db.statement tag
 * @param cmd - MongoDB command object
 *
 * @returns serialized string that will be used as the db.statement attribute.
 */
export type DbStatementSerializer = (cmd: Record<string, unknown>) => string;

export interface MongoDBInstrumentationConfig extends InstrumentationConfig {
  /**
   * If true, additional information about query parameters and
   * results will be attached (as `attributes`) to spans representing
   * database operations.
   */
  enhancedDatabaseReporting?: boolean;

  /**
   * Hook that allows adding custom span attributes based on the data
   * returned from MongoDB actions.
   *
   * @default undefined
   */
  responseHook?: MongoDBInstrumentationExecutionResponseHook;

  /**
   * Custom serializer function for the db.statement tag
   */
  dbStatementSerializer?: DbStatementSerializer;
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

export type ServerSession = {
  id: any;
  lastUse: number;
  txnNumber: number;
  isDirty: boolean;
};

export type CursorState = { cmd: MongoInternalCommand } & Record<
  string,
  unknown
>;

export interface MongoResponseHookInformation {
  data: CommandResult;
}

// https://github.com/mongodb/node-mongodb-native/blob/3.6/lib/core/connection/command_result.js
export type CommandResult = {
  result?: unknown;
  connection?: unknown;
  message?: unknown;
};

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
  // mongodb@3 with useUnifiedTopology option
  description?: {
    address?: string;
  };
};

export enum MongodbCommandType {
  CREATE_INDEXES = 'createIndexes',
  FIND_AND_MODIFY = 'findAndModify',
  IS_MASTER = 'isMaster',
  COUNT = 'count',
  UNKNOWN = 'unknown',
}

// https://github.com/mongodb/js-bson/blob/main/src/bson.ts
export type Document = {
  [key: string]: any;
};

// https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/cmap/connection.ts
// From version 6.4.0 the method does not expect a callback and returns a promise
// this signature compacts both method signatures so it's not necessay to do extra
// type assertions in the instrumentation code
// https://github.com/mongodb/node-mongodb-native/blob/v6.4.2/src/cmap/connection.ts
export type V4Connection = {
  command(
    ns: any,
    cmd: Document,
    options: undefined | unknown,
    callback: any
  ): (void | Promise<any>);
};

// https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/cmap/connection_pool.ts
export type V4ConnectionPool = {
  // Instrumentation just cares about carrying the async context so
  // types of callback params are not needed
  checkOut: (callback: (error: any, connection: any) => void) => void;
};

// https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/cmap/connect.ts
// From version 6.4.0 the method does not expect a callback and returns a promise
// this signature compacts both method signatures so it's not necessay to do extra
// type assertions in the instrumentation code
// https://github.com/mongodb/node-mongodb-native/blob/v6.4.0/src/cmap/connect.ts
export type V4Connect = {
  connect: (options: any, callback: any) => (void | Promise<any>);
};

// https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/sessions.ts
export type V4Session = {
  acquire: () => ServerSession;
  release: (session: ServerSession) => void;
};
