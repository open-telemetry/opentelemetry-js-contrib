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
import type * as FSType from 'fs';
import tests, { TestCase, TestCreator } from './definitions';
import type { FMember, FPMember, CreateHook, EndHook } from '../src/types';

const supportsPromises = parseInt(process.versions.node.split('.')[0], 10) > 8;

const TEST_ATTRIBUTE = 'test.attr';
const TEST_VALUE = 'test.attr.value';

const createHook = <CreateHook>sinon.spy(
  (fnName: FMember | FPMember, { args, span }) => {
    // `ts-node`, which we use via `ts-mocha` also patches module loading and creates
    // a lot of unrelated spans. Filter those out.
    if (['readFileSync', 'existsSync'].includes(fnName)) {
      const filename = args[0];
      if (!/test\/fixtures/.test(filename)) {
        return false;
      }
    }
    return true;
  }
);
const endHook = <EndHook>sinon.spy((fnName, { args, span }) => {
  span.setAttribute(TEST_ATTRIBUTE, TEST_VALUE);
});
const pluginConfig = {
  createHook,
  endHook,
};
const provider = new BasicTracerProvider();
const tracer = provider.getTracer('default');
const memoryExporter = new InMemorySpanExporter();
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

describe('fs instrumentation', () => {
  let contextManager: AsyncHooksContextManager;
  let fs: typeof FSType;
  let plugin: Instrumentation;

  beforeEach(async () => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
    plugin = new Instrumentation(pluginConfig);
    plugin.setTracerProvider(provider);
    plugin.enable();
    fs = require('fs');
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    plugin.disable();
    memoryExporter.reset();
    context.disable();
  });

  const syncTest: TestCreator = (
    name: FMember,
    args,
    { error, result },
    spans
  ) => {
    const syncName: FMember = `${name}Sync` as FMember;
    const rootSpanName = `${syncName} test span`;
    it(`${syncName} ${error ? 'error' : 'success'}`, () => {
      const rootSpan = tracer.startSpan(rootSpanName);

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      context.with(trace.setSpan(context.active(), rootSpan), () => {
        if (error) {
          assert.throws(() => Reflect.apply(fs[syncName], fs, args), error);
        } else {
          assert.deepEqual(Reflect.apply(fs[syncName], fs, args), result);
        }
      });
      rootSpan.end();

      assertSpans(memoryExporter.getFinishedSpans(), [
        ...spans.map((s: any) => {
          const spanName = s.name.replace(/%NAME/, syncName);
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

  const callbackTest: TestCreator = (
    name: FMember,
    args,
    { error, result },
    spans
  ) => {
    const rootSpanName = `${name} test span`;
    it(`${name} ${error ? 'error' : 'success'}`, done => {
      const rootSpan = tracer.startSpan(rootSpanName);

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      context.with(trace.setSpan(context.active(), rootSpan), () => {
        (fs[name] as Function)(
          ...args,
          (actualError: any | undefined, actualResult: any) => {
            assert.strictEqual(trace.getSpan(context.active()), rootSpan);

            try {
              rootSpan.end();
              if (error) {
                assert(
                  error.test(actualError?.message ?? ''),
                  `Expected ${actualError?.message} to match ${error}`
                );
              } else {
                if (actualError) {
                  return done(actualError);
                }
                assert.deepEqual(actualResult, result);
              }
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
              done();
            } catch (e) {
              done(e);
            }
          }
        );
      });
    });
  };

  const promiseTest: TestCreator = (
    name: FPMember,
    args,
    { error, result },
    spans
  ) => {
    const rootSpanName = `${name} test span`;
    it(`promises.${name} ${error ? 'error' : 'success'}`, async () => {
      const rootSpan = tracer.startSpan(rootSpanName);

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context
        .with(trace.setSpan(context.active(), rootSpan), () => {
          // eslint-disable-next-line node/no-unsupported-features/node-builtins
          return Reflect.apply(fs.promises[name], fs.promises, args);
        })
        .then((actualResult: any) => {
          if (error) {
            assert.fail(`promises.${name} did not reject`);
          } else {
            assert.deepEqual(actualResult, result);
          }
        })
        .catch((actualError: any) => {
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

  describe('Syncronous API', () => {
    const selection: TestCase[] = tests.filter(
      ([, , , , options = {}]) => options.sync !== false
    );

    describe('Instrumentation enabled', () => {
      selection.forEach(([name, args, result, spans]) => {
        syncTest(name, args, result, spans);
      });

      it('should instrument mkdirSync calls', () => {
        fs.mkdirSync('./test/fixtures/mkdirSync');
        fs.rmdirSync('./test/fixtures/mkdirSync');

        assertSpans(memoryExporter.getFinishedSpans(), [
          {
            name: 'fs mkdirSync',
            attributes: { [TEST_ATTRIBUTE]: TEST_VALUE },
          },
          {
            name: 'fs rmdirSync',
            attributes: { [TEST_ATTRIBUTE]: TEST_VALUE },
          },
        ]);
      });
    });

    describe('Instrumentation disabled', () => {
      beforeEach(() => {
        plugin.disable();
      });

      selection.forEach(([name, args, result]) => {
        syncTest(name, args, result, []);
      });
    });
  });

  describe('Callback API', () => {
    const selection: TestCase[] = tests.filter(
      ([, , , , options = {}]) => options.callback !== false
    );

    describe('Instrumentation enabled', () => {
      selection.forEach(([name, args, result, spans]) => {
        callbackTest(name, args, result, spans);
      });

      it('should not suppress tracing in callbacks', done => {
        const readFileCatchErrors = (cb: Function) => {
          fs.readFile('./test/fixtures/readtest', (err, result) => {
            try {
              if (err) {
                return done(err);
              }
              cb(result);
            } catch (err) {
              done(err);
            }
          });
        };

        readFileCatchErrors(() => {
          readFileCatchErrors(() => {
            assertSpans(memoryExporter.getFinishedSpans(), [
              {
                name: 'fs readFile',
                attributes: { [TEST_ATTRIBUTE]: TEST_VALUE },
              },
              {
                name: 'fs readFile',
                attributes: { [TEST_ATTRIBUTE]: TEST_VALUE },
              },
            ]);
            done();
          });
        });
      });
    });

    describe('Instrumentation disabled', () => {
      beforeEach(() => {
        plugin.disable();
      });

      selection.forEach(([name, args, result]) => {
        callbackTest(name, args, result, []);
      });
    });
  });

  if (supportsPromises) {
    describe('Promise API', () => {
      const selection: TestCase[] = tests.filter(
        ([, , , , options = {}]) => options.promise !== false
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
});

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
    assert.strictEqual(
      span.status.code,
      SpanStatusCode.UNSET,
      'Expected status to be unset'
    );
    assert.strictEqual(span.status.message, undefined);
  }
};
