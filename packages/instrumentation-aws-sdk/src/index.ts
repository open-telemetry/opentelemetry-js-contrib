/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
export { AwsInstrumentation } from './aws-sdk';
export type {
  AwsSdkDynamoDBStatementSerializer,
  AwsSdkInstrumentationConfig,
  AwsSdkRequestCustomAttributeFunction,
  AwsSdkRequestHookInformation,
  AwsSdkResponseCustomAttributeFunction,
  AwsSdkResponseHookInformation,
  CommandInput,
  NormalizedRequest,
  NormalizedResponse,
} from './types';
