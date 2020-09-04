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

export type Func<T> = (...args: unknown[]) => T;
export type MongoInternalCommand = {
  findandmodify: boolean;
  createIndexes: boolean;
  count: boolean;
  isprimary: boolean;
  indexes?: unknown[];
  query?: { [key: string]: unknown };
  q?: { [key: string]: unknown };
};

// https://github.com/mongodb/node-mongodb-native/blob/master/lib/topologies/server.js#L179
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
  IS_PRIMARY = 'isMaster',
  COUNT = 'count',
  UNKNOWN = 'unknown',
}
