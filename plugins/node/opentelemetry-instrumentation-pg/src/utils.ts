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
  INVALID_SPAN_CONTEXT,
  Attributes,
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
  NormalizedQueryConfig,
  PostgresCallback,
  PgClientConnectionParams,
  PgErrorCallback,
  PgPoolCallback,
  PgPoolExtended,
} from './internal-types';
import { PgInstrumentationConfig } from './types';
import type * as pgTypes from 'pg';
import { PgInstrumentation } from './';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';

function arrayStringifyHelper(arr: Array<unknown>): string {
  return '[' + arr.toString() + ']';
}

// Helper function to get a low cardinality command name from the full text query
function getCommandFromText(text?: string): string {
  if (!text) return 'unknown';
  const words = text.split(' ');
  return words[0].length > 0 ? words[0] : 'unknown';
}

export function getConnectionString(params: PgClientConnectionParams) {
  const host = params.host || 'localhost';
  const port = params.port || 5432;
  const database = params.database || '';
  return `postgresql://${host}:${port}/${database}`;
}

export function startSpan(
  tracer: Tracer,
  instrumentationConfig: PgInstrumentationConfig,
  name: string,
  attributes: Attributes
): Span {
  // If a parent span is required but not present, use a noop span to propagate
  // context without recording it. Adapted from opentelemetry-instrumentation-http:
  // https://github.com/open-telemetry/opentelemetry-js/blob/597ea98e58a4f68bcd9aec5fd283852efe444cd6/experimental/packages/opentelemetry-instrumentation-http/src/http.ts#L660
  const currentSpan = trace.getSpan(context.active());
  if (instrumentationConfig.requireParentSpan && currentSpan === undefined) {
    return trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
  }

  return tracer.startSpan(name, {
    kind: SpanKind.CLIENT,
    attributes,
  });
}

// Private helper function to start a span after a connection has been established
function startQuerySpan(
  client: PgClientExtended,
  tracer: Tracer,
  instrumentationConfig: PgInstrumentationConfig,
  name: string
) {
  const jdbcString = getConnectionString(client.connectionParameters);
  return startSpan(tracer, instrumentationConfig, name, {
    [SemanticAttributes.DB_NAME]: client.connectionParameters.database, // required
    [SemanticAttributes.DB_SYSTEM]: DbSystemValues.POSTGRESQL, // required
    [SemanticAttributes.DB_CONNECTION_STRING]: jdbcString, // required
    [SemanticAttributes.NET_PEER_NAME]: client.connectionParameters.host, // required
    [SemanticAttributes.NET_PEER_PORT]: client.connectionParameters.port,
    [SemanticAttributes.DB_USER]: client.connectionParameters.user,
  });
}

// Queries where args[0] is a QueryConfig
export function handleConfigQuery(
  this: PgClientExtended,
  tracer: Tracer,
  instrumentationConfig: PgInstrumentationConfig,
  queryConfig: NormalizedQueryConfig
) {
  // Set child span name
  const queryCommand = getCommandFromText(queryConfig.name || queryConfig.text);
  const name = PgInstrumentation.BASE_SPAN_NAME + ':' + queryCommand;
  const span = startQuerySpan(this, tracer, instrumentationConfig, name);

  // Set attributes
  if (queryConfig.text) {
    span.setAttribute(SemanticAttributes.DB_STATEMENT, queryConfig.text);
  }
  if (
    instrumentationConfig.enhancedDatabaseReporting &&
    queryConfig.values instanceof Array
  ) {
    span.setAttribute(
      AttributeNames.PG_VALUES,
      arrayStringifyHelper(queryConfig.values)
    );
  }
  // Set plan name attribute, if present
  if (queryConfig.name) {
    span.setAttribute(AttributeNames.PG_PLAN, queryConfig.name);
  }

  return span;
}

// Queries where args[1] is a 'values' array
export function handleParameterizedQuery(
  this: PgClientExtended,
  tracer: Tracer,
  instrumentationConfig: PgInstrumentationConfig,
  query: string,
  values: unknown[]
) {
  // Set child span name
  const queryCommand = getCommandFromText(query);
  const name = PgInstrumentation.BASE_SPAN_NAME + ':' + queryCommand;
  const span = startQuerySpan(this, tracer, instrumentationConfig, name);

  // Set attributes
  span.setAttribute(SemanticAttributes.DB_STATEMENT, query);
  if (instrumentationConfig.enhancedDatabaseReporting) {
    span.setAttribute(AttributeNames.PG_VALUES, arrayStringifyHelper(values));
  }

  return span;
}

// Queries where args[0] is a text query and 'values' was not specified
export function handleTextQuery(
  this: PgClientExtended,
  tracer: Tracer,
  instrumentationConfig: PgInstrumentationConfig,
  query: string
) {
  // Set child span name
  const queryCommand = getCommandFromText(query);
  const name = PgInstrumentation.BASE_SPAN_NAME + ':' + queryCommand;
  const span = startQuerySpan(this, tracer, instrumentationConfig, name);

  // Set attributes
  span.setAttribute(SemanticAttributes.DB_STATEMENT, query);

  return span;
}

/**
 * Invalid query handler. We should never enter this function unless invalid args were passed to the driver.
 * Create and immediately end a new span
 */
export function handleInvalidQuery(
  this: PgClientExtended,
  tracer: Tracer,
  instrumentationConfig: PgInstrumentationConfig,
  originalQuery: typeof pgTypes.Client.prototype.query,
  ...args: unknown[]
) {
  let result;
  const span = startQuerySpan(
    this,
    tracer,
    instrumentationConfig,
    PgInstrumentation.BASE_SPAN_NAME
  );
  try {
    result = originalQuery.apply(this, args as never);
  } catch (e) {
    // span.recordException(e);
    span.setStatus({ code: SpanStatusCode.ERROR, message: e.message });
    throw e;
  } finally {
    span.end();
  }
  return result;
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

export function patchClientConnectCallback(
  span: Span,
  cb: PgErrorCallback
): PgErrorCallback {
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
    cb.call(this, err);
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
