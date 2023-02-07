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
import { EventBridgeEvent, Handler, SQSEvent } from 'aws-lambda';
import { SNSEvent } from 'aws-lambda/trigger/sns';
import { S3Event } from 'aws-lambda/trigger/s3';
import { SESEvent } from 'aws-lambda/trigger/ses';
import { DynamoDBStreamEvent } from 'aws-lambda/trigger/dynamodb-stream';
import { BaseTriggerEvent as CognitoBaseTriggerEvent } from 'aws-lambda/trigger/cognito-user-pool-trigger/_common';
export const LambdaAttributes = {
  TRIGGER_SERVICE: 'faas.trigger.type',
};

export const enum TriggerOrigin {
  API_GATEWAY_REST = 'Api Gateway Rest',
  API_GATEWAY_HTTP = 'Api Gateway HTTP',
  SQS = 'SQS',
  SNS = 'SNS',
  DYNAMO_DB_STREAM = 'Dynamo DB',
  S3 = 'S3',
  SES = 'SES',
  COGNITO = 'Cognito',
  EVENT_BRIDGE = 'EventBridge',
}

export type RestApiGatewayRequestContext = {
  accountId: string;
  apiId: string;
  resourceId: string;
  authorizer: {
    claims: string | null;
    scopes: string | null;
    principalId: string | null;
  };
  domainName: string;
  domainPrefix: string;
  extendedRequestId: string;
  httpMethod: string;

  identity: {
    accessKey: string | null;
    accountId: string | null;
    caller: string | null;
    cognitoAuthenticationProvider: string | null;
    cognitoAuthenticationType: string | null;
    cognitoIdentityPool: string | null;
    principalOrdId: string | null;
    sourceIp: string | null;
    user: string | null;
    userAgent: string;
    userArn: string | null;
    clientCert: any;
  } | null;
  path: string;
  protocol: string;
  requestId: string;

  requestTime: string;
  requestTimeEpoch: string;
  stage: string;

  resourcePath: any;
};

export type RestApiGatewayEvent = {
  resource: string;
  path: string;
  httpMethod: string;
  requestContext: RestApiGatewayRequestContext;
  headers: Record<string, string> | null;
  multiValueHeaders: Record<string, string[]> | null;
  queryStringParameters: string | null;
  multiValueQueryStringParameters: Record<string, string[]> | null;
  pathParameters: any;
  stageVariables: any;
  body: string;
  isBase64Encoded: boolean;
};

export function isRestApiGatewayEvent(
  event: any
): event is RestApiGatewayEvent {
  return (
    event &&
    typeof event === 'object' &&
    'resource' in event &&
    typeof event.resource === 'string' &&
    'requestContext' in event
  );
}

export type HttpApiGatewaySpec = {
  method: string;
  path: string;
  protocol?: string;
  sourceIp?: string;
  userAgent?: string;
};

export type HttpApiGatewayRequestContext = {
  accountId: string;
  apiId?: string;
  domainName: string;
  domainPrefix?: string;
  http: HttpApiGatewaySpec;
  requestId?: string;
  routeKey?: string;
  stage?: string;
  time?: string;
  timeEpoch?: number;
};

export interface HttpApiGatewayEvent {
  version?: string;
  routeKey?: string;
  rawPath: string;
  rawQueryString?: string;
  headers: Record<string, string>;
  requestContext: HttpApiGatewayRequestContext;
  isBase64Encoded?: boolean;
}

export function isHttpApiGatewayEvent(
  event: any
): event is HttpApiGatewayEvent {
  return (
    event &&
    typeof event === 'object' &&
    'rawPath' in event &&
    typeof event.rawPath === 'string' &&
    'requestContext' in event
  );
}

export type RecordValidator<T> = (record: any) => record is T;

export type GatewayResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: object | string;
};

const validateRecord =
  (recordSource: string, additionalRecordFields?: string[]) =>
  (record: any) => {
    return record &&
      typeof record === 'object' &&
      'eventSource' in record &&
      record.eventSource === recordSource &&
      additionalRecordFields
      ? additionalRecordFields.every(field => {
          field in record && typeof record[field] === 'object';
        })
      : true;
  };

const validateRecordsEvent =
  <T>(recordSource: string, additionalRecordFields?: string[]) =>
  (event: any): event is T => {
    return (
      event &&
      typeof event === 'object' &&
      'Records' in event &&
      Array.isArray(event.Records) &&
      event.Records.every(validateRecord(recordSource, additionalRecordFields))
    );
  };

export function isGatewayResult(result: any): result is GatewayResult {
  return (
    result &&
    typeof result === 'object' &&
    'statusCode' in result &&
    typeof result.statusCode === 'number'
  );
}

export const isSQSEvent = validateRecordsEvent<SQSEvent>('aws:sqs');

export const isSNSEvent = validateRecordsEvent<SNSEvent>('aws:sns', ['sns']);

export const isDynamoDBStreamEvent =
  validateRecordsEvent<DynamoDBStreamEvent>('aws:dynamodb');

export const isS3Event = validateRecordsEvent<S3Event>('aws:s3', ['s3']);

export const isSESEvent = validateRecordsEvent<SESEvent>('aws:ses', ['ses']);

export const isCognitoEvent = (
  event: any
): event is CognitoBaseTriggerEvent<string> => {
  return (
    event &&
    typeof event === 'object' &&
    'triggerSource' in event &&
    typeof event.triggerSource === 'string'
  );
};

export const isEventBridgeEvent = (
  event: any
): event is EventBridgeEvent<string, any> => {
  return (
    event &&
    typeof event === 'object' &&
    'source' in event &&
    typeof event.source === 'string'
  );
};

export type LambdaModule = Record<string, Handler>;
