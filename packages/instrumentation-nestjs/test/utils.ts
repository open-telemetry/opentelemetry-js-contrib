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

import { SpanStatusCode } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { NestInstrumentation } from '../src';

type SpanParent = Pick<ReadableSpan, 'spanContext'> | null | undefined;

export type SpanExpectation = {
  type?: string;
  service?: string;
  name?: string;
  module?: string;
  method?: string;
  url?: string;
  path?: string;
  callback?: string;
  controller?: string;
  pattern?: string;
  transport?: string;
  status?: {
    code: SpanStatusCode;
    message?: string;
  };
  parentSpanIdx?: number;
  parentSpanName?: string;
  parentSpan?: SpanParent;
} | null;

export const assertSpans = (
  actualSpans: ReadableSpan[],
  expectedSpans: SpanExpectation[]
) => {
  assert(Array.isArray(actualSpans), 'Expected `actualSpans` to be an array');
  assert(
    Array.isArray(expectedSpans),
    'Expected `expectedSpans` to be an array'
  );
  assert.strictEqual(
    actualSpans.length,
    expectedSpans.length,
    'Expected span count different from actual'
  );

  actualSpans.forEach((span, idx) => {
    const expected = expectedSpans[idx];
    if (expected === null) return;

    try {
      assert.notStrictEqual(span, undefined);
      assert.notStrictEqual(expected, undefined);

      assert.strictEqual(span.attributes.component, '@nestjs/core');
      assert.strictEqual(span.attributes['nestjs.module'], expected.module);
      assert.strictEqual(span.name, expected.name);

      assert.strictEqual(span.attributes['http.method'], expected.method);
      assert.strictEqual(span.attributes['http.url'], expected.url);
      assert.strictEqual(
        span.attributes['http.request.method'],
        expected.method
      );
      assert.strictEqual(span.attributes['url.full'], expected.url);

      assert.strictEqual(span.attributes['http.route'], expected.path);
      assert.strictEqual(span.attributes['nestjs.type'], expected.type);
      assert.strictEqual(span.attributes['nestjs.callback'], expected.callback);
      if (Object.prototype.hasOwnProperty.call(expected, 'controller')) {
        assert.strictEqual(
          span.attributes['nestjs.controller'],
          expected.controller
        );
      }
      if (Object.prototype.hasOwnProperty.call(expected, 'pattern')) {
        assert.strictEqual(span.attributes['nestjs.pattern'], expected.pattern);
      }
      if (Object.prototype.hasOwnProperty.call(expected, 'transport')) {
        assert.strictEqual(
          span.attributes['nestjs.transport'],
          expected.transport
        );
      }
      assert.strictEqual(
        span.attributes.component,
        NestInstrumentation.COMPONENT
      );
      assert.strictEqual(
        typeof span.attributes['nestjs.version'],
        'string',
        'nestjs.version not specified'
      );
      assert.deepEqual(
        span.status,
        expected.status || { code: SpanStatusCode.UNSET }
      );
      if (typeof expected.parentSpanIdx === 'number') {
        assert.strictEqual(
          span.parentSpanContext?.spanId,
          actualSpans[expected.parentSpanIdx].spanContext().spanId
        );
      } else if (typeof expected.parentSpanName === 'string') {
        const parentSpan = actualSpans.find(
          currentSpan => currentSpan.name === expected.parentSpanName
        );
        assert.notStrictEqual(
          parentSpan,
          undefined,
          `Cannot find span named ${expected.parentSpanName} expected to be the parent of ${span.name}`
        );
        const resolvedParentSpan = parentSpan as ReadableSpan;
        assert.strictEqual(
          span.parentSpanContext?.spanId,
          resolvedParentSpan.spanContext().spanId,
          `Expected "${expected.parentSpanName}" to be the parent of "${span.name}", but found "${
            actualSpans.find(
              currentSpan =>
                currentSpan.spanContext().spanId ===
                span.parentSpanContext?.spanId
            )?.name
          }"`
        );
      } else if (expected.parentSpan !== null) {
        assert.strictEqual(
          span.parentSpanContext?.spanId,
          expected.parentSpan?.spanContext().spanId
        );
      }
    } catch (error: any) {
      error.message = `At span[${idx}] "${span.name}": ${error.message}`;
      throw error;
    }
  });
};
