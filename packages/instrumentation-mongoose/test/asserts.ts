/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { expect } from 'expect';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_DB_MONGODB_COLLECTION,
  ATTR_DB_NAME,
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

export const assertSpan = (
  span: ReadableSpan
) => {
  expect(span.status.code).toBe(SpanStatusCode.UNSET);
  expect(span.attributes[ATTR_DB_SYSTEM]).toBeUndefined();
  expect(span.attributes[ATTR_DB_MONGODB_COLLECTION]).toBeUndefined();
  expect(span.attributes[ATTR_DB_NAME]).toBeUndefined();
  expect(span.attributes[ATTR_DB_SYSTEM_NAME]).toEqual('mongodb');
  expect(span.attributes[ATTR_DB_COLLECTION_NAME]).toEqual(
    User.collection.name
  );
  expect(span.attributes[ATTR_DB_NAMESPACE]).toEqual(DB_NAME);
  expect(span.attributes[ATTR_NET_PEER_NAME]).toBeUndefined();
  expect(span.attributes[ATTR_NET_PEER_PORT]).toBeUndefined();
  expect(span.attributes[ATTR_SERVER_ADDRESS]).toEqual(MONGO_HOST);
  expect(span.attributes[ATTR_SERVER_PORT]).toEqual(MONGO_PORT);

};

export const getStatement = (
  span: ReadableSpan
): SerializerPayload => {
  return JSON.parse(span.attributes[ATTR_DB_QUERY_TEXT] as string);
};
