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
  AwsInstrumentation,
  AwsSdkInstrumentationConfig,
} from '@opentelemetry/instrumentation-aws-sdk';

import { InstrumentationConfig } from './types';
import { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { RemoveFunctions } from '../types';

function getAwsInstrumentationArgs(
  config?: RemoveFunctions<AwsSdkInstrumentationConfig>
) {
  if (!config) return;

  return `{
    enabled: ${config.enabled ?? true},
    sqsExtractContextPropagationFromPayload: ${
      config.sqsExtractContextPropagationFromPayload
    },
    suppressInternalInstrumentation: ${config.suppressInternalInstrumentation}
  }`;
}

export const awsSdkInstrumentations: InstrumentationModuleDefinition<any>[] =
  new AwsInstrumentation().init();

export const awsSdkInstrumentationConfig: Record<
  '@smithy/smithy-client' | '@smithy/middleware-stack',
  InstrumentationConfig<'@opentelemetry/instrumentation-aws-sdk'>
> = {
  '@smithy/smithy-client': {
    oTelInstrumentationPackage: '@opentelemetry/instrumentation-aws-sdk',
    oTelInstrumentationClass: 'AwsInstrumentation',
    configGenerator: getAwsInstrumentationArgs,
  },
  '@smithy/middleware-stack': {
    oTelInstrumentationPackage: '@opentelemetry/instrumentation-aws-sdk',
    oTelInstrumentationClass: 'AwsInstrumentation',
    configGenerator: getAwsInstrumentationArgs,
  },
};
