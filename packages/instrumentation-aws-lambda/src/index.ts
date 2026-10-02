/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  AwsLambdaInstrumentation,
  lambdaMaxInitInMilliseconds,
} from './instrumentation';
export type {
  AwsLambdaInstrumentationConfig,
  EventContextExtractor,
  RequestHook,
  ResponseHook,
} from './types';
