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

import { DbSystemValues } from '@opentelemetry/semantic-conventions';

type Exception = {
  new (message: string): Exception;
  constructor: Exception;
  errno?: number;
  code?: string;
  stack?: string;
};

export const getFormatter = (runner: any) => {
  if (runner) {
    if (runner.client) {
      if (runner.client._formatQuery) {
        return runner.client._formatQuery.bind(runner.client);
      } else if (runner.client.SqlString) {
        return runner.client.SqlString.format.bind(runner.client.SqlString);
      }
    }
    if (runner.builder) {
      return runner.builder.toString.bind(runner.builder);
    }
  }
  return () => '<noop formatter>';
};

export const cloneErrorWithNewMessage = (err: Exception, message: string) => {
  if (err && err instanceof Error) {
    const clonedError = new (err.constructor as Exception)(message);
    clonedError.code = err.code;
    clonedError.stack = err.stack;
    clonedError.errno = err.errno;
    return clonedError;
  }
  return err;
};

const systemMap = new Map([
  ['sqlite3', DbSystemValues.SQLITE],
  ['pg', DbSystemValues.POSTGRESQL],
]);
export const mapSystem = (knexSystem: string) => {
  return systemMap.get(knexSystem) || knexSystem;
};

export const getName = (db: string, operation?: string, table?: string) => {
  if (operation) {
    if (table) {
      return `${operation} ${db}.${table}`;
    }
    return `${operation} ${db}`;
  }
  return db;
};

export const limitLength = (str: string, maxLength: number) => {
  if (
    typeof str === 'string' &&
    typeof maxLength === 'number' &&
    0 < maxLength &&
    maxLength < str.length
  ) {
    return str.substr(0, maxLength) + '..';
  }
  return str;
};
