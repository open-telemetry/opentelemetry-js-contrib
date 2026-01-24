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
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { SpanStatusCode } from '@opentelemetry/api';
import { SerializerPayload } from '../src';
import { DB_NAME, MONGO_HOST, MONGO_PORT } from './config';
import User from './user';
import { SemconvStability } from '@opentelemetry/instrumentation';

export const assertSpan = (
  span: ReadableSpan,
  dbSemconvStability: SemconvStability,
  netSemconvStability: SemconvStability
) => {
  expect(span.status.code).toBe(SpanStatusCode.UNSET);

  if (dbSemconvStability & SemconvStability.OLD) {
    expect(span.attributes[ATTR_DB_SYSTEM]).toEqual('mongoose');
    expect(span.attributes[ATTR_DB_MONGODB_COLLECTION]).toEqual(
      User.collection.name
    );
    expect(span.attributes[ATTR_DB_NAME]).toEqual(DB_NAME);
  } else {
    expect(span.attributes[ATTR_DB_SYSTEM]).toBeUndefined();
    expect(span.attributes[ATTR_DB_MONGODB_COLLECTION]).toBeUndefined();
    expect(span.attributes[ATTR_DB_NAME]).toBeUndefined();
  }
  if (dbSemconvStability & SemconvStability.STABLE) {
    expect(span.attributes[ATTR_DB_SYSTEM_NAME]).toEqual('mongodb');
    expect(span.attributes[ATTR_DB_COLLECTION_NAME]).toEqual(
      User.collection.name
    );
    expect(span.attributes[ATTR_DB_NAMESPACE]).toEqual(DB_NAME);
  } else {
    expect(span.attributes[ATTR_DB_SYSTEM_NAME]).toBeUndefined();
    expect(span.attributes[ATTR_DB_COLLECTION_NAME]).toBeUndefined();
    expect(span.attributes[ATTR_DB_NAMESPACE]).toBeUndefined();
  }

  if (netSemconvStability & SemconvStability.OLD) {
    expect(span.attributes[ATTR_NET_PEER_NAME]).toEqual(MONGO_HOST);
    expect(span.attributes[ATTR_NET_PEER_PORT]).toEqual(MONGO_PORT);
  } else {
    expect(span.attributes[ATTR_NET_PEER_NAME]).toBeUndefined();
    expect(span.attributes[ATTR_NET_PEER_PORT]).toBeUndefined();
  }
  if (netSemconvStability & SemconvStability.STABLE) {
    expect(span.attributes[ATTR_SERVER_ADDRESS]).toEqual(MONGO_HOST);
    expect(span.attributes[ATTR_SERVER_PORT]).toEqual(MONGO_PORT);
  } else {
    expect(span.attributes[ATTR_SERVER_ADDRESS]).toBeUndefined();
    expect(span.attributes[ATTR_SERVER_PORT]).toBeUndefined();
  }
};

export const getStatement = (
  span: ReadableSpan,
  dbSemconvStability: SemconvStability
): SerializerPayload => {
  const attrKey =
    dbSemconvStability & SemconvStability.STABLE
      ? ATTR_DB_QUERY_TEXT
      : ATTR_DB_STATEMENT;
  return JSON.parse(span.attributes[attrKey] as string);
};
