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
import { BaseTriggerEvent as CognitoBaseTriggerEvent } from 'aws-lambda/trigger/cognito-user-pool-trigger/_common';
import { Attributes, SpanKind } from '@opentelemetry/api';
import { LambdaTrigger, TriggerSpanInitializerResult } from './common';
import { TriggerOrigin } from './index';

const isCognitoEvent = (
  event: any
): event is CognitoBaseTriggerEvent<string> => {
  return (
    event &&
    typeof event === 'object' &&
    'triggerSource' in event &&
    typeof event.triggerSource === 'string'
  );
};

function initializeCognitoSpan(
  event: CognitoBaseTriggerEvent<string>
): TriggerSpanInitializerResult {
  const attributes: Attributes = {
    'aws.cognito.trigger.service': event.triggerSource,
  };
  const name = `${event.triggerSource}`;
  const options = {
    kind: SpanKind.SERVER,
    attributes,
  };
  return { name, options, origin: TriggerOrigin.COGNITO };
}

export const CognitoTrigger: LambdaTrigger<CognitoBaseTriggerEvent<string>> = {
  validator: isCognitoEvent,
  initializer: initializeCognitoSpan,
};
