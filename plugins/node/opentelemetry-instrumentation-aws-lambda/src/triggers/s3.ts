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
import { S3Event } from 'aws-lambda';
import {
  LambdaTrigger,
  TriggerSpanInitializerResult,
  validateRecordsEvent,
} from './common';
import { isDefined } from '../utils';
import { Attributes, SpanKind } from '@opentelemetry/api';
import { TriggerOrigin } from './index';

const isS3Event = validateRecordsEvent<S3Event>('aws:s3', ['s3']);

function initializeS3Span(event: S3Event): TriggerSpanInitializerResult {
  const { Records: records } = event;

  const eventNames = Array.from(
    new Set(records.map(({ eventName }) => eventName).filter(isDefined))
  );

  const buckets = Array.from(
    new Set(
      records
        .map(
          ({
            s3: {
              bucket: { name: bucketName },
            },
          }) => bucketName
        )
        .filter(isDefined)
    )
  );

  const s3objectKeys = Array.from(
    new Set(
      records
        .map(
          ({
            s3: {
              object: { key },
            },
          }) => key
        )
        .filter(isDefined)
    )
  );

  const attributes: Attributes = {};

  if (eventNames.length === 1) {
    attributes['aws.s3.event.trigger'] = eventNames[0];
  }

  if (buckets.length === 1) {
    attributes['aws.s3.bucket.name'] = buckets[0];
  }

  if (s3objectKeys.length === 1) {
    attributes['aws.s3.object.key'] = s3objectKeys[0];
  }

  const name =
    eventNames.length === 1 ? `${eventNames[0]}` : 's3 multi trigger';
  const options = {
    kind: SpanKind.SERVER,
    attributes,
  };
  return { name, options, origin: TriggerOrigin.S3 };
}

export const S3Trigger: LambdaTrigger<S3Event> = {
  validator: isS3Event,
  initializer: initializeS3Span,
};
