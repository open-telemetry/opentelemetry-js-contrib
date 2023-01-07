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
import { Handler, SQSEvent } from 'aws-lambda';

export const enum TriggerOrigin {
  API_GATEWAY,
  SQS,
}

export type ApiGatewayEvent = {
  resource: string;
  path: string;
  httpMethod: string;
  requestContext: ApiGatewayRequestContext;
  headers: Record<string, string> | null;
  multiValueHeaders: Record<string, string[]> | null;
  queryStringParameters: string | null;
  multiValueQueryStringParameters: Record<string, string[]> | null;
  pathParameters: any;
  stageVariables: any;
  body: string;
  isBase64Encoded: boolean;
};

export function isApiGatewayEvent(event: any): event is ApiGatewayEvent {
  return (
    event &&
    typeof event === 'object' &&
    'resource' in event &&
    typeof event.resource === 'string' &&
    'requestContext' in event
  );
}

export type ApiGatewayRequestContext = {
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

export type GatewayResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: object | string;
};

export function isGatewayResult(result: any): result is GatewayResult {
  return (
    result &&
    typeof result === 'object' &&
    'statusCode' in result &&
    typeof result.statusCode === 'number'
  );
}

export function isSQSEvent(event: any): event is SQSEvent {
  return (
    event &&
    typeof event === 'object' &&
    'Records' in event &&
    Array.isArray(event.Records)
  );
}

export type LambdaModule = Record<string, Handler>;
