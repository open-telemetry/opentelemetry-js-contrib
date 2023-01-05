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
import { Handler } from 'aws-lambda';

export const enum TriggerOrigin {
  API_GATEWAY,
  SQS,
}

export type SQSEvent = {
  Records: SQSMessage[];
};

export type SQSMessage = {
  messageId: string;
  receiptHandle: string;
  body: unknown;
  attributes?: Record<string, string>;
  messageAttributes?: Record<string, string>;
  messageSystemAttributes?: Record<string, string>;
  md5OfBody?: string;
  eventSource?: string;
  eventSourceARN: string;
  awsRegion: string;
};

export type ApiGatewayEvent = {
  resource: string;
  path: string;
  httpMethod: string;
  requestContext: ApiGatewayRequestContext;
  headers: Record<string, string>;
  multiValueHeaders: Record<string, string[]>;
  queryStringParameters: string | null;
  multiValueQueryStringParameters: Record<string, string[]>;
  pathParameters: any;
  stageVariables: any;
  body: string;
  isBase64Encoded: boolean;
};

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
  };
  path: string;
  protocol: string;
  requestId: string;

  requestTime: string;
  requestTimeEpoch: string;
  stage: string;

  resourcePath: any;
};

export type LambdaModule = Record<string, Handler>;
