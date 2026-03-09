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

import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import './load-instrumentation';

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import * as nock from 'nock';

import { SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_SYSTEM_NAME,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DB_NAME,
  ATTR_DB_OPERATION,
  ATTR_DB_SYSTEM,
  DB_SYSTEM_NAME_VALUE_DYNAMODB,
  DB_SYSTEM_VALUE_DYNAMODB,
} from '../src/semconv';
import { expect } from 'expect';

// set aws environment variables, so tests in non aws environment are able to run
process.env.AWS_ACCESS_KEY_ID = 'testing';
process.env.AWS_SECRET_ACCESS_KEY = 'testing';

const region = 'us-east-1';

describe('DynamoDB - v3', () => {
  const client = new DynamoDBClient({ region });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('GetItem', () => {
    it('Request span attributes - emits both old and stable DB semconv', async () => {
      const tableName = 'test-table';

      nock(`https://dynamodb.${region}.amazonaws.com/`)
        .post('/')
        .reply(200, { Item: {} });

      const params = {
        TableName: tableName,
        Key: {
          pk: { S: 'test-key' },
        },
      };
      await client.send(new GetItemCommand(params));

      const testSpans: ReadableSpan[] = getTestSpans();
      const dynamoDbSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'DynamoDB.GetItem';
        }
      );
      expect(dynamoDbSpans.length).toBe(1);
      const span = dynamoDbSpans[0];
      expect(span.kind).toBe(SpanKind.CLIENT);

      expect(span.attributes[ATTR_DB_SYSTEM]).toBe(DB_SYSTEM_VALUE_DYNAMODB);
      expect(span.attributes[ATTR_DB_NAME]).toBe(tableName);
      expect(span.attributes[ATTR_DB_OPERATION]).toBe('GetItem');

      expect(span.attributes[ATTR_DB_SYSTEM_NAME]).toBe(
        DB_SYSTEM_NAME_VALUE_DYNAMODB
      );
      expect(span.attributes[ATTR_DB_NAMESPACE]).toBe(tableName);
      expect(span.attributes[ATTR_DB_OPERATION_NAME]).toBe('GetItem');
    });
  });

  describe('PutItem', () => {
    it('Request span attributes - emits both old and stable DB semconv', async () => {
      const tableName = 'another-table';

      nock(`https://dynamodb.${region}.amazonaws.com/`)
        .post('/')
        .reply(200, {});

      const params = {
        TableName: tableName,
        Item: {
          pk: { S: 'test-key' },
          data: { S: 'test-data' },
        },
      };
      await client.send(new PutItemCommand(params));

      const testSpans: ReadableSpan[] = getTestSpans();
      const dynamoDbSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'DynamoDB.PutItem';
        }
      );
      expect(dynamoDbSpans.length).toBe(1);
      const span = dynamoDbSpans[0];
      expect(span.kind).toBe(SpanKind.CLIENT);

      expect(span.attributes[ATTR_DB_SYSTEM]).toBe(DB_SYSTEM_VALUE_DYNAMODB);
      expect(span.attributes[ATTR_DB_NAME]).toBe(tableName);
      expect(span.attributes[ATTR_DB_OPERATION]).toBe('PutItem');

      expect(span.attributes[ATTR_DB_SYSTEM_NAME]).toBe(
        DB_SYSTEM_NAME_VALUE_DYNAMODB
      );
      expect(span.attributes[ATTR_DB_NAMESPACE]).toBe(tableName);
      expect(span.attributes[ATTR_DB_OPERATION_NAME]).toBe('PutItem');
    });
  });
});
