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
  context,
  createTraceState,
  INVALID_SPAN_CONTEXT,
  SpanContext,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import * as pg from 'pg';
import { PgInstrumentationConfig } from '../src';
import { AttributeNames } from '../src/enums/AttributeNames';
import { PgClientExtended } from '../src/internal-types';
import * as utils from '../src/utils';

const memoryExporter = new InMemorySpanExporter();

const CONFIG = {
  user: process.env.POSTGRES_USER || 'postgres',
  database: process.env.POSTGRES_DB || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT
    ? parseInt(process.env.POSTGRES_PORT, 10)
    : 54320,
};

const getLatestSpan = () => {
  const spans = memoryExporter.getFinishedSpans();
  return spans[spans.length - 1];
};

describe('utils.ts', () => {
  const client = new pg.Client(CONFIG) as PgClientExtended;
  let contextManager: AsyncHooksContextManager;
  const provider = new BasicTracerProvider();
  const tracer = provider.getTracer('external');

  const instrumentationConfig: PgInstrumentationConfig & InstrumentationConfig =
    {};

  before(() => {
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  describe('.startSpan()', () => {
    it('starts real span when requireParentSpan=false', async () => {
      const span = utils.startSpan(tracer, instrumentationConfig, 'spanName', {
        key: 'value',
      });
      span.end();

      const readableSpan = getLatestSpan();

      assert.strictEqual(readableSpan.name, 'spanName');
      assert.strictEqual(readableSpan.attributes['key'], 'value');
      assert.notDeepStrictEqual(readableSpan.spanContext, INVALID_SPAN_CONTEXT);
    });

    it('starts real span when requireParentSpan=true and there is a parent span', async () => {
      const parent = tracer.startSpan('parentSpan');
      context.with(trace.setSpan(context.active(), parent), () => {
        const childSpan = utils.startSpan(
          tracer,
          {
            ...instrumentationConfig,
            requireParentSpan: true,
          },
          'childSpan',
          { key: 'value' }
        );
        childSpan.end();

        const readableSpan = getLatestSpan();
        assert.strictEqual(readableSpan.name, 'childSpan');
        assert.strictEqual(readableSpan.attributes['key'], 'value');
        assert.notDeepStrictEqual(
          readableSpan.spanContext,
          INVALID_SPAN_CONTEXT
        );
      });
    });

    it('creates placeholder span when requireParentSpan=true and there is no parent span', async () => {
      const span = utils.startSpan(
        tracer,
        {
          ...instrumentationConfig,
          requireParentSpan: true,
        },
        'spanName',
        { key: 'value' }
      );
      span.end();

      const readableSpan = getLatestSpan();
      assert.strictEqual(readableSpan, undefined);
    });
  });

  describe('.handleConfigQuery()', () => {
    const queryConfig = {
      text: 'SELECT $1::text',
      values: ['0'],
    };

    it('does not track pg.values by default', async () => {
      const querySpan = utils.handleConfigQuery.call(
        client,
        tracer,
        instrumentationConfig,
        queryConfig
      );
      querySpan.end();

      const readableSpan = getLatestSpan();

      const pgValues = readableSpan.attributes[AttributeNames.PG_VALUES];
      assert.strictEqual(pgValues, undefined);
    });

    it('tracks pg.values if enabled explicitly', async () => {
      const extPluginConfig: PgInstrumentationConfig & InstrumentationConfig = {
        ...instrumentationConfig,
        enhancedDatabaseReporting: true,
      };
      const querySpan = utils.handleConfigQuery.call(
        client,
        tracer,
        extPluginConfig,
        queryConfig
      );
      querySpan.end();

      const readableSpan = getLatestSpan();

      const pgValues = readableSpan.attributes[AttributeNames.PG_VALUES];
      assert.strictEqual(pgValues, '[0]');
    });
  });

  describe('addSqlCommenterComment', () => {
    it('adds comment to a simple query', () => {
      const spanContext: SpanContext = {
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
      };

      const query = 'SELECT * from FOO;';
      assert.strictEqual(
        utils.addSqlCommenterComment(trace.wrapSpanContext(spanContext), query),
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
        utils.addSqlCommenterComment(span, blockComment),
        blockComment
      );

      const dashedComment = 'SELECT * from FOO; -- Test comment';
      assert.strictEqual(
        utils.addSqlCommenterComment(span, dashedComment),
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
        utils.addSqlCommenterComment(trace.wrapSpanContext(spanContext), ''),
        ''
      );
    });

    it('does not add a comment if span context is invalid', () => {
      const query = 'SELECT * from FOO;';
      assert.strictEqual(
        utils.addSqlCommenterComment(
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
        utils.addSqlCommenterComment(trace.wrapSpanContext(spanContext), query),
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
        utils.addSqlCommenterComment(trace.wrapSpanContext(spanContext), query),
        "SELECT * from FOO; /*traceparent='00-d4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-01',tracestate='foo%3D%27bar%2Cbaz%3D%27qux%21%28%29%2A%27%2Chack%3D%27DROP%20TABLE'*/"
      );
    });
  });
});
