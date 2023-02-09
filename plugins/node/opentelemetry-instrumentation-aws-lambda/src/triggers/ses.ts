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
import {LambdaTrigger, TriggerSpanInitializerResult, validateRecordsEvent,} from './common';
import {Attributes, SpanKind} from '@opentelemetry/api';
import {SESEvent} from 'aws-lambda';
import {TriggerOrigin} from './index';

const isSESEvent = validateRecordsEvent<SESEvent>('aws:ses', ['ses']);

function initializeSESSpan(event: SESEvent): TriggerSpanInitializerResult {
  const { Records: records } = event;
  const attributes: Attributes = {
  };

  if (records.length === 1) {
    const record = records[0];
    attributes['aws.ses.email.from'] =
      record.ses.mail.commonHeaders.from?.join(',');
    attributes['aws.ses.email.to'] =
      record.ses.mail.commonHeaders.to?.join(',');
  }

  const name = 'email';
  const options = {
    kind: SpanKind.SERVER,
    attributes,
  };
  return { name, options, origin: TriggerOrigin.SES };
}

export const SESTrigger: LambdaTrigger<SESEvent> = {
  validator: isSESEvent,
  initializer: initializeSESSpan,
};
