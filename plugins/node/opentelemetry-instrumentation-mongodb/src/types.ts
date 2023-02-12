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
import { ServerSession } from './internal-types';

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

export interface MongoResponseHookInformation {
  data: CommandResult;
}

// https://github.com/mongodb/node-mongodb-native/blob/3.6/lib/core/connection/command_result.js
export type CommandResult = {
  result?: unknown;
  connection?: unknown;
  message?: unknown;
};

export enum MongodbCommandType {
  CREATE_INDEXES = 'createIndexes',
  FIND_AND_MODIFY = 'findAndModify',
  IS_MASTER = 'isMaster',
  COUNT = 'count',
  UNKNOWN = 'unknown',
}

// https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/cmap/connection.ts
export type V4Connection = {
  id: number | '<monitor>';
  command(
    ns: any,
    cmd: Document,
    options: undefined | unknown,
    callback: any
  ): void;
};

// https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/cmap/connect.ts
export type V4Connect = {
  connect: (options: any, callback: any) => void;
};

// https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/sessions.ts
export type V4Session = {
  acquire: () => ServerSession;
  release: (session: ServerSession) => void;
};
