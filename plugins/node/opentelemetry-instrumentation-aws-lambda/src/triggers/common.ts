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

import { SpanOptions } from '@opentelemetry/api/build/src/trace/SpanOptions';
import { Span } from '@opentelemetry/api';
import { TriggerOrigin } from './index';

export type TriggerValidator<T> = (event: any) => event is T;
export interface TriggerSpanInitializerResult {
  name: string;
  options: SpanOptions;
  origin: TriggerOrigin;
}
export type TriggerSpanInitializer<T> = (
  event: T
) => TriggerSpanInitializerResult;
export type SpanFinalizer = (span: Span, response?: any) => void;

export interface LambdaTrigger<T> {
  validator: TriggerValidator<T>;
  initializer: TriggerSpanInitializer<T>;
  finalizer?: SpanFinalizer;
}

export const validateRecord =
  (recordSource: string, additionalRecordFields?: string[]) =>
  (record: any) => {
    return (
      record &&
      typeof record === 'object' &&
      'eventSource' in record &&
      record.eventSource === recordSource &&
      (additionalRecordFields
        ? additionalRecordFields.every(
            field => field in record && typeof record[field] === 'object'
          )
        : true)
    );
  };

export const validateRecordsEvent =
  <T>(recordSource: string, additionalRecordFields?: string[]) =>
  (event: any): event is T => {
    return (
      event &&
      typeof event === 'object' &&
      'Records' in event &&
      Array.isArray(event.Records) &&
      event.Records.every(validateRecord(recordSource, additionalRecordFields))
    );
  };
