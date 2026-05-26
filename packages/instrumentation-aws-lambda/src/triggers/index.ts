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
import { LambdaTrigger, TriggerSpanInitializerResult } from './common';
import { ApiGatewayRestTrigger } from './api-gateway/api-gateway-rest';
import { ApiGatewayHttpTrigger } from './api-gateway/api-gateway-http';
import { SQSTrigger } from './sqs';
import { SNSTrigger } from './sns';
import { S3Trigger } from './s3';
import { SESTrigger } from './ses';
import { CognitoTrigger } from './cognito';
import { EventBridgeTrigger } from './event-bridge';
import { DynamoDBTrigger } from './dynamodb-stream';
import { Span } from '@opentelemetry/api';
import { CloudWatchLogsTrigger } from './cloudwatch-logs';
import { StepFunctionsTrigger } from './step-functions';
import { KinesisTrigger } from './kinesis';
import { AwsLambdaInstrumentationConfig } from '../types';

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
  CLOUDWATCH_LOGS = 'CloudWatch Logs',
  STEP_FUNCTIONS = 'Step Functions',
  KINESIS = 'Kinesis',
}

export const lambdaTriggers: Record<TriggerOrigin, LambdaTrigger<any>> = {
  [TriggerOrigin.API_GATEWAY_REST]: ApiGatewayRestTrigger,
  [TriggerOrigin.API_GATEWAY_HTTP]: ApiGatewayHttpTrigger,
  [TriggerOrigin.SQS]: SQSTrigger,
  [TriggerOrigin.SNS]: SNSTrigger,
  [TriggerOrigin.DYNAMO_DB_STREAM]: DynamoDBTrigger,
  [TriggerOrigin.S3]: S3Trigger,
  [TriggerOrigin.SES]: SESTrigger,
  [TriggerOrigin.COGNITO]: CognitoTrigger,
  [TriggerOrigin.EVENT_BRIDGE]: EventBridgeTrigger,
  [TriggerOrigin.CLOUDWATCH_LOGS]: CloudWatchLogsTrigger,
  [TriggerOrigin.STEP_FUNCTIONS]: StepFunctionsTrigger,
  [TriggerOrigin.KINESIS]: KinesisTrigger,
};

export function initializeEventTriggerSpan(
  event: any
): TriggerSpanInitializerResult | undefined {
  return Object.values(lambdaTriggers)
    .find(trigger => trigger.validator(event))
    ?.initializer(event);
}

export const finalizeSpan = (
  config: AwsLambdaInstrumentationConfig,
  origin: TriggerOrigin,
  triggerSpan: Span,
  response: any
) => {
  const trigger = lambdaTriggers[origin];
  if (trigger.finalizer) {
    trigger.finalizer(triggerSpan, response, config);
  }
};
