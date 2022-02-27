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
import { AwsInstrumentation } from '../src';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
registerInstrumentationTesting(new AwsInstrumentation());
import * as AWS from 'aws-sdk';
import { AWSError } from 'aws-sdk';

import { mockV2AwsSend } from './testing-utils';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import * as expect from 'expect';
import type { ConsumedCapacity as ConsumedCapacityV2 } from 'aws-sdk/clients/dynamodb';
import type { ConsumedCapacity as ConsumedCapacityV3 } from '@aws-sdk/client-dynamodb';

type ConsumedCapacity = ConsumedCapacityV2 | ConsumedCapacityV3;

const responseMockSuccess = {
  requestId: '0000000000000',
  error: null,
};

describe('DynamoDB', () => {
  before(() => {
    AWS.config.credentials = {
      accessKeyId: 'test key id',
      expired: false,
      expireTime: new Date(),
      secretAccessKey: 'test acc key',
      sessionToken: 'test token',
    };
  });

  describe('Query', () => {
    beforeEach(() => {
      mockV2AwsSend(responseMockSuccess, {
        Items: [{ key1: 'val1' }, { key2: 'val2' }],
        Count: 2,
        ScannedCount: 5,
      } as AWS.DynamoDB.Types.QueryOutput);
    });

    it('should populate specific Query attributes', done => {
      const dynamodb = new AWS.DynamoDB.DocumentClient();
      const params = {
        TableName: 'test-table',
        KeyConditionExpression: '#k = :v',
        ExpressionAttributeNames: {
          '#k': 'key1',
        },
        ExpressionAttributeValues: {
          ':v': 'val1',
        },
      };
      dynamodb.query(
        params,
        (err: AWSError, data: AWS.DynamoDB.DocumentClient.QueryOutput) => {
          const spans = getTestSpans();
          expect(spans.length).toStrictEqual(1);
          const attrs = spans[0].attributes;
          expect(attrs[SemanticAttributes.DB_SYSTEM]).toStrictEqual(
            DbSystemValues.DYNAMODB
          );
          expect(attrs[SemanticAttributes.DB_NAME]).toStrictEqual('test-table');
          expect(attrs[SemanticAttributes.DB_OPERATION]).toStrictEqual('Query');
          expect(
            JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)
          ).toEqual(params);
          expect(err).toBeFalsy();
          done();
        }
      );
    });
  });

  describe('BatchGetItem', () => {
    const consumedCapacityResponseMockData: ConsumedCapacity[] = [
      {
        TableName: 'test-table',
        CapacityUnits: 0.5,
        Table: { CapacityUnits: 0.5 },
      },
    ];

    it('should populate BatchGetIem default attributes', done => {
      mockV2AwsSend(responseMockSuccess, {
        Responses: { 'test-table': [{ key1: { S: 'val1' } }] },
        UnprocessedKeys: {},
      } as AWS.DynamoDB.Types.BatchGetItemOutput);

      const dynamodb = new AWS.DynamoDB.DocumentClient();
      const dynamodb_params = {
        RequestItems: {
          'test-table': {
            Keys: [{ key1: { S: 'val1' } }],
            ProjectionExpression: 'id',
          },
        },
        ReturnConsumedCapacity: 'INDEXES',
      };
      dynamodb.batchGet(
        dynamodb_params,
        (
          err: AWSError,
          data: AWS.DynamoDB.DocumentClient.BatchGetItemOutput
        ) => {
          const spans = getTestSpans();
          expect(spans.length).toStrictEqual(1);
          const attrs = spans[0].attributes;
          expect(attrs[SemanticAttributes.DB_SYSTEM]).toStrictEqual(
            DbSystemValues.DYNAMODB
          );
          expect(attrs[SemanticAttributes.DB_OPERATION]).toStrictEqual(
            'BatchGetItem'
          );
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_TABLE_NAMES]
          ).toStrictEqual(['test-table']);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_CONSUMED_CAPACITY]
          ).toBeUndefined();
          expect(
            JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)
          ).toEqual(dynamodb_params);
          expect(err).toBeFalsy();
          done();
        }
      );
    });

    it('should populate BatchGetIem optional attributes', done => {
      mockV2AwsSend(responseMockSuccess, {
        Responses: { 'test-table': [{ key1: { S: 'val1' } }] },
        UnprocessedKeys: {},
        ConsumedCapacity: consumedCapacityResponseMockData,
      } as AWS.DynamoDB.Types.BatchGetItemOutput);

      const dynamodb = new AWS.DynamoDB.DocumentClient();
      const dynamodb_params = {
        RequestItems: {
          'test-table': {
            Keys: [{ key1: { S: 'val1' } }],
            ProjectionExpression: 'id',
          },
        },
        ReturnConsumedCapacity: 'INDEXES',
      };
      dynamodb.batchGet(
        dynamodb_params,
        (
          err: AWSError,
          data: AWS.DynamoDB.DocumentClient.BatchGetItemOutput
        ) => {
          const spans = getTestSpans();
          expect(spans.length).toStrictEqual(1);
          const attrs = spans[0].attributes;
          expect(attrs[SemanticAttributes.DB_SYSTEM]).toStrictEqual(
            DbSystemValues.DYNAMODB
          );
          expect(attrs[SemanticAttributes.DB_OPERATION]).toStrictEqual(
            'BatchGetItem'
          );
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_TABLE_NAMES]
          ).toStrictEqual(['test-table']);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_CONSUMED_CAPACITY]
          ).toStrictEqual(
            consumedCapacityResponseMockData.map((x: ConsumedCapacity) =>
              JSON.stringify(x)
            )
          );
          expect(
            JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)
          ).toEqual(dynamodb_params);
          expect(err).toBeFalsy();
          done();
        }
      );
    });

    it('should populate BatchGetIem when consumedCapacity is undefined', done => {
      mockV2AwsSend(responseMockSuccess, {
        Responses: { 'test-table': [{ key1: { S: 'val1' } }] },
        UnprocessedKeys: {},
        ConsumedCapacity: undefined,
      } as AWS.DynamoDB.Types.BatchGetItemOutput);

      const dynamodb = new AWS.DynamoDB.DocumentClient();
      const dynamodb_params = {
        RequestItems: {
          'test-table': {
            Keys: [{ key1: { S: 'val1' } }],
            ProjectionExpression: 'id',
          },
        },
        ReturnConsumedCapacity: 'NONE',
      };
      dynamodb.batchGet(
        dynamodb_params,
        (
          err: AWSError,
          data: AWS.DynamoDB.DocumentClient.BatchGetItemOutput
        ) => {
          const spans = getTestSpans();
          expect(spans.length).toStrictEqual(1);
          const attrs = spans[0].attributes;
          expect(attrs[SemanticAttributes.DB_SYSTEM]).toStrictEqual('dynamodb');
          expect(attrs[SemanticAttributes.DB_OPERATION]).toStrictEqual(
            'BatchGetItem'
          );
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_TABLE_NAMES]
          ).toStrictEqual(['test-table']);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_CONSUMED_CAPACITY]
          ).toBeUndefined();
          expect(
            JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)
          ).toEqual(dynamodb_params);
          expect(err).toBeFalsy();
          done();
        }
      );
    });
  });
});
