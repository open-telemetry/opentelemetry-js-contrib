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
  Span,
  SpanStatusCode,
  Tracer,
  SpanKind,
  diag,
} from '@opentelemetry/api';
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
  PgPoolCallback,
  PgPoolExtended,
  PgInstrumentationConfig,
} from './types';
import * as pgTypes from 'pg';
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

export function getJDBCString(params: PgClientConnectionParams) {
  const host = params.host || 'localhost'; // postgres defaults to localhost
  const port = params.port || 5432; // postgres defaults to port 5432
  const database = params.database || '';
  return `jdbc:postgresql://${host}:${port}/${database}`;
}

// Private helper function to start a span
function pgStartSpan(tracer: Tracer, client: PgClientExtended, name: string) {
  const jdbcString = getJDBCString(client.connectionParameters);
  return tracer.startSpan(name, {
    kind: SpanKind.CLIENT,
    attributes: {
      [SemanticAttributes.DB_NAME]: client.connectionParameters.database, // required
      [SemanticAttributes.DB_SYSTEM]: DbSystemValues.POSTGRESQL, // required
      [SemanticAttributes.DB_CONNECTION_STRING]: jdbcString, // required
      [SemanticAttributes.NET_PEER_NAME]: client.connectionParameters.host, // required
      [SemanticAttributes.NET_PEER_PORT]: client.connectionParameters.port,
      [SemanticAttributes.DB_USER]: client.connectionParameters.user,
    },
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
  const span = pgStartSpan(tracer, this, name);

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
  const span = pgStartSpan(tracer, this, name);

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
  query: string
) {
  // Set child span name
  const queryCommand = getCommandFromText(query);
  const name = PgInstrumentation.BASE_SPAN_NAME + ':' + queryCommand;
  const span = pgStartSpan(tracer, this, name);

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
  originalQuery: typeof pgTypes.Client.prototype.query,
  ...args: unknown[]
) {
  let result;
  const span = pgStartSpan(tracer, this, PgInstrumentation.BASE_SPAN_NAME);
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
