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
import { DynamoDBStreamEvent } from 'aws-lambda/trigger/dynamodb-stream';
import {
  LambdaTrigger,
  TriggerSpanInitializerResult,
  validateRecordsEvent,
} from './common';
import { isDefined } from '../utils';
import { Attributes, SpanKind } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { DbSystemValues } from '@opentelemetry/semantic-conventions/build/src/trace/SemanticAttributes';
import {TriggerOrigin} from "./index";

export const isDynamoDBStreamEvent =
  validateRecordsEvent<DynamoDBStreamEvent>('aws:dynamodb');

/*
  example of arn is:
  arn:aws:dynamodb:us-west-2:111122223333:table/TestTable/stream/2015-05-11T21:21:33.291
 */
function getTablesFromDynamoARN(arn: string | undefined): string | undefined {
  if (!arn) return undefined;
  try {
    const dynamoResource = arn.split(':')[4];
    const [dynamoResourceType, dynamoResourceName] = dynamoResource.split('/');
    if (dynamoResourceType === 'table') {
      return dynamoResourceName;
    }
    return undefined;
  } catch (error) {
    return undefined;
  }
}

function initalizeDynamoDBStreamSpan(
  event: DynamoDBStreamEvent
): TriggerSpanInitializerResult {
  const { Records: records } = event;

  const tableNames = Array.from(
    new Set(
      records
        .map(({ eventSourceARN }) => getTablesFromDynamoARN(eventSourceARN))
        .filter(isDefined)
    )
  );

  const attributes: Attributes = {
    [SemanticAttributes.DB_SYSTEM]: DbSystemValues.DYNAMODB,
  };

  if (tableNames.length > 0) {
    attributes[
      SemanticAttributes.AWS_DYNAMODB_TABLE_NAMES
    ] = `[${tableNames.join(', ')}]`;
  }
  const name = 'dynamo stream';
  const options = {
    kind: SpanKind.CONSUMER,
    attributes,
  };
  return { name, options, origin: TriggerOrigin.DYNAMO_DB_STREAM };
}

export const DynamoDBTrigger: LambdaTrigger<DynamoDBStreamEvent> = {
  validator: isDynamoDBStreamEvent,
  initializer: initalizeDynamoDBStreamSpan,
};
