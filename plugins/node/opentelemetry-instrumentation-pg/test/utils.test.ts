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

import { context } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import * as assert from 'assert';
import * as pg from 'pg';
import { PgInstrumentationConfig } from '../src';
import { AttributeNames } from '../src/enums';
import { PgClientExtended, NormalizedQueryConfig } from '../src/types';
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

  const instrumentationConfig: PgInstrumentationConfig &
    InstrumentationConfig = {};

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

  describe('.handleConfigQuery()', () => {
    const queryConfig: NormalizedQueryConfig = {
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

  describe('.handleParameterizedQuery()', () => {
    const query = 'SELECT $1::text';
    const values = ['0'];

    it('does not track pg.values by default', async () => {
      const querySpan = utils.handleParameterizedQuery.call(
        client,
        tracer,
        instrumentationConfig,
        query,
        values
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
      const querySpan = utils.handleParameterizedQuery.call(
        client,
        tracer,
        extPluginConfig,
        query,
        values
      );
      querySpan.end();

      const readableSpan = getLatestSpan();

      const pgValues = readableSpan.attributes[AttributeNames.PG_VALUES];
      assert.strictEqual(pgValues, '[0]');
    });
  });
});
