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

import {
  context,
  trace,
  Span,
  SpanStatusCode,
  Tracer,
  SpanKind,
  diag,
  UpDownCounter,
} from '@opentelemetry/api';
import { AttributeNames } from './enums/AttributeNames';
import {
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_NAME,
  SEMATTRS_DB_CONNECTION_STRING,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
  SEMATTRS_DB_USER,
  SEMATTRS_DB_STATEMENT,
  DBSYSTEMVALUES_POSTGRESQL,
} from '@opentelemetry/semantic-conventions';
import {
  PgClientExtended,
  PostgresCallback,
  PgPoolCallback,
  PgPoolExtended,
  PgParsedConnectionParams,
  PgPoolOptionsParams,
} from './internal-types';
import { PgInstrumentationConfig } from './types';
import type * as pgTypes from 'pg';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { SpanNames } from './enums/SpanNames';

// TODO: Replace these constants once a new version of the semantic conventions
// package is created with https://github.com/open-telemetry/opentelemetry-js/pull/4891
const SEMATTRS_CLIENT_CONNECTION_POOL_NAME = 'db.client.connection.pool.name';
const SEMATTRS_CLIENT_CONNECTION_STATE = 'db.client.connection.state';

/**
 * Helper function to get a low cardinality span name from whatever info we have
 * about the query.
 *
 * This is tricky, because we don't have most of the information (table name,
 * operation name, etc) the spec recommends using to build a low-cardinality
 * value w/o parsing. So, we use db.name and assume that, if the query's a named
 * prepared statement, those `name` values will be low cardinality. If we don't
 * have a named prepared statement, we try to parse an operation (despite the
 * spec's warnings).
 *
 * @params dbName The name of the db against which this query is being issued,
 *   which could be missing if no db name was given at the time that the
 *   connection was established.
 * @params queryConfig Information we have about the query being issued, typed
 *   to reflect only the validation we've actually done on the args to
 *   `client.query()`. This will be undefined if `client.query()` was called
 *   with invalid arguments.
 */
export function getQuerySpanName(
  dbName: string | undefined,
  queryConfig?: { text: string; name?: unknown }
) {
  // NB: when the query config is invalid, we omit the dbName too, so that
  // someone (or some tool) reading the span name doesn't misinterpret the
  // dbName as being a prepared statement or sql commit name.
  if (!queryConfig) return SpanNames.QUERY_PREFIX;

  // Either the name of a prepared statement; or an attempted parse
  // of the SQL command, normalized to uppercase; or unknown.
  const command =
    typeof queryConfig.name === 'string' && queryConfig.name
      ? queryConfig.name
      : parseNormalizedOperationName(queryConfig.text);

  return `${SpanNames.QUERY_PREFIX}:${command}${dbName ? ` ${dbName}` : ''}`;
}

function parseNormalizedOperationName(queryText: string) {
  const indexOfFirstSpace = queryText.indexOf(' ');
  let sqlCommand =
    indexOfFirstSpace === -1
      ? queryText
      : queryText.slice(0, indexOfFirstSpace);
  sqlCommand = sqlCommand.toUpperCase();

  // Handle query text being "COMMIT;", which has an extra semicolon before the space.
  return sqlCommand.endsWith(';') ? sqlCommand.slice(0, -1) : sqlCommand;
}

export function getConnectionString(params: PgParsedConnectionParams) {
  const host = params.host || 'localhost';
  const port = params.port || 5432;
  const database = params.database || '';
  return `postgresql://${host}:${port}/${database}`;
}

function getPort(port: number | undefined): number | undefined {
  // Port may be NaN as parseInt() is used on the value, passing null will result in NaN being parsed.
  // https://github.com/brianc/node-postgres/blob/2a8efbee09a284be12748ed3962bc9b816965e36/packages/pg/lib/connection-parameters.js#L66
  if (Number.isInteger(port)) {
    return port;
  }

  // Unable to find the default used in pg code, so falling back to 'undefined'.
  return undefined;
}

