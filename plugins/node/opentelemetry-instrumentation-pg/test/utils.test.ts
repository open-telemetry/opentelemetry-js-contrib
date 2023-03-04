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
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
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

  describe('.getQuerySpanName()', () => {
    const dummyQuery = {
      text: 'SELECT $1',
      values: ['hello'],
      name: 'select-placeholder-val',
    };

    it('uses prepared statement name when given, over query text', () => {
      assert.strictEqual(
        utils.getQuerySpanName('dbName', dummyQuery),
        'pg.query:select-placeholder-val dbName'
      );
    });

    it('falls back to parsing query text when no (valid) name is available', () => {
      assert.strictEqual(
        utils.getQuerySpanName('dbName', { ...dummyQuery, name: undefined }),
        'pg.query:SELECT dbName'
      );
    });

    it('normalizes operation names parsed from query text', () => {
      const queryUpperCase = { text: dummyQuery.text.toUpperCase() };
      const queryLowerCase = { text: dummyQuery.text.toLowerCase() };

      assert.strictEqual(
        utils.getQuerySpanName('dbName', queryUpperCase),
        utils.getQuerySpanName('dbName', queryLowerCase)
      );
    });

    it('ignores trailing semicolons when parsing operation names', () => {
      assert.strictEqual(
        utils.getQuerySpanName('dbName', { text: 'COMMIT;' }),
        'pg.query:COMMIT dbName'
      );
    });

    it('omits db name if missing', () => {
      assert.strictEqual(
        utils.getQuerySpanName(undefined, dummyQuery),
        'pg.query:select-placeholder-val'
      );
    });

    it('should omit all info if the queryConfig is invalid', () => {
      assert.strictEqual(
        utils.getQuerySpanName('db-name-ignored', undefined),
        'pg.query'
      );
    });
  });

  describe('.getSemanticAttributesFromConnection()', () => {
    const expectedAtributes = {
      [SemanticAttributes.DB_NAME]: CONFIG.database,
      [SemanticAttributes.NET_PEER_NAME]: CONFIG.host,
      [SemanticAttributes.DB_CONNECTION_STRING]: `postgresql://${CONFIG.host}:${CONFIG.port}/${CONFIG.database}`,
      [SemanticAttributes.NET_PEER_PORT]: CONFIG.port,
      [SemanticAttributes.DB_USER]: CONFIG.user,
    };

    it('returns attributes from connection object', () => {
      assert.deepStrictEqual(
        utils.getSemanticAttributesFromConnection(CONFIG),
        expectedAtributes
      );
    });

    it('returns attributes from pool object', () => {
      assert.deepStrictEqual(
        utils.getSemanticAttributesFromConnection({
          ...CONFIG,
          maxClient: 1,
          idleTimeoutMillis: 10000,
        }),
        expectedAtributes
      );
    });

    it('returns attributes from pool object having connectionString', () => {
      assert.deepStrictEqual(
        utils.getSemanticAttributesFromConnection({
          connectionString: `postgresql://${CONFIG.user}:password@${CONFIG.host}:${CONFIG.port}/${CONFIG.database}`,
          maxClient: 1,
          idleTimeoutMillis: 10000,
        }),
        expectedAtributes
      );
    });
  });

  describe('.shouldSkipInstrumentation()', () => {
    it('returns false when requireParentSpan=false', async () => {
      assert.strictEqual(
        utils.shouldSkipInstrumentation(instrumentationConfig),
        false
      );
    });

    it('returns false requireParentSpan=true and there is a parent span', async () => {
      const parent = tracer.startSpan('parentSpan');
      context.with(trace.setSpan(context.active(), parent), () => {
        assert.strictEqual(
          utils.shouldSkipInstrumentation({
            ...instrumentationConfig,
            requireParentSpan: true,
          }),
          false
        );
      });
    });

    it('returns true when requireParentSpan=true and there is no parent span', async () => {
      assert.strictEqual(
        utils.shouldSkipInstrumentation({
          ...instrumentationConfig,
          requireParentSpan: true,
        }),
        true
      );
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
