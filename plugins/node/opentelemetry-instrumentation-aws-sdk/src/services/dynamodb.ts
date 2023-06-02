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
import { Span, SpanKind, Tracer } from '@opentelemetry/api';
import { RequestMetadata, ServiceExtension } from './ServiceExtension';
import {
  DbSystemValues,
  SemanticAttributes,
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

  requestPreSpanHook(normalizedRequest: NormalizedRequest): RequestMetadata {
    const spanKind: SpanKind = SpanKind.CLIENT;
    let spanName: string | undefined;
    const isIncoming = false;
    const operation = normalizedRequest.commandName;

    const spanAttributes = {
      [SemanticAttributes.DB_SYSTEM]: DbSystemValues.DYNAMODB,
      [SemanticAttributes.DB_NAME]: normalizedRequest.commandInput?.TableName,
      [SemanticAttributes.DB_OPERATION]: operation,
      [SemanticAttributes.DB_STATEMENT]: JSON.stringify(
        normalizedRequest.commandInput
      ),
    };

    // normalizedRequest.commandInput.RequestItems) is undefined when no table names are returned
    // keys in this object are the table names
    if (normalizedRequest.commandInput?.TableName) {
      // Necessary for commands with only 1 table name (example: CreateTable). Attribute is TableName not keys of RequestItems
      // single table name returned for operations like CreateTable
      spanAttributes[SemanticAttributes.AWS_DYNAMODB_TABLE_NAMES] = [
        normalizedRequest.commandInput.TableName,
      ];
    } else if (normalizedRequest.commandInput?.RequestItems) {
      spanAttributes[SemanticAttributes.AWS_DYNAMODB_TABLE_NAMES] = Object.keys(
        normalizedRequest.commandInput.RequestItems
      );
    }

    if (operation === 'CreateTable' || operation === 'UpdateTable') {
      // only check for ProvisionedThroughput since ReadCapacityUnits and WriteCapacity units are required attributes
      if (normalizedRequest.commandInput?.ProvisionedThroughput) {
        spanAttributes[
          SemanticAttributes.AWS_DYNAMODB_PROVISIONED_READ_CAPACITY
        ] =
          normalizedRequest.commandInput.ProvisionedThroughput.ReadCapacityUnits;
        spanAttributes[
          SemanticAttributes.AWS_DYNAMODB_PROVISIONED_WRITE_CAPACITY
        ] =
          normalizedRequest.commandInput.ProvisionedThroughput.WriteCapacityUnits;
      }
    }

    if (
      operation === 'GetItem' ||
      operation === 'Scan' ||
      operation === 'Query'
    ) {
      spanAttributes[SemanticAttributes.AWS_DYNAMODB_CONSISTENT_READ] =
        normalizedRequest.commandInput.ConsistentRead;
    }

    if (operation === 'Query' || operation === 'Scan') {
      spanAttributes[SemanticAttributes.AWS_DYNAMODB_PROJECTION] =
        normalizedRequest.commandInput.ProjectionExpression;
    }

    if (operation === 'CreateTable') {
      if (normalizedRequest.commandInput?.GlobalSecondaryIndexes) {
        spanAttributes[
          SemanticAttributes.AWS_DYNAMODB_GLOBAL_SECONDARY_INDEXES
        ] = this.toArray(
          normalizedRequest.commandInput.GlobalSecondaryIndexes
        ).map((x: { [DictionaryKey: string]: any }) => JSON.stringify(x));
      }

      if (normalizedRequest.commandInput?.LocalSecondaryIndexes) {
        spanAttributes[
          SemanticAttributes.AWS_DYNAMODB_LOCAL_SECONDARY_INDEXES
        ] = this.toArray(
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
        spanAttributes[SemanticAttributes.AWS_DYNAMODB_LIMIT] =
          normalizedRequest.commandInput.Limit;
      }
    }

    if (operation === 'ListTables') {
      if (normalizedRequest.commandInput?.ExclusiveStartTableName) {
        spanAttributes[SemanticAttributes.AWS_DYNAMODB_EXCLUSIVE_START_TABLE] =
          normalizedRequest.commandInput.ExclusiveStartTableName;
      }
    }

    if (operation === 'Query') {
      if (normalizedRequest.commandInput?.ScanIndexForward) {
        spanAttributes[SemanticAttributes.AWS_DYNAMODB_SCAN_FORWARD] =
          normalizedRequest.commandInput.ScanIndexForward;
      }

      if (normalizedRequest.commandInput?.IndexName) {
        spanAttributes[SemanticAttributes.AWS_DYNAMODB_INDEX_NAME] =
          normalizedRequest.commandInput.IndexName;
      }

      if (normalizedRequest.commandInput?.Select) {
        spanAttributes[SemanticAttributes.AWS_DYNAMODB_SELECT] =
          normalizedRequest.commandInput.Select;
      }
    }

    if (operation === 'Scan') {
      if (normalizedRequest.commandInput?.Segment) {
        spanAttributes[SemanticAttributes.AWS_DYNAMODB_SEGMENT] =
          normalizedRequest.commandInput?.Segment;
      }

      if (normalizedRequest.commandInput?.TotalSegments) {
        spanAttributes[SemanticAttributes.AWS_DYNAMODB_TOTAL_SEGMENTS] =
          normalizedRequest.commandInput?.TotalSegments;
      }

      if (normalizedRequest.commandInput?.IndexName) {
        spanAttributes[SemanticAttributes.AWS_DYNAMODB_INDEX_NAME] =
          normalizedRequest.commandInput.IndexName;
      }

      if (normalizedRequest.commandInput?.Select) {
        spanAttributes[SemanticAttributes.AWS_DYNAMODB_SELECT] =
          normalizedRequest.commandInput.Select;
      }
    }

    if (operation === 'UpdateTable') {
      if (normalizedRequest.commandInput?.AttributeDefinitions) {
        spanAttributes[SemanticAttributes.AWS_DYNAMODB_ATTRIBUTE_DEFINITIONS] =
          this.toArray(normalizedRequest.commandInput.AttributeDefinitions).map(
            (x: { [DictionaryKey: string]: any }) => JSON.stringify(x)
          );
      }

      if (normalizedRequest.commandInput?.GlobalSecondaryIndexUpdates) {
        spanAttributes[
          SemanticAttributes.AWS_DYNAMODB_GLOBAL_SECONDARY_INDEX_UPDATES
        ] = this.toArray(
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
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig
  ) {
    const operation = response.request.commandName;

    if (operation === 'BatchGetItem') {
      if (Array.isArray(response.data?.ConsumedCapacity)) {
        span.setAttribute(
          SemanticAttributes.AWS_DYNAMODB_CONSUMED_CAPACITY,
          response.data.ConsumedCapacity.map(
            (x: { [DictionaryKey: string]: any }) => JSON.stringify(x)
          )
        );
      }
    }

    if (
      operation === 'BatchWriteItem' ||
      operation === 'CreateTable' ||
      operation === 'DeleteItem' ||
      operation === 'PutItem' ||
      operation === 'UpdateItem'
    ) {
      span.setAttribute(
        SemanticAttributes.AWS_DYNAMODB_ITEM_COLLECTION_METRICS,
        response.data.ItemCollectionMetrics
      );
    }

    if (operation === 'ListTables') {
      if (response.data?.TableNames) {
        span.setAttribute(
          SemanticAttributes.AWS_DYNAMODB_TABLE_COUNT,
          response.data?.TableNames.length
        );
      }
    }

    if (operation === 'Scan') {
      if (response.data?.Count) {
        span.setAttribute(
          SemanticAttributes.AWS_DYNAMODB_COUNT,
          response.data?.Count
        );
      }

      if (response.data?.ScannedCount) {
        span.setAttribute(
          SemanticAttributes.AWS_DYNAMODB_SCANNED_COUNT,
          response.data?.ScannedCount
        );
      }
    }
  }
}
