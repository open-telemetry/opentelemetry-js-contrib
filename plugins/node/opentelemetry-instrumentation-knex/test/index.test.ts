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

import { context, setSpan } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import * as assert from 'assert';

import Instrumentation from '../src';
const plugin = new Instrumentation();

import * as knex from 'knex';

describe('Knex instrumentation', () => {
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  plugin.setTracerProvider(provider);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncHooksContextManager;
  let client: any;

  before(() => {
    plugin.enable();
  });

  after(() => {
    plugin.disable();
  });

  beforeEach(async () => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());

    //@ts-ignore
    client = knex({
      client: 'sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
    });

    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    client.schema.dropTableIfExists('testTable');
    client.schema.dropTableIfExists('testTable1');
    client.schema.dropTableIfExists('testTable2');
    client.destroy();
  });

  describe('Instrumenting', () => {
    it('should record spans from query builder', async () => {
      const parentSpan = tracer.startSpan('parentSpan');
      await context.with(setSpan(context.active(), parentSpan), async () => {
        await client.schema.createTable('testTable1', (table: any) => {
          table.string('title');
        });
        await client.insert({ title: 'test1' }).into('testTable1');

        assert.deepEqual(await client('testTable1').select('*'), [
          { title: 'test1' },
        ]);

        parentSpan.end();

        const instrumentationSpans = memoryExporter.getFinishedSpans();
        const last = instrumentationSpans.pop() as any;
        assertSpans(instrumentationSpans, [
          {
            statement: 'create table `testTable1` (`title` varchar(255))',
            parentSpan,
          },
          {
            op: 'insert',
            table: 'testTable1',
            statement: 'insert into `testTable1` (`title`) values (?)',
            parentSpan,
          },
          {
            op: 'select',
            table: 'testTable1',
            statement: 'select * from `testTable1`',
            parentSpan,
          },
        ]);
        assert.strictEqual(instrumentationSpans[0].name, ':memory:');
        assert.strictEqual(
          instrumentationSpans[1].name,
          'insert :memory:.testTable1'
        );

        assert(last.name, 'parentSpan');
      });
    });

    it('should collect spans from raw', async () => {
      const parentSpan = tracer.startSpan('parentSpan');
      const statement = "select date('now')";

      await context.with(setSpan(context.active(), parentSpan), async () => {
        await client.raw(statement);
        parentSpan.end();

        assertSpans(memoryExporter.getFinishedSpans(), [
          { statement, op: 'raw', parentSpan },
          null,
        ]);
      });
    });

    it('should catch errors', async () => {
      const parentSpan = tracer.startSpan('parentSpan');
      const neverError = new Error('Query was expected to error');
      const MESSAGE = 'SQLITE_ERROR: no such table: testTable1';
      const CODE = 'SQLITE_ERROR';

      await context.with(setSpan(context.active(), parentSpan), async () => {
        await client
          .insert({ title: 'test1' })
          .into('testTable1')
          .then(() => {
            throw neverError;
          })
          .catch((err: any) => {
            assert.match(err.message, /SQLITE_ERROR/, err);
          });
        parentSpan.end();

        const events = memoryExporter.getFinishedSpans()[0].events!;

        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].name, 'exception');
        assert.strictEqual(
          events[0].attributes?.['exception.message'],
          MESSAGE
        );
        assert.strictEqual(events[0].attributes?.['exception.type'], CODE);

        assertSpans(memoryExporter.getFinishedSpans(), [
          {
            op: 'insert',
            table: 'testTable1',
            statement: 'insert into `testTable1` (`title`) values (?)',
            parentSpan,
          },
          null,
        ]);
      });
    });
  });

  describe('Disabling instrumentation', () => {
    it('should not create new spans', async () => {
      plugin.disable();
      const parentSpan = tracer.startSpan('parentSpan');

      await context.with(setSpan(context.active(), parentSpan), async () => {
        await client.raw("select date('now')");
        parentSpan.end();
        assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
        assert.notStrictEqual(memoryExporter.getFinishedSpans()[0], undefined);
      });
    });
  });
});

const assertSpans = (actualSpans: any[], expectedSpans: any[]) => {
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
      assert.match(span.name, new RegExp(expected.op));
      assert.match(span.name, new RegExp(':memory:'));
      assert.strictEqual(span.attributes['db.system'], 'sqlite');
      assert.strictEqual(span.attributes['db.name'], ':memory:');
      assert.strictEqual(span.attributes['db.sql.table'], expected.table);
      assert.strictEqual(span.attributes['db.statement'], expected.statement);
      assert.strictEqual(
        typeof span.attributes['knex.version'],
        'string',
        'knex.version not specified'
      );
      assert.strictEqual(span.attributes['db.operation'], expected.op);
      assert.strictEqual(
        span.parentSpanId,
        expected.parentSpan?.spanContext.spanId
      );
    } catch (e) {
      e.message = `At span[${idx}]: ${e.message}`;
      throw e;
    }
  });
};
