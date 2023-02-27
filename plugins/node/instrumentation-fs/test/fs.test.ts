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
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { promisify } from 'util';
import Instrumentation from '../src';
import * as sinon from 'sinon';
import type * as FSType from 'fs';
import tests, { TestCase, TestCreator } from './definitions';
import type { FMember, FPMember, CreateHook, EndHook } from '../src/types';
import {
  CALLBACK_FUNCTIONS,
  PROMISE_FUNCTIONS,
  SYNC_FUNCTIONS,
} from '../src/constants';
import { indexFs, splitTwoLevels } from '../src/utils';
import { assertSpans, makeRootSpanName } from './utils';

const TEST_ATTRIBUTE = 'test.attr';
const TEST_VALUE = 'test.attr.value';

const createHook = <CreateHook>sinon.spy(
  (fnName: FMember | FPMember, { args, span }) => {
    // `ts-node`, which we use via `ts-mocha` also patches module loading and creates
    // a lot of unrelated spans. Filter those out.
    if (['readFileSync', 'existsSync'].includes(fnName as string)) {
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
    Object.defineProperty(fs.promises, 'exists', {
      value: (...args: any[]) => {
        return Reflect.apply(promisify(fs.exists), fs, args);
      },
      configurable: true,
    });
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    delete (fs.promises as any)['exists'];
    plugin.disable();
    memoryExporter.reset();
    context.disable();
  });

  const syncTest: TestCreator<FMember> = (
    name: FMember,
    args,
    { error, result, resultAsError = null },
    spans
  ) => {
    const [functionNamePart1, functionNamePart2] =
      splitTwoLevels<typeof fs>(name);
    const syncName = `${functionNamePart1}Sync${
      functionNamePart2 ? `.${functionNamePart2}` : ''
    }` as FMember;
    const rootSpanName = `${syncName} test span`;
    it(`${syncName} ${error ? 'error' : 'success'}`, () => {
      const { objectToPatch, functionNameToPatch } = indexFs(fs, syncName);
      const rootSpan = tracer.startSpan(rootSpanName);

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      context.with(trace.setSpan(context.active(), rootSpan), () => {
        if (error) {
          assert.throws(
            () =>
              Reflect.apply(
                objectToPatch[functionNameToPatch],
                objectToPatch,
                args
              ),
            error
          );
        } else {
          assert.deepEqual(
            Reflect.apply(
              objectToPatch[functionNameToPatch],
              objectToPatch,
              args
            ),
            result ?? resultAsError
          );
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

  const callbackTest: TestCreator<FMember> = (
    name: FMember,
    args,
    { error, result, resultAsError = null },
    spans
  ) => {
    const rootSpanName = makeRootSpanName(name);
    it(`${name} ${error ? 'error' : 'success'}`, done => {
      const { objectToPatch, functionNameToPatch } = indexFs(fs, name);
      const rootSpan = tracer.startSpan(rootSpanName);

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      context.with(trace.setSpan(context.active(), rootSpan), () => {
        (objectToPatch[functionNameToPatch] as Function)(
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
                if (actualError !== undefined) {
                  // this usually would mean that there is an error, but with `exists` function
                  // returns the result as the error, check whether we expect that behavior
                  // and if not, error the test
                  if (resultAsError === undefined) {
                    if (actualError instanceof Error) {
                      return done(actualError);
                    } else {
                      return done(
                        new Error(
                          `Expected callback to be called without an error got: ${actualError}`
                        )
                      );
                    }
                  }
                }
                assert.deepEqual(actualError, resultAsError);
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
            typeof fs.promises[name] === 'function',
            `Expected fs.promises.${name} to be a function`
          );
          return Reflect.apply(fs.promises[name], fs.promises, args);
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

  describe('Synchronous API native', () => {
    beforeEach(() => {
      plugin.enable();
    });
    it('should not remove fs functions', () => {
      const isNode14 = process.versions.node.startsWith('14');
      const node14MissingFunctionNames = new Set([
        'cpSync',
        'cp',
        'promises.cp',
      ]);
      for (const fname of [...SYNC_FUNCTIONS, ...CALLBACK_FUNCTIONS]) {
        // some function were added after node 14
        if (node14MissingFunctionNames.has(fname) && isNode14) continue;

        const { objectToPatch, functionNameToPatch } = indexFs(fs, fname);
        assert.strictEqual(
          typeof objectToPatch[functionNameToPatch],
          'function',
          `fs.${fname} is not a function`
        );
      }
      for (const fname of PROMISE_FUNCTIONS) {
        if (node14MissingFunctionNames.has(fname) && isNode14) continue;
        const { objectToPatch, functionNameToPatch } = indexFs(
          fs.promises,
          fname
        );
        assert.strictEqual(
          typeof objectToPatch[functionNameToPatch],
          'function',
          `fs.promises.${fname} is not a function`
        );
      }
    });
  });

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
});
