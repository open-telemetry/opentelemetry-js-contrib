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

import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { deepStrictEqual } from 'assert';
import { SpanNames } from '../src/enum';
import { AttributeNames } from '../src/enums/AttributeNames';

export function assertResolveSpan(
  span: ReadableSpan,
  fieldName: string,
  fieldPath: string,
  fieldType: string,
  source: string,
  parentSpanId?: string
) {
  const attrs = span.attributes;
  deepStrictEqual(
    span.name,
    `${SpanNames.RESOLVE} ${attrs[AttributeNames.FIELD_PATH]}`
  );
  deepStrictEqual(attrs[AttributeNames.FIELD_NAME], fieldName);
  deepStrictEqual(attrs[AttributeNames.FIELD_PATH], fieldPath);
  deepStrictEqual(attrs[AttributeNames.FIELD_TYPE], fieldType);
  deepStrictEqual(attrs[AttributeNames.SOURCE], source);
  if (parentSpanId) {
    deepStrictEqual(span.parentSpanId, parentSpanId);
  }
}
