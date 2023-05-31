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

import * as assert from 'assert';
import {
  trace,
  SpanContext,
  TraceFlags,
  INVALID_SPAN_CONTEXT,
  createTraceState,
} from '@opentelemetry/api';
import { addSqlCommenterComment } from '../src/index';

describe('addSqlCommenterComment', () => {
  it('adds comment to a simple query', () => {
    const spanContext: SpanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
    };

    const query = 'SELECT * from FOO;';
    assert.strictEqual(
      addSqlCommenterComment(trace.wrapSpanContext(spanContext), query),
      "SELECT * from FOO; /*traceparent='00-d4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-01'*/"
    );
  });

  it('does not add a comment if query already has a comment', () => {
    const span = trace.wrapSpanContext({
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
    });

    const blockComment = 'SELECT * from FOO; /* Test comment */';
    assert.strictEqual(
      addSqlCommenterComment(span, blockComment),
      blockComment
    );

    const dashedComment = 'SELECT * from FOO; -- Test comment';
    assert.strictEqual(
      addSqlCommenterComment(span, dashedComment),
      dashedComment
    );
  });

  it('does not add a comment to an empty query', () => {
    const spanContext: SpanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
    };

    assert.strictEqual(
      addSqlCommenterComment(trace.wrapSpanContext(spanContext), ''),
      ''
    );
  });

  it('does not add a comment if span context is invalid', () => {
    const query = 'SELECT * from FOO;';
    assert.strictEqual(
      addSqlCommenterComment(
        trace.wrapSpanContext(INVALID_SPAN_CONTEXT),
        query
      ),
      query
    );
  });

  it('correctly also sets trace state', () => {
    const spanContext: SpanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
      traceState: createTraceState('foo=bar,baz=qux'),
    };

    const query = 'SELECT * from FOO;';
    assert.strictEqual(
      addSqlCommenterComment(trace.wrapSpanContext(spanContext), query),
      "SELECT * from FOO; /*traceparent='00-d4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-01',tracestate='foo%3Dbar%2Cbaz%3Dqux'*/"
    );
  });

  it('escapes special characters in values', () => {
    const spanContext: SpanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.SAMPLED,
      traceState: createTraceState("foo='bar,baz='qux!()*',hack='DROP TABLE"),
    };

    const query = 'SELECT * from FOO;';
    assert.strictEqual(
      addSqlCommenterComment(trace.wrapSpanContext(spanContext), query),
      "SELECT * from FOO; /*traceparent='00-d4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-01',tracestate='foo%3D%27bar%2Cbaz%3D%27qux%21%28%29%2A%27%2Chack%3D%27DROP%20TABLE'*/"
    );
  });
});
