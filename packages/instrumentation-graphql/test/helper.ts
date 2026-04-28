/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { SpanNames } from '../src/enum';
import { AttributeNames } from '../src/enums/AttributeNames';

export function assertResolveSpan(
  span: ReadableSpan,
  fieldName: string,
  fieldPath: string,
  fieldType: string,
  source: string,
  parentName: string,
  parentSpanId?: string
) {
  const attrs = span.attributes;
  assert.deepStrictEqual(
    span.name,
    `${SpanNames.RESOLVE} ${attrs[AttributeNames.FIELD_PATH]}`
  );
  assert.deepStrictEqual(attrs[AttributeNames.FIELD_NAME], fieldName);
  assert.deepStrictEqual(attrs[AttributeNames.FIELD_PATH], fieldPath);
  assert.deepStrictEqual(attrs[AttributeNames.FIELD_TYPE], fieldType);
  assert.deepStrictEqual(attrs[AttributeNames.SOURCE], source);
  assert.deepStrictEqual(attrs[AttributeNames.PARENT_NAME], parentName);
  if (parentSpanId) {
    assert.deepStrictEqual(span.parentSpanContext?.spanId, parentSpanId);
  }
}
