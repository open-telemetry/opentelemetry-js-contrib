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
import { Tracer, Attributes } from '@opentelemetry/api';
import { CanonicalCode, Span, SpanKind } from '@opentelemetry/api';
import { MongoError } from 'mongodb';
import { AttributeNames } from './enums';

// when mongoose functions are called, we store the original call context
// and then set it as the parent for the spans created by Query/Aggregate exec()
// calls. this bypass the unlinked spans issue on thenables await operations
// (issue https://github.com/wdalmut/opentelemetry-plugin-mongoose/issues/29)
export const _STORED_PARENT_SPAN: unique symbol = Symbol('stored-parent-span');

export function startSpan(
  tracer: Tracer,
  name: string,
  op: string,
  parentSpan?: Span
): Span {
  return tracer.startSpan(`mongoose.${name}.${op}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      [AttributeNames.DB_MODEL_NAME]: name,
      [AttributeNames.DB_TYPE]: 'nosql',
      [AttributeNames.COMPONENT]: 'mongoose',
    },
    parent: parentSpan,
  });
}

export function handleExecResponse(
  execResponse: any,
  span: Span,
  enhancedDatabaseReporting?: boolean
): any {
  if (!(execResponse instanceof Promise)) {
    span.end();
    return execResponse;
  }

  return execResponse
    .then(response => {
      if (enhancedDatabaseReporting) {
        span.setAttribute(AttributeNames.DB_RESPONSE, safeStringify(response));
      }
      return response;
    })
    .then((response: any) => {
      span.end();
      return response;
    })
    .catch((error: any) => {
      error = handleError(span)(error);
      span.end();
      return error;
    });
}

export function handleError(span: Span) {
  return function (error: MongoError | Error): Promise<MongoError> {
    span.setAttribute(
      AttributeNames.MONGO_ERROR_CODE,
      (error as MongoError).code
    );

    setErrorStatus(span, error);

    return Promise.reject(error);
  };
}

export function setErrorStatus(span: Span, error: MongoError | Error): Span {
  span.setAttribute(
    AttributeNames.MONGO_ERROR_CODE,
    (error as MongoError).code
  );

  span.setStatus({
    code: CanonicalCode.UNKNOWN,
    message: error.message,
  });

  return span;
}

export function safeStringify(payload: any): string | null {
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

export function getAttributesFromCollection(collection: any): Attributes {
  return {
    [AttributeNames.COLLECTION_NAME]: collection.name,
    [AttributeNames.DB_NAME]: collection.conn.name,
    [AttributeNames.DB_HOST]: collection.conn.host,
    [AttributeNames.DB_PORT]: collection.conn.port,
    [AttributeNames.DB_USER]: collection.conn.user,
  };
}
