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
import { Attributes, SpanStatusCode, diag, Span } from '@opentelemetry/api';
import type { Collection } from 'mongoose';
import { MongooseResponseCustomAttributesFunction } from './types';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import {
  ATTR_DB_MONGODB_COLLECTION,
  ATTR_DB_NAME,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from './semconv';

export function getAttributesFromCollection(
  collection: Collection
): Attributes {
  return {
    [ATTR_DB_MONGODB_COLLECTION]: collection.name,
    [ATTR_DB_NAME]: collection.conn.name,
    [ATTR_DB_USER]: collection.conn.user,
    [ATTR_NET_PEER_NAME]: collection.conn.host,
    [ATTR_NET_PEER_PORT]: collection.conn.port,
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
  args: IArguments,
  responseHook?: MongooseResponseCustomAttributesFunction,
  moduleVersion: string | undefined = undefined
) {
  let callbackArgumentIndex = 0;
  if (args.length === 2) {
    callbackArgumentIndex = 1;
  } else if (args.length === 3) {
    callbackArgumentIndex = 2;
  }

  args[callbackArgumentIndex] = (err: Error, response: any): any => {
    if (err) {
      setErrorStatus(span, err);
    } else {
      applyResponseHook(span, response, responseHook, moduleVersion);
    }

    span.end();
    return callback!(err, response);
  };

  return exec.apply(originalThis, args);
}
