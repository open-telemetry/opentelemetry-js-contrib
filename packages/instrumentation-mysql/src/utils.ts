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

import type { Pool, Query, QueryOptions } from 'mysql';
import { MySQLInstrumentationQueryMaskingHook } from './types';

export function getConfig(config: any) {
  const { host, port, database, user } =
    (config && config.connectionConfig) || config || {};
  return { host, port, database, user };
}

export function getJDBCString(
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
 * Conjures up the value for the db.query.text attribute.
 *
 * @returns the database query being executed, optionally masked.
 */
export function getDbQueryText(
  query: string | Query | QueryOptions,
  maskStatement = false,
  maskStatementHook: MySQLInstrumentationQueryMaskingHook = defaultMaskingHook
): string {
  const querySql = typeof query === 'string' ? query : query.sql;

  try {
    if (maskStatement) {
      return maskStatementHook(querySql);
    }
    return querySql;
  } catch (e) {
    return 'Could not determine the query due to an error in masking';
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

export function getDbValues(
  query: string | Query | QueryOptions,
  values?: any[]
): string {
  if (typeof query === 'string') {
    return arrayStringifyHelper(values);
  } else {
    // According to https://github.com/mysqljs/mysql#performing-queries
    // The values argument will override the values in the option object.
    return arrayStringifyHelper(values || query.values);
  }
}

/**
 * The span name SHOULD be set to a low cardinality value
 * representing the statement executed on the database.
 *
 * TODO: revisit span name based on https://github.com/open-telemetry/semantic-conventions/blob/v1.33.0/docs/database/database-spans.md#name
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

export function arrayStringifyHelper(arr: Array<unknown> | undefined): string {
  if (arr) return `[${arr.toString()}]`;
  return '';
}

export function getPoolNameOld(pool: Pool): string {
  const c = pool.config.connectionConfig;
  let poolName = '';
  poolName += c.host ? `host: '${c.host}', ` : '';
  poolName += c.port ? `port: ${c.port}, ` : '';
  poolName += c.database ? `database: '${c.database}', ` : '';
  poolName += c.user ? `user: '${c.user}'` : '';
  if (!c.user) {
    poolName = poolName.substring(0, poolName.length - 2); //omit last comma
  }
  return poolName.trim();
}
