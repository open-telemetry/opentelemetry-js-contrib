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
import * as mongoDBTypes from 'mongodb';

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

export interface MongoDB4InstrumentationConfig extends InstrumentationConfig {
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

export interface MongoResponseHookInformation {
  data: unknown;
}

// https://github.com/mongodb/node-mongodb-native/blob/v4.2.2/src/cmap/connection.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
export class Connection {
  command(
    ns: mongoDBTypes.MongoDBNamespace,
    cmd: Document,
    options: undefined | unknown,
    callback: mongoDBTypes.Callback<unknown>
  ): void {}
}
/* eslint-enable @typescript-eslint/no-unused-vars */

export type CommandResult = {
  result?: unknown;
  connection?: unknown;
  message?: unknown;
};
