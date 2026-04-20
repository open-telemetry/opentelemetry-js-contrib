/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { FMember } from '../src/types';

export const assertSpans = (spans: ReadableSpan[], expected: any) => {
  assert.strictEqual(
    spans.length,
    expected.length,
    `Expected ${expected.length} spans, got ${spans.length}(${spans
      .map((s: any) => `"${s.name}"`)
      .join(', ')})`
  );

  spans.forEach((span, i) => {
    assertSpan(span, expected[i]);
  });
};

const assertSpan = (span: ReadableSpan, expected: any) => {
  assert(span);
  assert.strictEqual(span.name, expected.name);
  assert.strictEqual(
    span.kind,
    SpanKind.INTERNAL,
    'Expected to be of INTERNAL kind'
  );
  if (expected.parentSpan) {
    assert.strictEqual(
      span.parentSpanContext?.spanId,
      expected.parentSpan.spanContext().spanId
    );
  }
  if (expected.attributes) {
    assert.deepEqual(span.attributes, expected.attributes);
  }
  if (expected.error) {
    assert(
      expected.error.test(span.status.message),
      `Expected "${span.status.message}" to match ${expected.error}`
    );
    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
  } else {
    assert.strictEqual(
      span.status.code,
      SpanStatusCode.UNSET,
      'Expected status to be unset'
    );
    assert.strictEqual(span.status.message, undefined);
  }
};

export const makeRootSpanName = (name: FMember): string => {
  let rsn: string;
  if (Array.isArray(name)) {
    rsn = `${name[0]}.${name[1]}`;
  } else {
    rsn = `${name}`;
  }
  rsn = `${rsn} test span`;
  return rsn;
};
