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

import { context, trace } from '@opentelemetry/api';
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
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";

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
      assert.deepStrictEqual(pgValues, ['0']);
    });
  });

  describe('.getSemanticAttributesFromConnection()', () => {
    it('should set port attribute to undefined when port is not an integer', () => {
      assert.strictEqual(utils.getSemanticAttributesFromConnection({
          port: Infinity,
        })[SemanticAttributes.NET_PEER_PORT],
        undefined);
      assert.strictEqual(utils.getSemanticAttributesFromConnection({
        port: -Infinity,
      })[SemanticAttributes.NET_PEER_PORT],
        undefined);
      assert.strictEqual(utils.getSemanticAttributesFromConnection({
          port: NaN,
        })[SemanticAttributes.NET_PEER_PORT],
        undefined);
      assert.strictEqual(utils.getSemanticAttributesFromConnection({
          port: 1.234,
        })[SemanticAttributes.NET_PEER_PORT],
        undefined);
    });

    it('should set port attribute to undefined when port is an integer', () => {
      assert.strictEqual(utils.getSemanticAttributesFromConnection({
          port: 1234,
        })[SemanticAttributes.NET_PEER_PORT],
        1234);
      assert.strictEqual(utils.getSemanticAttributesFromConnection({
          port: Number.MAX_VALUE,
        })[SemanticAttributes.NET_PEER_PORT],
        Number.MAX_VALUE);
    });
  })
});
