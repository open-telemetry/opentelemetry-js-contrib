/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export { MongodbCommandType } from './types';

export type Func<T> = (...args: unknown[]) => T;
export type MongoInternalCommand = {
  findandmodify: boolean;
  createIndexes: boolean;
  count: boolean;
  aggregate: boolean;
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

// https://github.com/mongodb/js-bson/blob/main/src/bson.ts
export type Document = {
  [key: string]: any;
};

// https://github.com/mongodb/node-mongodb-native/blob/v6.4.0/src/utils.ts#L281
export interface MongodbNamespace {
  db: string;
  collection?: string;
}

export type V4Connection = {
  command: Function;
  // From version 6.4.0 the method does not expect a callback and returns a promise
  // https://github.com/mongodb/node-mongodb-native/blob/v6.4.2/src/cmap/connection.ts
  commandPromise(
    ns: MongodbNamespace,
    cmd: Document,
    options: undefined | unknown,
    // From v6.6.0 we have this new param which is a constructor function
    // https://github.com/mongodb/node-mongodb-native/blob/v6.6.0/src/cmap/connection.ts#L588
    responseType: undefined | unknown
  ): Promise<any>;
  // Earlier versions expect a callback param and return void
  // https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/cmap/connection.ts
  commandCallback(
    ns: MongodbNamespace,
    cmd: Document,
    options: undefined | unknown,
    callback: any
  ): void;
};

// https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/cmap/connection_pool.ts
export type V4ConnectionPool = {
  // Instrumentation just cares about carrying the async context so
  // types of callback params are not needed
  checkOut: (callback: (error: any, connection: any) => void) => void;
};

export type V4Connect = {
  connect: Function;
  // From version 6.4.0 the method does not expect a callback and returns a promise
  // https://github.com/mongodb/node-mongodb-native/blob/v6.4.0/src/cmap/connect.ts
  connectPromise: (options: any) => Promise<any>;
  // Earlier versions expect a callback param and return void
  // https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/cmap/connect.ts
  connectCallback: (options: any, callback: any) => void;
};

// https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/sessions.ts
export type V4Session = {
  acquire: () => ServerSession;
  release: (session: ServerSession) => void;
};

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#replacer
 */
export type Replacer = (key: string, value: unknown) => unknown;
