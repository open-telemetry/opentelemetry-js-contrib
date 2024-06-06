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
import {
  Attributes,
  DiagLogger,
  Span,
  SpanKind,
  Tracer,
} from '@opentelemetry/api';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import {
  DBSYSTEMVALUES_DYNAMODB,
  SEMATTRS_AWS_DYNAMODB_ATTRIBUTE_DEFINITIONS,
  SEMATTRS_AWS_DYNAMODB_CONSISTENT_READ,
  SEMATTRS_AWS_DYNAMODB_CONSUMED_CAPACITY,
  SEMATTRS_AWS_DYNAMODB_COUNT,
  SEMATTRS_AWS_DYNAMODB_EXCLUSIVE_START_TABLE,
  SEMATTRS_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEX_UPDATES,
  SEMATTRS_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEXES,
  SEMATTRS_AWS_DYNAMODB_INDEX_NAME,
  SEMATTRS_AWS_DYNAMODB_ITEM_COLLECTION_METRICS,
  SEMATTRS_AWS_DYNAMODB_LIMIT,
  SEMATTRS_AWS_DYNAMODB_LOCAL_SECONDARY_INDEXES,
  SEMATTRS_AWS_DYNAMODB_PROJECTION,
  SEMATTRS_AWS_DYNAMODB_PROVISIONED_READ_CAPACITY,
  SEMATTRS_AWS_DYNAMODB_PROVISIONED_WRITE_CAPACITY,
  SEMATTRS_AWS_DYNAMODB_SCAN_FORWARD,
  SEMATTRS_AWS_DYNAMODB_SCANNED_COUNT,
  SEMATTRS_AWS_DYNAMODB_SEGMENT,
  SEMATTRS_AWS_DYNAMODB_SELECT,
  SEMATTRS_AWS_DYNAMODB_TABLE_COUNT,
  SEMATTRS_AWS_DYNAMODB_TABLE_NAMES,
  SEMATTRS_AWS_DYNAMODB_TOTAL_SEGMENTS,
  SEMATTRS_DB_NAME,
  SEMATTRS_DB_OPERATION,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
} from '@opentelemetry/semantic-conventions';
import {
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
} from '../types';

export class DynamodbServiceExtension implements ServiceExtension {
  toArray<T>(values: T | T[]): T[] {
    return Array.isArray(values) ? values : [values];
  }

  requestPreSpanHook(
    normalizedRequest: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger
  ): RequestMetadata {
    const spanKind: SpanKind = SpanKind.CLIENT;
    let spanName: string | undefined;
    const isIncoming = false;
    const operation = normalizedRequest.commandName;

    const spanAttributes: Attributes = {
      [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_DYNAMODB,
      [SEMATTRS_DB_NAME]: normalizedRequest.commandInput?.TableName,
      [SEMATTRS_DB_OPERATION]: operation,
    };

    if (config.dynamoDBStatementSerializer) {
      try {
        const sanitizedStatement = config.dynamoDBStatementSerializer(
          operation,
          normalizedRequest.commandInput
        );

        if (typeof sanitizedStatement === 'string') {
          spanAttributes[SEMATTRS_DB_STATEMENT] = sanitizedStatement;
        }
      } catch (err) {
        diag.error('failed to sanitize DynamoDB statement', err);
      }
    }

    // normalizedRequest.commandInput.RequestItems) is undefined when no table names are returned
    // keys in this object are the table names
    if (normalizedRequest.commandInput?.TableName) {
      // Necessary for commands with only 1 table name (example: CreateTable). Attribute is TableName not keys of RequestItems
      // single table name returned for operations like CreateTable
      spanAttributes[SEMATTRS_AWS_DYNAMODB_TABLE_NAMES] = [
        normalizedRequest.commandInput.TableName,
      ];
    } else if (normalizedRequest.commandInput?.RequestItems) {
      spanAttributes[SEMATTRS_AWS_DYNAMODB_TABLE_NAMES] = Object.keys(
        normalizedRequest.commandInput.RequestItems
      );
    }

    if (operation === 'CreateTable' || operation === 'UpdateTable') {
      // only check for ProvisionedThroughput since ReadCapacityUnits and WriteCapacity units are required attributes
      if (normalizedRequest.commandInput?.ProvisionedThroughput) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_PROVISIONED_READ_CAPACITY] =
          normalizedRequest.commandInput.ProvisionedThroughput.ReadCapacityUnits;
        spanAttributes[SEMATTRS_AWS_DYNAMODB_PROVISIONED_WRITE_CAPACITY] =
          normalizedRequest.commandInput.ProvisionedThroughput.WriteCapacityUnits;
      }
    }

