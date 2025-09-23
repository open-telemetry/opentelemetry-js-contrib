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

import { Attributes } from '@opentelemetry/api';
import {
  ATTR_DB_CONNECTION_STRING,
  ATTR_DB_NAME,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from './semconv';
import type * as mysqlTypes from 'mysql2';
import { MySQL2InstrumentationQueryMaskingHook } from './types';

type formatType = typeof mysqlTypes.format;

/*
  Following types declare an expectation on mysql2 types and define a subset we
  use in the instrumentation of the types actually defined in mysql2 package

  We need to import them here so that the installing party of the instrumentation
  doesn't have to absolutely install the mysql2 package as well - specially
  important for auto-loaders and meta-packages.
*/
interface QueryOptions {
  sql: string;
  values?: any | any[] | { [param: string]: any };
}

interface Query {
  sql: string;
}

interface Config {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  connectionConfig?: Config;
}
/**
 * Get an Attributes map from a mysql connection config object
 *
 * @param config ConnectionConfig
 */
export function getConnectionAttributes(config: Config): Attributes {
  const { host, port, database, user } = getConfig(config);
  const portNumber = parseInt(port, 10);
  if (!isNaN(portNumber)) {
    return {
      [ATTR_NET_PEER_NAME]: host,
      [ATTR_NET_PEER_PORT]: portNumber,
      [ATTR_DB_CONNECTION_STRING]: getJDBCString(host, port, database),
      [ATTR_DB_NAME]: database,
      [ATTR_DB_USER]: user,
    };
  }
  return {
    [ATTR_NET_PEER_NAME]: host,
    [ATTR_DB_CONNECTION_STRING]: getJDBCString(host, port, database),
    [ATTR_DB_NAME]: database,
    [ATTR_DB_USER]: user,
  };
}

function getConfig(config: any) {
  const { host, port, database, user } =
    (config && config.connectionConfig) || config || {};
  return { host, port, database, user };
}

function getJDBCString(
  host: string | undefined,
  port: number | undefined,
  database: string | undefined
) {
  let jdbcString = `jdbc:mysql://${host || 'localhost'}`;

  if (typeof port === 'number') {
    jdbcString += `:${port}`;
  }

  if (typeof database === 'string') {
    jdbcString += `/${database}`;
  }

  return jdbcString;
}

/**
 * Conjures up the value for the db.statement attribute by formatting a SQL query.
 *
 * @returns the database statement being executed.
 */
export function getDbStatement(
  query: string | Query | QueryOptions,
  format?: formatType,
  values?: any[],
  maskStatement = false,
  maskStatementHook: MySQL2InstrumentationQueryMaskingHook = defaultMaskingHook
): string {
  const [querySql, queryValues] =
    typeof query === 'string'
      ? [query, values]
      : [query.sql, hasValues(query) ? values || query.values : values];
  try {
    if (maskStatement) {
      return maskStatementHook(querySql);
    } else if (format && queryValues) {
      return format(querySql, queryValues);
    } else {
      return querySql;
    }
  } catch (e) {
    return 'Could not determine the query due to an error in masking or formatting';
  }
}

/**
 * Replaces numeric values and quoted strings in the query with placeholders ('?').
 *
 * - `\b\d+\b`: Matches whole numbers (integers) and replaces them with '?'.
 * - `(["'])(?:(?=(\\?))\2.)*?\1`:
 *   - Matches quoted strings (both single `'` and double `"` quotes).
 *   - Uses a lookahead `(?=(\\?))` to detect an optional backslash without consuming it immediately.
 *   - Captures the optional backslash `\2` and ensures escaped quotes inside the string are handled correctly.
 *   - Ensures that only complete quoted strings are replaced with '?'.
 *
 * This prevents accidental replacement of escaped quotes within strings and ensures that the
 * query structure remains intact while masking sensitive data.
 */
function defaultMaskingHook(query: string): string {
  return query
    .replace(/\b\d+\b/g, '?')
    .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '?');
}

function hasValues(obj: Query | QueryOptions): obj is QueryOptions {
  return 'values' in obj;
}

/**
 * The span name SHOULD be set to a low cardinality value
 * representing the statement executed on the database.
 *
 * @returns SQL statement without variable arguments or SQL verb
 */
export function getSpanName(query: string | Query | QueryOptions): string {
  const rawQuery = typeof query === 'object' ? query.sql : query;
  // Extract the SQL verb
  const firstSpace = rawQuery?.indexOf(' ');
  if (typeof firstSpace === 'number' && firstSpace !== -1) {
    return rawQuery?.substring(0, firstSpace);
  }
  return rawQuery;
}

export const once = (fn: Function) => {
  let called = false;
  return (...args: unknown[]) => {
    if (called) return;
    called = true;
    return fn(...args);
  };
};

export function getConnectionPrototypeToInstrument(connection: any) {
  const connectionPrototype = connection.prototype;
  const basePrototype = Object.getPrototypeOf(connectionPrototype);

  // mysql2@3.11.5 included a refactoring, where most code was moved out of the `Connection` class and into a shared base
  // so we need to instrument that instead, see https://github.com/sidorares/node-mysql2/pull/3081
  // This checks if the functions we're instrumenting are there on the base - we cannot use the presence of a base
  // prototype since EventEmitter is the base for mysql2@<=3.11.4
  if (
    typeof basePrototype?.query === 'function' &&
    typeof basePrototype?.execute === 'function'
  ) {
    return basePrototype;
  }

  // otherwise instrument the connection directly.
  return connectionPrototype;
}