export function getSemanticAttributesFromConnection(
  params: PgParsedConnectionParams
) {
  return {
    [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_POSTGRESQL,
    [SEMATTRS_DB_NAME]: params.database, // required
    [SEMATTRS_DB_CONNECTION_STRING]: getConnectionString(params), // required
    [SEMATTRS_NET_PEER_NAME]: params.host, // required
    [SEMATTRS_NET_PEER_PORT]: getPort(params.port),
    [SEMATTRS_DB_USER]: params.user,
  };
}

export function getSemanticAttributesFromPool(params: PgPoolOptionsParams) {
  return {
    [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_POSTGRESQL,
    [SEMATTRS_DB_NAME]: params.database, // required
    [SEMATTRS_DB_CONNECTION_STRING]: getConnectionString(params), // required
    [SEMATTRS_NET_PEER_NAME]: params.host, // required
    [SEMATTRS_NET_PEER_PORT]: getPort(params.port),
    [SEMATTRS_DB_USER]: params.user,
    [AttributeNames.IDLE_TIMEOUT_MILLIS]: params.idleTimeoutMillis,
    [AttributeNames.MAX_CLIENT]: params.maxClient,
  };
}

export function shouldSkipInstrumentation(
  instrumentationConfig: PgInstrumentationConfig
) {
  return (
    instrumentationConfig.requireParentSpan === true &&
    trace.getSpan(context.active()) === undefined
  );
}

// Create a span from our normalized queryConfig object,
// or return a basic span if no queryConfig was given/could be created.
export function handleConfigQuery(
  this: PgClientExtended,
  tracer: Tracer,
  instrumentationConfig: PgInstrumentationConfig,
  queryConfig?: { text: string; values?: unknown; name?: unknown }
) {
  // Create child span.
  const { connectionParameters } = this;
  const dbName = connectionParameters.database;

  const spanName = getQuerySpanName(dbName, queryConfig);
  const span = tracer.startSpan(spanName, {
    kind: SpanKind.CLIENT,
    attributes: getSemanticAttributesFromConnection(connectionParameters),
  });

  if (!queryConfig) {
    return span;
  }

  // Set attributes
  if (queryConfig.text) {
    span.setAttribute(SEMATTRS_DB_STATEMENT, queryConfig.text);
  }

  if (
    instrumentationConfig.enhancedDatabaseReporting &&
    Array.isArray(queryConfig.values)
  ) {
    try {
      const convertedValues = queryConfig.values.map(value => {
        if (value == null) {
          return 'null';
        } else if (value instanceof Buffer) {
          return value.toString();
        } else if (typeof value === 'object') {
          if (typeof value.toPostgres === 'function') {
            return value.toPostgres();
          }
          return JSON.stringify(value);
        } else {
          //string, number
          return value.toString();
        }
      });
      span.setAttribute(AttributeNames.PG_VALUES, convertedValues);
    } catch (e) {
      diag.error('failed to stringify ', queryConfig.values, e);
    }
  }

  // Set plan name attribute, if present
  if (typeof queryConfig.name === 'string') {
    span.setAttribute(AttributeNames.PG_PLAN, queryConfig.name);
  }

  return span;
}

export function handleExecutionResult(
  config: PgInstrumentationConfig,
  span: Span,
  pgResult: pgTypes.QueryResult | pgTypes.QueryArrayResult | unknown
) {
  if (typeof config.responseHook === 'function') {
    safeExecuteInTheMiddle(
      () => {
        config.responseHook!(span, {
          data: pgResult as pgTypes.QueryResult | pgTypes.QueryArrayResult,
        });
      },
      err => {
        if (err) {
          diag.error('Error running response hook', err);
        }
      },
      true
    );
  }
}

export function patchCallback(
  instrumentationConfig: PgInstrumentationConfig,
  span: Span,
  cb: PostgresCallback
): PostgresCallback {
  return function patchedCallback(
    this: PgClientExtended,
    err: Error,
    res: object
  ) {
    if (err) {
      // span.recordException(err);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message,
      });
    } else {
      handleExecutionResult(instrumentationConfig, span, res);
    }

    span.end();
    cb.call(this, err, res);
  };
}

export function getPoolName(pool: PgPoolOptionsParams): string {
  let poolName = '';
  poolName += pool?.host ? `${pool.host}:` : 'unknown_host';
  poolName += pool?.port ? `${pool.port}/` : 'unknown_port';
  poolName += pool?.database ? `${pool.database}` : 'unknown_database';

  return poolName.trim();
}

export interface poolConnectionsCounter {
  used: number;
  idle: number;
  pending: number;
}

export function updateCounter(
  pool: PgPoolExtended,
  connectionCount: UpDownCounter,
  connectionPendingRequests: UpDownCounter,
  latestCounter: poolConnectionsCounter
): poolConnectionsCounter {
  const poolName = getPoolName(pool.options);
  const all = pool.totalCount;
  const pending = pool.waitingCount;
  const idle = pool.idleCount;
  const used = all - idle;

  connectionCount.add(used - latestCounter.used, {
    [SEMATTRS_CLIENT_CONNECTION_STATE]: 'used',
    [SEMATTRS_CLIENT_CONNECTION_POOL_NAME]: poolName,
  });

  connectionCount.add(idle - latestCounter.idle, {
    [SEMATTRS_CLIENT_CONNECTION_STATE]: 'idle',
    [SEMATTRS_CLIENT_CONNECTION_POOL_NAME]: poolName,
  });

  connectionPendingRequests.add(pending - latestCounter.pending, {
    [SEMATTRS_CLIENT_CONNECTION_POOL_NAME]: poolName,
  });

  return { used: used, idle: idle, pending: pending };
}

export function patchCallbackPGPool(
  span: Span,
  cb: PgPoolCallback
): PgPoolCallback {
  return function patchedCallback(
    this: PgPoolExtended,
    err: Error,
    res: object,
    done: any
  ) {
    if (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message,
      });
    }
    span.end();
    cb.call(this, err, res, done);
  };
}

export function patchClientConnectCallback(span: Span, cb: Function): Function {
  return function patchedClientConnectCallback(
    this: pgTypes.Client,
    err: Error
  ) {
    if (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message,
      });
    }
    span.end();
    cb.apply(this, arguments);
  };
}

/**
 * Attempt to get a message string from a thrown value, while being quite
 * defensive, to recognize the fact that, in JS, any kind of value (even
 * primitives) can be thrown.
 */
export function getErrorMessage(e: unknown) {
  return typeof e === 'object' && e !== null && 'message' in e
    ? String((e as { message?: unknown }).message)
    : undefined;
}

export function isObjectWithTextString(it: unknown): it is ObjectWithText {
  return (
    typeof it === 'object' &&
    typeof (it as null | { text?: unknown })?.text === 'string'
  );
}

export type ObjectWithText = {
  text: string;
  [k: string]: unknown;
};
