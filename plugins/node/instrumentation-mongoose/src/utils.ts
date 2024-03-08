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
import { SpanAttributes, SpanStatusCode, diag, Span } from '@opentelemetry/api';
import type { Collection } from 'mongoose';
import { MongooseResponseCustomAttributesFunction } from './types';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

export function getAttributesFromCollection(
  collection: Collection
): SpanAttributes {
  return {
    [SemanticAttributes.DB_MONGODB_COLLECTION]: collection.name,
    [SemanticAttributes.DB_NAME]: collection.conn.name,
    [SemanticAttributes.DB_USER]: collection.conn.user,
    [SemanticAttributes.NET_PEER_NAME]: collection.conn.host,
    [SemanticAttributes.NET_PEER_PORT]: collection.conn.port,
  };
}

function setErrorStatus(span: Span, error: any = {}) {
  span.recordException(error);

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: `${error.message} ${
      error.code ? `\nMongoose Error Code: ${error.code}` : ''
    }`,
  });
}

function applyResponseHook(
  span: Span,
  response: any,
  responseHook?: MongooseResponseCustomAttributesFunction,
  moduleVersion: string | undefined = undefined
) {
  if (!responseHook) {
    return;
  }

  safeExecuteInTheMiddle(
    () => responseHook(span, { moduleVersion, response }),
    e => {
      if (e) {
        diag.error('mongoose instrumentation: responseHook error', e);
      }
    },
    true
  );
}

export function handlePromiseResponse(
  execResponse: any,
  span: Span,
  responseHook?: MongooseResponseCustomAttributesFunction,
  moduleVersion: string | undefined = undefined
): any {
  if (!(execResponse instanceof Promise)) {
    applyResponseHook(span, execResponse, responseHook, moduleVersion);
    span.end();
    return execResponse;
  }

  return execResponse
    .then(response => {
      applyResponseHook(span, response, responseHook, moduleVersion);
      return response;
    })
    .catch(err => {
      setErrorStatus(span, err);
      throw err;
    })
    .finally(() => span.end());
}

export function handleCallbackResponse(
  callback: Function,
  exec: Function,
  originalThis: any,
  span: Span,
  responseHook?: MongooseResponseCustomAttributesFunction,
  moduleVersion: string | undefined = undefined,
  ...args: IArguments[]
) {
  const newArgs = [];
  for (const [, argValue] of Object.entries(args[0])) {
    newArgs.push(argValue);
  }

  let index = 0;
  if (newArgs.length === 2) {
    index = 1;
  }

  newArgs[index] = (err: Error, response: any): any => {
    err
      ? setErrorStatus(span, err)
      : applyResponseHook(span, response, responseHook, moduleVersion);

    span.end();
    return callback!(err, response);
  };

  return exec.apply(originalThis, newArgs);
}
