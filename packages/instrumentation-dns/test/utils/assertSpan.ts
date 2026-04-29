/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, SpanStatus, SpanStatusCode } from '@opentelemetry/api';
import { hrTimeToNanoseconds } from '@opentelemetry/core';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import type { LookupAddress } from 'dns';
import { AttributeNames } from '../../src/enums/AttributeNames';
import * as utils from '../../src/utils';

export const assertSpan = (
  span: ReadableSpan,
  validations: {
    addresses: LookupAddress[];
    hostname: string;
    forceStatus?: SpanStatus;
  }
) => {
  if (span.spanContext().traceId) {
    assert.strictEqual(span.spanContext().traceId.length, 32);
  }
  if (span.spanContext().spanId) {
    assert.strictEqual(span.spanContext().spanId.length, 16);
  }

  assert.strictEqual(span.kind, SpanKind.CLIENT);

  assert.strictEqual(
    span.attributes[AttributeNames.DNS_ERROR_MESSAGE],
    span.status.message
  );

  validations.addresses.forEach((_, i) => {
    assert.strictEqual(
      span.attributes[utils.getFamilyAttribute(_.family, i)],
      _.address
    );
  });

  assert.ok(span.endTime);
  assert.strictEqual(span.links.length, 0);
  assert.strictEqual(span.events.length, 0);

  assert.deepStrictEqual(
    span.status,
    validations.forceStatus || { code: SpanStatusCode.UNSET }
  );

  assert.ok(hrTimeToNanoseconds(span.duration), 'must have positive duration');
};
