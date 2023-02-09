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
import {Attributes, SpanKind} from '@opentelemetry/api';
import {SemanticAttributes} from '@opentelemetry/semantic-conventions';
import {SNSEvent} from 'aws-lambda';
import {LambdaTrigger, TriggerSpanInitializerResult, validateRecordsEvent,} from './common';
import {TriggerOrigin} from "./index";

const snsAttributes: Attributes = {
  [SemanticAttributes.FAAS_TRIGGER]: 'pubsub',
  [SemanticAttributes.MESSAGING_OPERATION]: 'process',
  [SemanticAttributes.MESSAGING_SYSTEM]: 'AmazonSNS',
  'messaging.source.kind': 'topic',
};

const isSNSEvent = validateRecordsEvent<SNSEvent>('aws:sns', ['sns']);

function initializeSnsSpan(event: SNSEvent): TriggerSpanInitializerResult {
  const { Records: records } = event;

  const sources = new Set(records.map(({ Sns }) => Sns.TopicArn));

  const source =
    sources.size === 1 ? sources.values()!.next()!.value : 'multiple_sources';

  const attributes: Attributes = {
    ...snsAttributes,
    'messaging.source.name': source,
    'messaging.batch.message_count': records.length,
  };
  const name = `${source} process`;
  const options = {
    kind: SpanKind.CONSUMER,
    attributes,
  };
  return { name, options, origin: TriggerOrigin.SNS };
}

export const SNSTrigger: LambdaTrigger<SNSEvent> = {
  validator: isSNSEvent,
  initializer: initializeSnsSpan,
};
