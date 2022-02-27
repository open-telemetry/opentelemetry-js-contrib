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

import { SpanAttributes } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type {
  ConnectionConfig,
  PoolActualConfig,
  Query,
  QueryOptions,
} from 'mysql';

/**
 * Get an SpanAttributes map from a mysql connection config object
 *
 * @param config ConnectionConfig
 */
export function getConnectionAttributes(
  config: ConnectionConfig | PoolActualConfig
): SpanAttributes {
  const { host, port, database, user } = getConfig(config);

  return {
    [SemanticAttributes.NET_PEER_NAME]: host,
    [SemanticAttributes.NET_PEER_PORT]: port,
    [SemanticAttributes.DB_CONNECTION_STRING]: getJDBCString(
      host,
      port,
      database
    ),
    [SemanticAttributes.DB_NAME]: database,
    [SemanticAttributes.DB_USER]: user,
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
  format: (
    sql: string,
    values: any[],
    stringifyObjects?: boolean,
    timeZone?: string
  ) => string,
  values?: any[]
): string {
  if (typeof query === 'string') {
    return values ? format(query, values) : query;
  } else {
    // According to https://github.com/mysqljs/mysql#performing-queries
    // The values argument will override the values in the option object.
    return values || query.values
      ? format(query.sql, values || query.values)
      : query.sql;
  }
}

/**
 * The span name SHOULD be set to a low cardinality value
 * representing the statement executed on the database.
 *
 * @returns SQL statement without variable arguments or SQL verb
 */
export function getSpanName(query: string | Query | QueryOptions): string {
  if (typeof query === 'object') {
    return query.sql;
  }
  return query.split(' ')[0];
}
