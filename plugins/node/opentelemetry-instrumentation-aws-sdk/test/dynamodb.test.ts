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
import { expect } from 'expect';
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
        ProjectionExpression: 'id',
        ScanIndexForward: true,
        ConsistentRead: true,
        IndexName: 'name_to_group',
        Limit: 10,
        Select: 'ALL_ATTRIBUTES',
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
            attrs[SemanticAttributes.AWS_DYNAMODB_SCAN_FORWARD]
          ).toStrictEqual(true);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_CONSISTENT_READ]
          ).toStrictEqual(true);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_INDEX_NAME]
          ).toStrictEqual('name_to_group');
          expect(attrs[SemanticAttributes.AWS_DYNAMODB_SELECT]).toStrictEqual(
            'ALL_ATTRIBUTES'
          );
          expect(attrs[SemanticAttributes.AWS_DYNAMODB_LIMIT]).toStrictEqual(
            10
          );
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_TABLE_NAMES]
          ).toStrictEqual(['test-table']);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_PROJECTION]
          ).toStrictEqual('id');
          expect(
            JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)
          ).toEqual(params);
          expect(err).toBeFalsy();
          done();
        }
      );
    });
  });

  describe('Scan', () => {
    beforeEach(() =>
      mockV2AwsSend(responseMockSuccess, {
        ConsumedCapacity: {
          TableName: 'test-table',
          CapacityUnits: 0.5,
          Table: { CapacityUnits: 0.5 },
        },
        Count: 10,
        ScannedCount: 50,
      } as AWS.DynamoDB.Types.ScanOutput)
    );

    it('should populate specific Scan attributes', done => {
      const dynamodb = new AWS.DynamoDB.DocumentClient();
      const params = {
        TableName: 'test-table',
        Item: { key1: 'val1' },
        ProjectionExpression: 'id',
        ConsistentRead: true,
        Segment: 10,
        TotalSegments: 100,
        IndexName: 'index_name',
        Limit: 10,
        Select: 'ALL_ATTRIBUTES',
      };

      dynamodb.scan(
        params,
        (err: AWSError, data: AWS.DynamoDB.DocumentClient.ScanOutput) => {
          const spans = getTestSpans();
          expect(spans.length).toStrictEqual(1);
          const attrs = spans[0].attributes;
          expect(attrs[SemanticAttributes.DB_SYSTEM]).toStrictEqual(
            DbSystemValues.DYNAMODB
          );
          expect(attrs[SemanticAttributes.DB_NAME]).toStrictEqual('test-table');
          expect(attrs[SemanticAttributes.DB_OPERATION]).toStrictEqual('Scan');
          expect(attrs[SemanticAttributes.AWS_DYNAMODB_SEGMENT]).toStrictEqual(
            10
          );
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_TOTAL_SEGMENTS]
          ).toStrictEqual(100);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_INDEX_NAME]
          ).toStrictEqual('index_name');
          expect(attrs[SemanticAttributes.AWS_DYNAMODB_SELECT]).toStrictEqual(
            'ALL_ATTRIBUTES'
          );
          expect(attrs[SemanticAttributes.AWS_DYNAMODB_COUNT]).toStrictEqual(
            10
          );
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_SCANNED_COUNT]
          ).toStrictEqual(50);
          expect(attrs[SemanticAttributes.AWS_DYNAMODB_LIMIT]).toStrictEqual(
            10
          );
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_TABLE_NAMES]
          ).toStrictEqual(['test-table']);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_PROJECTION]
          ).toStrictEqual('id');
          expect(
            JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)
          ).toEqual(params);
          expect(err).toBeFalsy();
          done();
        }
      );
    });
  });

  describe('BatchWriteItem', () => {
    beforeEach(() =>
      mockV2AwsSend(responseMockSuccess, {
        UnprocessedItems: {},
        ItemCollectionMetrics: {"ItemCollectionKey": [], "SizeEstimateRangeGB": [0]},
        ConsumedCapacity: undefined,  
      } as AWS.DynamoDB.Types.BatchWriteItemOutput)
    );

    it('should populate specific BatchWriteItem attributes', done => {
      const dynamodb = new AWS.DynamoDB.DocumentClient();
      const params = {
        RequestItems: {},
        ReturnConsumedCapacity: 'INDEXES',
        ReturnItemCollectionMetrics: 'SIZE'
      };

      dynamodb.batchWrite(
        params,
        (err: AWSError, data: AWS.DynamoDB.DocumentClient.BatchWriteItemOutput) => {
          const spans = getTestSpans();
          expect(spans.length).toStrictEqual(1);
          const attrs = spans[0].attributes;
          expect(attrs[SemanticAttributes.DB_SYSTEM]).toStrictEqual(
            DbSystemValues.DYNAMODB
          );
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_ITEM_COLLECTION_METRICS]
          ).toStrictEqual([
            JSON.stringify({"ItemCollectionKey": [], "SizeEstimateRangeGB": [0]}),
          ]);

          expect(
            JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)
          ).toEqual(params);
          expect(err).toBeFalsy();
          done();
        }
      );
    });
  });

  describe('CreateTable', () => {
    beforeEach(() =>
      mockV2AwsSend(responseMockSuccess, {
        TableName: "test_table",
        ItemCollectionMetrics: {"ItemCollectionKey": [], "SizeEstimateRangeGB": [0]},
        ConsumedCapacity: undefined,  
      } as AWS.DynamoDB.Types.CreateTableOutput)
    );

    it('should populate specific CreateTable attributes', done => {

      const globalSecondaryIndexMockData = { 
        IndexName: "test_index", 
        KeySchema: [ 
          {
            AttributeName: "attribute1", 
            KeyType: "HASH",
          },
        ],
        Projection: {
          ProjectionType: "ALL",
          NonKeyAttributes: [
            "non_key_attr",
          ],
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 10,
        },
      }

      const localSecondaryIndexMockData = { 
        IndexName: "test_index",
        KeySchema: [
          {
            AttributeName: "test_attribute",
            KeyType: "HASH",
          },
        ],
        Projection: { 
          ProjectionType: "ALL",
          NonKeyAttributes: [ 
            "STRING_VALUE",
          ],
        },
      }

      const dynamodb = new AWS.DynamoDB();
      const params = {
        AttributeDefinitions: [ 
          { 
            AttributeName: "test_attribute",
            AttributeType: "S", 
          },
        ],
        TableName: "test_table",
        KeySchema: [ 
          { 
            AttributeName: "test_attribute", 
            KeyType: "HASH", 
          },
        ],
        LocalSecondaryIndexes: [localSecondaryIndexMockData],
        GlobalSecondaryIndexes: [globalSecondaryIndexMockData],
        BillingMode: "PROVISIONED",
        ProvisionedThroughput: {
          ReadCapacityUnits: 20, 
          WriteCapacityUnits: 30,
        },
      };

      dynamodb.createTable(
        params,
        (err: AWSError, data: AWS.DynamoDB.DocumentClient.CreateTableOutput) => {
          const spans = getTestSpans();
          expect(spans.length).toStrictEqual(1);
          const attrs = spans[0].attributes;
          expect(attrs[SemanticAttributes.DB_SYSTEM]).toStrictEqual(
            DbSystemValues.DYNAMODB
          );
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_ITEM_COLLECTION_METRICS]
          ).toStrictEqual([
            JSON.stringify({"ItemCollectionKey": [], "SizeEstimateRangeGB": [0]}),
          ]);

          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_GLOBAL_SECONDARY_INDEXES]
          ).toStrictEqual([JSON.stringify(globalSecondaryIndexMockData)]);

          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_LOCAL_SECONDARY_INDEXES]
          ).toStrictEqual([JSON.stringify(localSecondaryIndexMockData)]);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_PROVISIONED_READ_CAPACITY]
          ).toStrictEqual(20);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_PROVISIONED_WRITE_CAPACITY]
          ).toStrictEqual(30);
          expect(
            JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)
          ).toEqual(params);
          expect(err).toBeFalsy();
          done();
        }
      );
    });
  });

  describe('UpdateTable', () => {
    beforeEach(() =>
      mockV2AwsSend(responseMockSuccess, {
        TableName: "test_table"
      } as AWS.DynamoDB.Types.UpdateTableOutput)
    );

    it('should populate specific CreateTable attributes', done => {
      const dynamodb = new AWS.DynamoDB();
      const params = { 
        AttributeDefinitions: [ 
          { 
            AttributeName: "test_attr", 
            AttributeType: "S", 
          },
        ],
        TableName: "test_table",
        ProvisionedThroughput: { 
          ReadCapacityUnits: 10, 
          WriteCapacityUnits: 15, 
        },
        GlobalSecondaryIndexUpdates: [
          { 
            Update: { 
              IndexName: "test_index", 
              ProvisionedThroughput: {
                ReadCapacityUnits: 1, 
                WriteCapacityUnits: 5, 
              },
            },
          },
        ],
      };

      dynamodb.updateTable(
        params,
        (err: AWSError, data: AWS.DynamoDB.DocumentClient.UpdateTableOutput) => {
          const spans = getTestSpans();
          expect(spans.length).toStrictEqual(1);
          const attrs = spans[0].attributes;
          expect(attrs[SemanticAttributes.DB_SYSTEM]).toStrictEqual(
            DbSystemValues.DYNAMODB
          );

          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_GLOBAL_SECONDARY_INDEX_UPDATES]
          ).toStrictEqual([JSON.stringify({ 
            Update: { 
              IndexName: "test_index", 
              ProvisionedThroughput: {
                ReadCapacityUnits: 1, 
                WriteCapacityUnits: 5, 
              },
            },
          })]);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_ATTRIBUTE_DEFINITIONS]
          ).toStrictEqual([JSON.stringify(
            { 
              AttributeName: "test_attr", 
              AttributeType: "S", 
            }
          )]);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_PROVISIONED_READ_CAPACITY]
          ).toStrictEqual(10);
          expect(
            attrs[SemanticAttributes.AWS_DYNAMODB_PROVISIONED_WRITE_CAPACITY]
          ).toStrictEqual(15);
          expect(
            JSON.parse(attrs[SemanticAttributes.DB_STATEMENT] as string)
          ).toEqual(params);
          expect(err).toBeFalsy();
          done();
        }
      );
    });
  });

  describe('ListTables', () => {
    beforeEach(() =>
      mockV2AwsSend(responseMockSuccess, {
        TableNames: ["test_table", "test_table_2", "start_table"]
      } as AWS.DynamoDB.Types.ListTablesOutput)
    );

    it('should populate specific ListTables attributes', done => {
      const dynamodb = new AWS.DynamoDB();
      const params = {
        ExclusiveStartTableName: "start_table",
        Limit: 10,
      };

      dynamodb.listTables(
        params,
        (err: AWSError, data: AWS.DynamoDB.DocumentClient.ListTablesOutput) => {
          const spans = getTestSpans();
          expect(spans.length).toStrictEqual(1);
          const attrs = spans[0].attributes;
          expect(attrs[SemanticAttributes.DB_SYSTEM]).toStrictEqual(
            DbSystemValues.DYNAMODB
          );

          expect(attrs[SemanticAttributes.AWS_DYNAMODB_EXCLUSIVE_START_TABLE]).toStrictEqual("start_table")
          expect(attrs[SemanticAttributes.AWS_DYNAMODB_LIMIT]).toStrictEqual(10);
          expect(attrs[SemanticAttributes.AWS_DYNAMODB_TABLE_COUNT]).toStrictEqual(3);

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
