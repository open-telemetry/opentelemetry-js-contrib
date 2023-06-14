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
  defaultTextMapSetter,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AttributeNames } from './enums/AttributeNames';
import {
  SemanticAttributes,
  DbSystemValues,
} from '@opentelemetry/semantic-conventions';
import {
  PgClientExtended,
  PostgresCallback,
  PgPoolCallback,
  PgPoolExtended,
  PgParsedConnectionParams,
} from './internal-types';
import { PgInstrumentationConfig } from './types';
import type * as pgTypes from 'pg';
import { PgInstrumentation } from './';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';

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
  if (!queryConfig) return PgInstrumentation.BASE_SPAN_NAME;

  // Either the name of a prepared statement; or an attempted parse
  // of the SQL command, normalized to uppercase; or unknown.
  const command =
    typeof queryConfig.name === 'string' && queryConfig.name
      ? queryConfig.name
      : parseNormalizedOperationName(queryConfig.text);

  return `${command}${
    dbName ? ` ${dbName}` : ''
  }`;
}

function parseNormalizedOperationName(queryText: string) {
  const sqlCommand = queryText.split(' ')[0].toUpperCase();

  // Handle query text being "COMMIT;", which has an extra semicolon before the space.
  return sqlCommand.endsWith(';') ? sqlCommand.slice(0, -1) : sqlCommand;
}

export function getConnectionString(params: PgParsedConnectionParams) {
  const host = params.host || 'localhost';
  const port = params.port || 5432;
  const database = params.database || '';
  return `postgresql://${host}:${port}/${database}`;
}

export function getSemanticAttributesFromConnection(
  params: PgParsedConnectionParams
) {
  return {
    [SemanticAttributes.DB_NAME]: params.database, // required
    [SemanticAttributes.DB_CONNECTION_STRING]: getConnectionString(params), // required
    [SemanticAttributes.NET_PEER_NAME]: params.host, // required
    [SemanticAttributes.NET_PEER_PORT]: params.port,
    [SemanticAttributes.DB_USER]: params.user,
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
    attributes: {
      [SemanticAttributes.DB_SYSTEM]: DbSystemValues.POSTGRESQL, // required
      ...getSemanticAttributesFromConnection(connectionParameters),
    },
  });

  if (!queryConfig) {
    return span;
  }

  // Set attributes
  if (queryConfig.text) {
    span.setAttribute(SemanticAttributes.DB_STATEMENT, queryConfig.text);
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

// NOTE: This function currently is returning false-positives
// in cases where comment characters appear in string literals
// ("SELECT '-- not a comment';" would return true, although has no comment)
function hasValidSqlComment(query: string): boolean {
  const indexOpeningDashDashComment = query.indexOf('--');
  if (indexOpeningDashDashComment >= 0) {
    return true;
  }

  const indexOpeningSlashComment = query.indexOf('/*');
  if (indexOpeningSlashComment < 0) {
    return false;
  }

  const indexClosingSlashComment = query.indexOf('*/');
  return indexOpeningDashDashComment < indexClosingSlashComment;
}

// sqlcommenter specification (https://google.github.io/sqlcommenter/spec/#value-serialization)
// expects us to URL encode based on the RFC 3986 spec (https://en.wikipedia.org/wiki/Percent-encoding),
// but encodeURIComponent does not handle some characters correctly (! ' ( ) *),
// which means we need special handling for this
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
function fixedEncodeURIComponent(str: string) {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function addSqlCommenterComment(span: Span, query: string): string {
  if (typeof query !== 'string' || query.length === 0) {
    return query;
  }

  // As per sqlcommenter spec we shall not add a comment if there already is a comment
  // in the query
  if (hasValidSqlComment(query)) {
    return query;
  }

  const propagator = new W3CTraceContextPropagator();
  const headers: { [key: string]: string } = {};
  propagator.inject(
    trace.setSpan(ROOT_CONTEXT, span),
    headers,
    defaultTextMapSetter
  );

  // sqlcommenter spec requires keys in the comment to be sorted lexicographically
  const sortedKeys = Object.keys(headers).sort();

  if (sortedKeys.length === 0) {
    return query;
  }

  const commentString = sortedKeys
    .map(key => {
      const encodedValue = fixedEncodeURIComponent(headers[key]);
      return `${key}='${encodedValue}'`;
    })
    .join(',');

  return `${query} /*${commentString}*/`;
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
