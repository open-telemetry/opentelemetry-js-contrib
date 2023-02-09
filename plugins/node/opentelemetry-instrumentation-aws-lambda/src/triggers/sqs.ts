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
  Attributes,
  Link,
  SpanKind,
  TextMapGetter,
  trace,
} from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { context as otelContext } from '@opentelemetry/api/build/src/context-api';
import {
  AWSXRAY_TRACE_ID_HEADER,
  AWSXRayPropagator,
} from '@opentelemetry/propagator-aws-xray';
import { APIGatewayProxyEventHeaders, SQSEvent, SQSRecord } from 'aws-lambda';
import { isDefined } from '../utils';
import {
  LambdaTrigger,
  TriggerSpanInitializerResult,
  validateRecordsEvent,
} from './common';
import { TriggerOrigin } from './index';

const sqsAttributes: Attributes = {
  [SemanticAttributes.FAAS_TRIGGER]: 'pubsub',
  [SemanticAttributes.MESSAGING_OPERATION]: 'process',
  [SemanticAttributes.MESSAGING_SYSTEM]: 'AmazonSQS',
  'messaging.source.kind': 'queue',
};

const awsPropagator = new AWSXRayPropagator();
const headerGetter: TextMapGetter<APIGatewayProxyEventHeaders> = {
  keys(carrier): string[] {
    return Object.keys(carrier);
  },
  get(carrier, key: string) {
    return carrier[key];
  },
};

const isSQSEvent = validateRecordsEvent<SQSEvent>('aws:sqs');

function getSQSRecordLink(record: SQSRecord): Link | undefined {
  const { AWSTraceHeader } = record?.attributes;
  if (!AWSTraceHeader) return undefined;
  const extractedContext = awsPropagator.extract(
    otelContext.active(),
    { [AWSXRAY_TRACE_ID_HEADER]: AWSTraceHeader },
    headerGetter
  );
  const context = trace.getSpan(extractedContext)?.spanContext();
  if (!context) return undefined;
  return { context };
}

function sqsSpanInitializer(event: SQSEvent): TriggerSpanInitializerResult {
  const { Records: records } = event;

  const sources = new Set(records.map(({ eventSourceARN }) => eventSourceARN));

  const source =
    sources.size === 1 ? sources.values()!.next()!.value : 'multiple_sources';

  const attributes: Attributes = {
    ...sqsAttributes,
    'messaging.source.name': source,
    'messaging.batch.message_count': records.length,
  };

  let links: Link[] | undefined = records
    .map(getSQSRecordLink)
    .filter(isDefined);

  links = links?.length === 0 ? undefined : links;

  const name = `${source} process`;
  const options = {
    kind: SpanKind.CONSUMER,
    attributes,
    links,
  };
  return { name, options, origin: TriggerOrigin.SQS };
}

export const SQSTrigger: LambdaTrigger<SQSEvent> = {
  validator: isSQSEvent,
  initializer: sqsSpanInitializer,
};
