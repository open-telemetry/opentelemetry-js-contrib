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
import * as sinon from 'sinon';
import type * as FSPromisesType from 'fs/promises';
import tests, { FsFunction, TestCase, TestCreator } from './definitions';
import type { FMember, FPMember, EndHook } from '../src/types';

const supportsPromises =
  parseInt(process.versions.node.split('.')[0], 10) >= 14;

const TEST_ATTRIBUTE = 'test.attr';
const TEST_VALUE = 'test.attr.value';

const endHook = <EndHook>sinon.spy((fnName, { args, span }) => {
  span.setAttribute(TEST_ATTRIBUTE, TEST_VALUE);
});
const pluginConfig = {
  endHook,
};
const provider = new BasicTracerProvider();
const tracer = provider.getTracer('default');
const memoryExporter = new InMemorySpanExporter();
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

if (supportsPromises) {
  describe('fs/promises instrumentation', () => {
    let contextManager: AsyncHooksContextManager;
    let fsPromises: typeof FSPromisesType;
    let plugin: Instrumentation;

    beforeEach(async () => {
      contextManager = new AsyncHooksContextManager();
      context.setGlobalContextManager(contextManager.enable());
      plugin = new Instrumentation(pluginConfig);
      plugin.setTracerProvider(provider);
      plugin.enable();
      fsPromises = require('fs/promises');
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
    });

    afterEach(() => {
      plugin.disable();
      memoryExporter.reset();
      context.disable();
    });

    const makeRootSpanName = (name: FMember): string => {
      let rsn: string;
      if (Array.isArray(name)) {
        rsn = `${name[0]}.${name[1]}`;
      } else {
        rsn = `${name}`;
      }
      rsn = `${rsn} test span`;
      return rsn;
    };

    const promiseTest: TestCreator<FPMember> = (
      name: FPMember,
      args,
      { error, result, resultAsError = null, hasPromiseVersion = true },
      spans
    ) => {
      if (!hasPromiseVersion) return;
      const rootSpanName = makeRootSpanName(name);
      it(`promises.${name} ${error ? 'error' : 'success'}`, async () => {
        const rootSpan = tracer.startSpan(rootSpanName);

        assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
        await context
          .with(trace.setSpan(context.active(), rootSpan), () => {
            // eslint-disable-next-line node/no-unsupported-features/node-builtins
            assert(
              typeof fsPromises[name] === 'function',
              `Expected fsPromises.${name} to be a function`
            );
            return Reflect.apply(fsPromises[name], fsPromises, args);
          })
          .then((actualResult: any) => {
            if (error) {
              assert.fail(`promises.${name} did not reject`);
            } else {
              assert.deepEqual(actualResult, result ?? resultAsError);
            }
          })
          .catch((actualError: any) => {
            assert(
              actualError instanceof Error,
              `Expected caugth error to be instance of Error. Got ${actualError}`
            );
            if (error) {
              assert(
                error.test(actualError?.message ?? ''),
                `Expected "${actualError?.message}" to match ${error}`
              );
            } else {
              actualError.message = `Did not expect promises.${name} to reject: ${actualError.message}`;
              assert.fail(actualError);
            }
          });
        rootSpan.end();
        assertSpans(memoryExporter.getFinishedSpans(), [
          ...spans.map((s: any) => {
            const spanName = s.name.replace(/%NAME/, name);
            const attributes = {
              ...(s.attributes ?? {}),
            };
            attributes[TEST_ATTRIBUTE] = TEST_VALUE;
            return {
              ...s,
              name: spanName,
              attributes,
            };
          }),
          { name: rootSpanName },
        ]);
      });
    };

    const selection: TestCase[] = tests.filter(
      ([name, , , , options = {}]) =>
        options.promise !== false && name !== ('exists' as FsFunction)
    );

    describe('Instrumentation enabled', () => {
      selection.forEach(([name, args, result, spans]) => {
        promiseTest(name as FPMember, args, result, spans);
      });
    });

    describe('Instrumentation disabled', () => {
      beforeEach(() => {
        plugin.disable();
      });

      selection.forEach(([name, args, result]) => {
        promiseTest(name as FPMember, args, result, []);
      });
    });
  });
}

const assertSpans = (spans: ReadableSpan[], expected: any) => {
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
    assert.strictEqual(
      span.status.code,
      SpanStatusCode.UNSET,
      'Expected status to be unset'
    );
    assert.strictEqual(span.status.message, undefined);
  }
};
