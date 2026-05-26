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
import { Attributes, SpanKind } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { KinesisStreamEvent } from 'aws-lambda';
import {
  LambdaTrigger,
  TriggerSpanInitializerResult,
  validateRecordsEvent,
} from './common';
import { TriggerOrigin } from './index';

const isKinesisEvent = validateRecordsEvent<KinesisStreamEvent>(
  'aws:kinesis',
  ['kinesis']
);

function initializeKinesisSpan(
  event: KinesisStreamEvent
): TriggerSpanInitializerResult {
  const { Records: records } = event;

  const sources = new Set(
    records.map(({ eventSourceARN }) => eventSourceARN).filter(Boolean)
  );
  const source =
    sources.size === 1 ? sources.values().next().value : 'multiple_sources';

  const attributes: Attributes = {
    [SemanticAttributes.FAAS_TRIGGER]: 'pubsub',
    'faas.trigger.type': 'Kinesis',
    [SemanticAttributes.MESSAGING_SYSTEM]: 'aws.kinesis',
    [SemanticAttributes.MESSAGING_OPERATION]: 'process',
    'messaging.source.kind': 'stream',
    'messaging.batch.message_count': records.length,
  };

  if (source) {
    attributes['messaging.source.name'] = source;
  }

  const name = `${source} process`;
  const options = {
    kind: SpanKind.CONSUMER,
    attributes,
  };
  return { name, options, origin: TriggerOrigin.KINESIS };
}

export const KinesisTrigger: LambdaTrigger<KinesisStreamEvent> = {
  validator: isKinesisEvent,
  initializer: initializeKinesisSpan,
};
