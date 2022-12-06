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
import { expect } from 'expect';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { SpanStatusCode } from '@opentelemetry/api';
import { SerializerPayload } from '../src';
import { DB_NAME, MONGO_HOST, MONGO_PORT } from './config';

export const assertSpan = (span: ReadableSpan) => {
  expect(span.status.code).toBe(SpanStatusCode.UNSET);
  expect(span.attributes[SemanticAttributes.DB_SYSTEM]).toEqual('mongoose');
  expect(span.attributes[SemanticAttributes.DB_MONGODB_COLLECTION]).toEqual(
    'users'
  );
  expect(span.attributes[SemanticAttributes.DB_NAME]).toEqual(DB_NAME);
  expect(span.attributes[SemanticAttributes.NET_PEER_NAME]).toEqual(MONGO_HOST);
  expect(span.attributes[SemanticAttributes.NET_PEER_PORT]).toEqual(MONGO_PORT);
};

export const getStatement = (span: ReadableSpan): SerializerPayload =>
  JSON.parse(span.attributes[SemanticAttributes.DB_STATEMENT] as string);
