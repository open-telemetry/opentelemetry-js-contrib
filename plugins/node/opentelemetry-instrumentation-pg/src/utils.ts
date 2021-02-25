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

import { Span, StatusCode, Tracer, SpanKind } from '@opentelemetry/api';
import { AttributeNames } from './enums';
import {
  PgClientExtended,
  NormalizedQueryConfig,
  PostgresCallback,
  PgClientConnectionParams,
  PgPoolCallback,
  PgPoolExtended,
} from './types';
import * as pgTypes from 'pg';
import { PgInstrumentation, PgInstrumentationConfig } from './pg';

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
      [AttributeNames.COMPONENT]: PgInstrumentation.COMPONENT, // required
      [AttributeNames.DB_INSTANCE]: client.connectionParameters.database, // required
      [AttributeNames.DB_TYPE]: PgInstrumentation.DB_TYPE, // required
      [AttributeNames.PEER_ADDRESS]: jdbcString, // required
      [AttributeNames.PEER_HOSTNAME]: client.connectionParameters.host, // required
      [AttributeNames.PEER_PORT]: client.connectionParameters.port,
      [AttributeNames.DB_USER]: client.connectionParameters.user,
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
    span.setAttribute(AttributeNames.DB_STATEMENT, queryConfig.text);
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
  span.setAttribute(AttributeNames.DB_STATEMENT, query);
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
  span.setAttribute(AttributeNames.DB_STATEMENT, query);

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
    span.setStatus({ code: StatusCode.ERROR, message: e.message });
    throw e;
  } finally {
    span.end();
  }
  return result;
}

export function patchCallback(
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
        code: StatusCode.ERROR,
        message: err.message,
      });
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
        code: StatusCode.ERROR,
        message: err.message,
      });
    }
    span.end();
    cb.call(this, err, res, done);
  };
}