    if (
      operation === 'GetItem' ||
      operation === 'Scan' ||
      operation === 'Query'
    ) {
      if (normalizedRequest.commandInput?.ConsistentRead) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_CONSISTENT_READ] =
          normalizedRequest.commandInput.ConsistentRead;
      }
    }

    if (operation === 'Query' || operation === 'Scan') {
      if (normalizedRequest.commandInput?.ProjectionExpression) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_PROJECTION] =
          normalizedRequest.commandInput.ProjectionExpression;
      }
    }

    if (operation === 'CreateTable') {
      if (normalizedRequest.commandInput?.GlobalSecondaryIndexes) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEXES] =
          this.toArray(
            normalizedRequest.commandInput.GlobalSecondaryIndexes
          ).map((x: { [DictionaryKey: string]: any }) => JSON.stringify(x));
      }

      if (normalizedRequest.commandInput?.LocalSecondaryIndexes) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_LOCAL_SECONDARY_INDEXES] =
          this.toArray(
            normalizedRequest.commandInput.LocalSecondaryIndexes
          ).map((x: { [DictionaryKey: string]: any }) => JSON.stringify(x));
      }
    }

    if (
      operation === 'ListTables' ||
      operation === 'Query' ||
      operation === 'Scan'
    ) {
      if (normalizedRequest.commandInput?.Limit) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_LIMIT] =
          normalizedRequest.commandInput.Limit;
      }
    }

    if (operation === 'ListTables') {
      if (normalizedRequest.commandInput?.ExclusiveStartTableName) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_EXCLUSIVE_START_TABLE] =
          normalizedRequest.commandInput.ExclusiveStartTableName;
      }
    }

    if (operation === 'Query') {
      if (normalizedRequest.commandInput?.ScanIndexForward) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_SCAN_FORWARD] =
          normalizedRequest.commandInput.ScanIndexForward;
      }

      if (normalizedRequest.commandInput?.IndexName) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_INDEX_NAME] =
          normalizedRequest.commandInput.IndexName;
      }

      if (normalizedRequest.commandInput?.Select) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_SELECT] =
          normalizedRequest.commandInput.Select;
      }
    }

    if (operation === 'Scan') {
      if (normalizedRequest.commandInput?.Segment) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_SEGMENT] =
          normalizedRequest.commandInput?.Segment;
      }

      if (normalizedRequest.commandInput?.TotalSegments) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_TOTAL_SEGMENTS] =
          normalizedRequest.commandInput?.TotalSegments;
      }

      if (normalizedRequest.commandInput?.IndexName) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_INDEX_NAME] =
          normalizedRequest.commandInput.IndexName;
      }

      if (normalizedRequest.commandInput?.Select) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_SELECT] =
          normalizedRequest.commandInput.Select;
      }
    }

    if (operation === 'UpdateTable') {
      if (normalizedRequest.commandInput?.AttributeDefinitions) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_ATTRIBUTE_DEFINITIONS] =
          this.toArray(normalizedRequest.commandInput.AttributeDefinitions).map(
            (x: { [DictionaryKey: string]: any }) => JSON.stringify(x)
          );
      }

      if (normalizedRequest.commandInput?.GlobalSecondaryIndexUpdates) {
        spanAttributes[SEMATTRS_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEX_UPDATES] =
          this.toArray(
            normalizedRequest.commandInput.GlobalSecondaryIndexUpdates
          ).map((x: { [DictionaryKey: string]: any }) => JSON.stringify(x));
      }
    }

    return {
      isIncoming,
      spanAttributes,
      spanKind,
      spanName,
    };
  }

  responseHook(
    response: NormalizedResponse,
    span: Span,
    _tracer: Tracer,
    _config: AwsSdkInstrumentationConfig
  ) {
    if (response.data?.ConsumedCapacity) {
      span.setAttribute(
        SEMATTRS_AWS_DYNAMODB_CONSUMED_CAPACITY,
        toArray(response.data.ConsumedCapacity).map(
          (x: { [DictionaryKey: string]: any }) => JSON.stringify(x)
        )
      );
    }

    if (response.data?.ItemCollectionMetrics) {
      span.setAttribute(
        SEMATTRS_AWS_DYNAMODB_ITEM_COLLECTION_METRICS,
        this.toArray(response.data.ItemCollectionMetrics).map(
          (x: { [DictionaryKey: string]: any }) => JSON.stringify(x)
        )
      );
    }

    if (response.data?.TableNames) {
      span.setAttribute(
        SEMATTRS_AWS_DYNAMODB_TABLE_COUNT,
        response.data?.TableNames.length
      );
    }

    if (response.data?.Count) {
      span.setAttribute(SEMATTRS_AWS_DYNAMODB_COUNT, response.data?.Count);
    }

    if (response.data?.ScannedCount) {
      span.setAttribute(
        SEMATTRS_AWS_DYNAMODB_SCANNED_COUNT,
        response.data?.ScannedCount
      );
    }
  }
}

function toArray<T>(values: T | T[]): T[] {
  return Array.isArray(values) ? values : [values];
}
