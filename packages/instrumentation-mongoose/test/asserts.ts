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
import {
  ATTR_DB_MONGODB_COLLECTION,
  ATTR_DB_NAME,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from '../src/semconv';
import { SpanStatusCode } from '@opentelemetry/api';
import { SerializerPayload } from '../src';
import { DB_NAME, MONGO_HOST, MONGO_PORT } from './config';
import User from './user';

export const assertSpan = (span: ReadableSpan) => {
  expect(span.status.code).toBe(SpanStatusCode.UNSET);
  expect(span.attributes[ATTR_DB_SYSTEM]).toEqual('mongoose');
  expect(span.attributes[ATTR_DB_MONGODB_COLLECTION]).toEqual(
    User.collection.name
  );
  expect(span.attributes[ATTR_DB_NAME]).toEqual(DB_NAME);
  expect(span.attributes[ATTR_NET_PEER_NAME]).toEqual(MONGO_HOST);
  expect(span.attributes[ATTR_NET_PEER_PORT]).toEqual(MONGO_PORT);
};

export const getStatement = (span: ReadableSpan): SerializerPayload =>
  JSON.parse(span.attributes[ATTR_DB_STATEMENT] as string);
