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
  TextMapGetter,
  TextMapSetter,
  context,
  propagation,
  diag,
} from '@opentelemetry/api';
import type { SQS, SNS } from 'aws-sdk';

// https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-quotas.html
export const MAX_MESSAGE_ATTRIBUTES = 10;
class ContextSetter
  implements
    TextMapSetter<SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap>
{
  set(
    carrier: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap,
    key: string,
    value: string
  ) {
    carrier[key] = {
      DataType: 'String',
      StringValue: value as string,
    };
  }
}
export const contextSetter = new ContextSetter();

class ContextGetter
  implements
    TextMapGetter<SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap>
{
  keys(
    carrier: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap
  ): string[] {
    return Object.keys(carrier);
  }

  get(
    carrier: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap,
    key: string
  ): undefined | string | string[] {
    return carrier?.[key]?.StringValue;
  }
}
export const contextGetter = new ContextGetter();

export const InjectPropagationContext = (
  attributesMap?: SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap
): SQS.MessageBodyAttributeMap | SNS.MessageAttributeMap => {
  const attributes = attributesMap ?? {};
  if (Object.keys(attributes).length < MAX_MESSAGE_ATTRIBUTES) {
    propagation.inject(context.active(), attributes, contextSetter);
  } else {
    diag.warn(
      'aws-sdk instrumentation: cannot set context propagation on SQS/SNS message due to maximum amount of MessageAttributes'
    );
  }
  return attributes;
};
