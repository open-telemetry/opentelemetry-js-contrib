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
import { context, trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import Instrumentation from '../src';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes as ResourceAttributesSC } from '@opentelemetry/semantic-conventions';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import * as sinon from 'sinon';
import type * as FSType from 'fs';

const TEST_ATTRIBUTE = 'test.attr';
const TEST_VALUE = 'test.attr.value';

const serviceName = 'fs-tests';

const createHook = sinon.spy((fnName, { args, span }) => {
  // `ts-node`, which we use via `ts-mocha` also patches module loading and creates
  // a lot of unrelated spans. Filter those out.
  if (['readFileSync', 'existsSync'].includes(fnName)) {
    const filename = args[0];
    if (!/test\/fixtures/.test(filename)) {
      return false;
    }
  }
  return true;
});
const endHook = sinon.spy((fnName, { args, span }) => {
  span.setAttribute(TEST_ATTRIBUTE, TEST_VALUE);
});
const plugin = new Instrumentation({
  createHook,
  endHook,
});
const exporter = new JaegerExporter();

const TEST_CONTENTS = Buffer.from('hello, world\n');

describe('fs instrumentation', () => {
  const provider = new BasicTracerProvider({
    resource: new Resource({
      [ResourceAttributesSC.SERVICE_NAME]: serviceName,
    }),
  });
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  plugin.setTracerProvider(provider);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncHooksContextManager;
  let fs: typeof FSType;

  beforeEach(async () => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
    fs = require('fs');
    plugin.enable();
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    plugin.disable();
    memoryExporter.reset();
    context.disable();
  });

  after(() => {
    return exporter.shutdown();
  });

  describe('Instrumenting syncronous calls', () => {
    it('should instrument readFileSync calls', () => {
      const rootSpan = tracer.startSpan('readFileSync test span');

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      context.with(trace.setSpan(context.active(), rootSpan), () => {
        assert.deepEqual(
          TEST_CONTENTS,
          fs.readFileSync('./test/fixtures/readtest')
        );
      });
      rootSpan.end();

      assertSpans(memoryExporter.getFinishedSpans(), [
        { name: 'fs openSync', attributes: { [TEST_ATTRIBUTE]: TEST_VALUE } },
        { name: 'fs readSync', attributes: { [TEST_ATTRIBUTE]: TEST_VALUE } },
        { name: 'fs closeSync', attributes: { [TEST_ATTRIBUTE]: TEST_VALUE } },
        {
          name: 'fs readFileSync',
          attributes: { [TEST_ATTRIBUTE]: TEST_VALUE },
        },
        { name: 'readFileSync test span' },
      ]);
    });

    it('should catch errors on readFileSync calls', () => {
      const rootSpan = tracer.startSpan('readFileSync test span');

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      context.with(trace.setSpan(context.active(), rootSpan), () => {
        const fs = require('fs');
        assert.throws(
          () => fs.readFileSync('./test/fixtures/readtest-404'),
          /enoent/i
        );
      });
      rootSpan.end();

      assertSpans(memoryExporter.getFinishedSpans(), [
        {
          name: 'fs openSync',
          error: /ENOENT/,
          attributes: { [TEST_ATTRIBUTE]: TEST_VALUE },
        },
        {
          name: 'fs readFileSync',
          error: /ENOENT/,
          attributes: { [TEST_ATTRIBUTE]: TEST_VALUE },
        },
        { name: 'readFileSync test span' },
      ]);
    });

    it('should instrument writeFileSync calls', () => {
      fs.writeFileSync('./test/fixtures/writetest', Buffer.from(TEST_CONTENTS));

      assertSpans(memoryExporter.getFinishedSpans(), [
        { name: 'fs openSync', attributes: { [TEST_ATTRIBUTE]: TEST_VALUE } },
        { name: 'fs writeSync', attributes: { [TEST_ATTRIBUTE]: TEST_VALUE } },
        { name: 'fs closeSync', attributes: { [TEST_ATTRIBUTE]: TEST_VALUE } },
        {
          name: 'fs writeFileSync',
          attributes: { [TEST_ATTRIBUTE]: TEST_VALUE },
        },
      ]);
    });

    it('should instrument mkdirSync calls', () => {
      fs.mkdirSync('./test/fixtures/mkdirSync');
      fs.rmdirSync('./test/fixtures/mkdirSync');

      assertSpans(memoryExporter.getFinishedSpans(), [
        { name: 'fs mkdirSync', attributes: { [TEST_ATTRIBUTE]: TEST_VALUE } },
        { name: 'fs rmdirSync', attributes: { [TEST_ATTRIBUTE]: TEST_VALUE } },
      ]);
    });
  });

  describe('Instrumenting asyncronous calls', () => {
    it('should instrument readFile calls', done => {
      const rootSpan = tracer.startSpan('readFile test span');

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      context.with(trace.setSpan(context.active(), rootSpan), () => {
        fs.readFile('./test/fixtures/readtest', (err, result) => {
          try {
            rootSpan.end();
            if (err) {
              return done(err);
            }
            assert.deepEqual(TEST_CONTENTS, result);
            assertSpans(memoryExporter.getFinishedSpans(), [
              {
                name: 'fs readFile',
                attributes: { [TEST_ATTRIBUTE]: TEST_VALUE },
              },
              { name: 'readFile test span' },
            ]);
            done();
          } catch (e) {
            done(e);
          }
        });
      });
    });

    it('should catch errors on readFile calls', done => {
      const rootSpan = tracer.startSpan('readFile test span');

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      context.with(trace.setSpan(context.active(), rootSpan), () => {
        fs.readFile('./test/fixtures/readtest-404', (err, result) => {
          try {
            rootSpan.end();
            assert(
              /enoent/i.test(err?.message || ''),
              `Expected ${err?.message} to match /enoent/i`
            );
            assertSpans(memoryExporter.getFinishedSpans(), [
              {
                name: 'fs readFile',
                error: /ENOENT/,
                attributes: { [TEST_ATTRIBUTE]: TEST_VALUE },
              },
              { name: 'readFile test span' },
            ]);
            done();
          } catch (e) {
            done(e);
          }
        });
      });
    });
  });

  describe('Disabling instrumentation', () => {
    it('should not create new spans', async () => {
      const fs = require('fs');
      plugin.disable();
      assert.deepEqual(
        TEST_CONTENTS,
        fs.readFileSync('./test/fixtures/readtest')
      );
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
    });
  });
});

const assertSpans = (spans: ReadableSpan[], expected: any) => {
  assert.strictEqual(
    spans.length,
    expected.length,
    `Expected ${expected.length} spans, got ${spans.length}(${spans
      .map(s => `"${s.name}"`)
      .join(', ')})`
  );

  spans.forEach((span, i) => {
    assertSpan(span, expected[i]);
  });

  assert.strictEqual(
    spans.length,
    expected.length,
    `Expected ${expected.length} spans, got ${spans.length}`
  );
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
      span.parentSpanId,
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
    assert.strictEqual(span.status.message, undefined);
    assert.strictEqual(
      span.status.code,
      SpanStatusCode.UNSET,
      'Expected status to be unset'
    );
  }
};
