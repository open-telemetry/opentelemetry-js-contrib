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
  SpanStatusCode,
  context,
  SpanKind,
  SpanStatus,
  trace,
  Span,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import {
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as ioredisTypes from 'ioredis';
import { IORedisInstrumentation } from '../src';
import {
  IORedisInstrumentationConfig,
  DbStatementSerializer,
  IORedisRequestHookInformation,
} from '../src/types';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import { defaultDbStatementSerializer } from '../src/utils';

const memoryExporter = new InMemorySpanExporter();

const CONFIG = {
  host: process.env.OPENTELEMETRY_REDIS_HOST || 'localhost',
  port: parseInt(process.env.OPENTELEMETRY_REDIS_PORT || '63790', 10),
};

const URL = `redis://${CONFIG.host}:${CONFIG.port}`;

const DEFAULT_ATTRIBUTES = {
  [SemanticAttributes.DB_SYSTEM]: DbSystemValues.REDIS,
  [SemanticAttributes.NET_PEER_NAME]: CONFIG.host,
  [SemanticAttributes.NET_PEER_PORT]: CONFIG.port,
  [SemanticAttributes.DB_CONNECTION_STRING]: URL,
};

const unsetStatus: SpanStatus = {
  code: SpanStatusCode.UNSET,
};

const predictableStackTrace =
  '-- Stack trace replaced by test to predictable value -- ';
const sanitizeEventForAssertion = (span: ReadableSpan) => {
  span.events.forEach(e => {
    // stack trace includes data such as /user/{userName}/repos/{projectName}
    if (e.attributes?.[SemanticAttributes.EXCEPTION_STACKTRACE]) {
      e.attributes[SemanticAttributes.EXCEPTION_STACKTRACE] =
        predictableStackTrace;
    }

    // since time will change on each test invocation, it is being replaced to predicable value
    e.time = [0, 0];
  });
};

describe('ioredis', () => {
  const provider = new NodeTracerProvider();
  let ioredis: typeof ioredisTypes;
  let instrumentation: IORedisInstrumentation;
  const shouldTestLocal = process.env.RUN_REDIS_TESTS_LOCAL;
  const shouldTest = process.env.RUN_REDIS_TESTS || shouldTestLocal;

  let contextManager: AsyncHooksContextManager;
  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    context.disable();
  });

  before(function () {
    // needs to be "function" to have MochaContext "this" context
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    }

    if (shouldTestLocal) {
      testUtils.startDocker('redis');
    }

    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation = new IORedisInstrumentation();
    instrumentation.setTracerProvider(provider);
    ioredis = require('ioredis');
  });

  after(() => {
    if (shouldTestLocal) {
      testUtils.cleanUpDocker('redis');
    }
  });

  it('should have correct module name', () => {
    assert.strictEqual(
      instrumentation.instrumentationName,
      '@opentelemetry/instrumentation-ioredis'
    );
  });

  describe('#createClient()', () => {
    it('should propagate the current span to event handlers', done => {
      const span = provider.getTracer('ioredis-test').startSpan('test span');
      let client: ioredisTypes.Redis;
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [SemanticAttributes.DB_STATEMENT]: 'connect',
      };
      const readyHandler = () => {
        const endedSpans = memoryExporter.getFinishedSpans();

        assert.strictEqual(trace.getSpan(context.active()), span);
        assert.strictEqual(endedSpans.length, 2);
        assert.strictEqual(endedSpans[0].name, 'connect');
        assert.strictEqual(endedSpans[1].name, 'info');
        testUtils.assertPropagation(endedSpans[0], span);

        testUtils.assertSpan(
          endedSpans[0],
          SpanKind.CLIENT,
          attributes,
          [],
          unsetStatus
        );
        span.end();
        assert.strictEqual(endedSpans.length, 3);
        assert.strictEqual(endedSpans[2].name, 'test span');

        client.quit(() => {
          assert.strictEqual(endedSpans.length, 4);
          assert.strictEqual(endedSpans[3].name, 'quit');
          done();
        });
      };
      const errorHandler = (err: Error) => {
        assert.ifError(err);
        client.quit(done);
      };

      context.with(trace.setSpan(context.active(), span), () => {
        client = new ioredis(URL);
        client.on('ready', readyHandler);
        client.on('error', errorHandler);
      });
    });
  });

  describe('#send_internal_message()', () => {
    // use a random part in key names because redis instance is used for parallel running tests
    const randomId = ((Math.random() * 2 ** 32) >>> 0).toString(16);
    const testKeyName = `test-${randomId}`;
    const hashKeyName = `hash-${randomId}`;

    let client: ioredisTypes.Redis;

    const IOREDIS_CALLBACK_OPERATIONS: Array<{
      description: string;
      name: string;
      args: Array<string>;
      serializedArgs: Array<string>;
      method: (cb: ioredisTypes.CallbackFunction<unknown>) => unknown;
    }> = [
      {
        description: 'insert',
        name: 'hset',
        args: [hashKeyName, 'testField', 'testValue'],
        serializedArgs: [hashKeyName, 'testField', '[1 other arguments]'],
        method: (cb: ioredisTypes.CallbackFunction<number>) =>
          client.hset(hashKeyName, 'testField', 'testValue', cb),
      },
      {
        description: 'get',
        name: 'get',
        args: [testKeyName],
        serializedArgs: [testKeyName],
        method: (cb: ioredisTypes.CallbackFunction<string | null>) =>
          client.get(testKeyName, cb),
      },
    ];

    before(done => {
      client = new ioredis(URL);
      client.on('error', err => {
        done(err);
      });
      client.on('ready', done);
    });

    beforeEach(async () => {
      await client.set(testKeyName, 'data');
      memoryExporter.reset();
    });

    after(done => {
      client.quit(done);
    });

    afterEach(async () => {
      await client.del(hashKeyName);
      await client.del(testKeyName);
      await client.del('response-hook-test');
      memoryExporter.reset();
    });

    describe('Instrumenting query operations', () => {
      before(() => {
        instrumentation.disable();
        instrumentation = new IORedisInstrumentation();
        instrumentation.setTracerProvider(provider);
        require('ioredis');
      });

      IOREDIS_CALLBACK_OPERATIONS.forEach(command => {
        it(`should create a child span for cb style ${command.description}`, done => {
          const attributes = {
            ...DEFAULT_ATTRIBUTES,
            [SemanticAttributes.DB_STATEMENT]: `${
              command.name
            } ${command.serializedArgs.join(' ')}`,
          };
          const span = provider
            .getTracer('ioredis-test')
            .startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            command.method((err, _result) => {
              assert.ifError(err);
              assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
              span.end();
              const endedSpans = memoryExporter.getFinishedSpans();
              assert.strictEqual(endedSpans.length, 2);
              assert.strictEqual(endedSpans[0].name, command.name);
              testUtils.assertSpan(
                endedSpans[0],
                SpanKind.CLIENT,
                attributes,
                [],
                unsetStatus
              );
              testUtils.assertPropagation(endedSpans[0], span);
              done();
            });
          });
        });
      });

      it('should create a child span for hset promise', async () => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [SemanticAttributes.DB_STATEMENT]: `hset ${hashKeyName} random [1 other arguments]`,
        };
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          try {
            await client.hset(hashKeyName, 'random', 'random');
            assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
            span.end();
            const endedSpans = memoryExporter.getFinishedSpans();
            assert.strictEqual(endedSpans.length, 2);
            assert.strictEqual(endedSpans[0].name, 'hset');
            testUtils.assertSpan(
              endedSpans[0],
              SpanKind.CLIENT,
              attributes,
              [],
              unsetStatus
            );
            testUtils.assertPropagation(endedSpans[0], span);
          } catch (error) {
            assert.ifError(error);
          }
        });
      });

      it('should set span with error when redis return reject', async () => {
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          await client.set('non-int-key', 'non-int-value');
          try {
            // should throw 'ReplyError: ERR value is not an integer or out of range'
            // because the value im the key is not numeric and we try to increment it
            await client.incr('non-int-key');
          } catch (ex) {
            const endedSpans = memoryExporter.getFinishedSpans();
            assert.strictEqual(endedSpans.length, 2);
            const ioredisSpan = endedSpans[1];
            // redis 'incr' operation failed with exception, so span should indicate it
            assert.strictEqual(ioredisSpan.status.code, SpanStatusCode.ERROR);
            const exceptionEvent = ioredisSpan.events[0];
            assert.strictEqual(exceptionEvent.name, 'exception');
            assert.strictEqual(
              exceptionEvent.attributes?.[SemanticAttributes.EXCEPTION_MESSAGE],
              ex.message
            );
            assert.strictEqual(
              exceptionEvent.attributes?.[
                SemanticAttributes.EXCEPTION_STACKTRACE
              ],
              ex.stack
            );
            assert.strictEqual(
              exceptionEvent.attributes?.[SemanticAttributes.EXCEPTION_TYPE],
              ex.name
            );
          }
        });
      });

      it('should create a child span for streamify scanning', done => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [SemanticAttributes.DB_STATEMENT]: 'scan 0 MATCH test-* COUNT 1000',
        };
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const stream = client.scanStream({
            count: 1000,
            match: 'test-*',
          });
          stream
            .on('end', () => {
              assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
              span.end();
              const endedSpans = memoryExporter.getFinishedSpans();
              assert.strictEqual(endedSpans.length, 2);
              assert.strictEqual(endedSpans[0].name, 'scan');
              testUtils.assertSpan(
                endedSpans[0],
                SpanKind.CLIENT,
                attributes,
                [],
                unsetStatus
              );
              testUtils.assertPropagation(endedSpans[0], span);
              done();
            })
            .on('error', err => {
              done(err);
            });

          // Put stream into flowing mode so it will invoke 'end' listener
          stream.resume();
        });
      });

      it('should create a child span for pubsub', async () => {
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          try {
            // use lazyConnect so we can call the `connect` function and await it.
            // this ensures that all operations are sequential and predictable.
            const pub = new ioredis(URL, { lazyConnect: true });
            await pub.connect();
            const sub = new ioredis(URL, { lazyConnect: true });
            await sub.connect();
            await sub.subscribe('news', 'music');
            await pub.publish('news', 'Hello world!');
            await pub.publish('music', 'Hello again!');
            await sub.unsubscribe('news', 'music');
            await sub.quit();
            await pub.quit();
            const endedSpans = memoryExporter.getFinishedSpans();
            assert.strictEqual(endedSpans.length, 10);
            span.end();
            assert.strictEqual(endedSpans.length, 11);
            const expectedSpanNames = [
              'connect',
              'info',
              'connect',
              'info',
              'subscribe',
              'publish',
              'publish',
              'unsubscribe',
              'quit',
              'quit',
              'test span',
            ];

            const actualSpanNames = endedSpans.map(s => s.name);
            assert.deepStrictEqual(
              actualSpanNames.sort(),
              expectedSpanNames.sort()
            );

            const attributes = {
              ...DEFAULT_ATTRIBUTES,
              [SemanticAttributes.DB_STATEMENT]: 'subscribe news music',
            };
            testUtils.assertSpan(
              endedSpans[4],
              SpanKind.CLIENT,
              attributes,
              [],
              unsetStatus
            );
            testUtils.assertPropagation(endedSpans[0], span);
          } catch (error) {
            assert.ifError(error);
          }
        });
      });

      it('should create a child span for multi/transaction', done => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [SemanticAttributes.DB_STATEMENT]: 'multi',
        };

        const span = provider.getTracer('ioredis-test').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          client
            .multi()
            .set('foo', 'bar')
            .get('foo')
            .exec((err, _results) => {
              assert.ifError(err);

              assert.strictEqual(memoryExporter.getFinishedSpans().length, 4);
              span.end();
              const endedSpans = memoryExporter.getFinishedSpans();
              assert.strictEqual(endedSpans.length, 5);
              assert.strictEqual(endedSpans[0].name, 'multi');
              assert.strictEqual(endedSpans[1].name, 'set');
              assert.strictEqual(endedSpans[2].name, 'get');
              assert.strictEqual(endedSpans[3].name, 'exec');
              testUtils.assertSpan(
                endedSpans[0],
                SpanKind.CLIENT,
                attributes,
                [],
                unsetStatus
              );
              testUtils.assertPropagation(endedSpans[0], span);
              done();
            });
        });
      });

      it('should create a child span for pipeline', done => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [SemanticAttributes.DB_STATEMENT]: 'set foo [1 other arguments]',
        };

        const span = provider.getTracer('ioredis-test').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          const pipeline = client.pipeline();
          pipeline.set('foo', 'bar');
          pipeline.del('cc');
          pipeline.exec((err, results) => {
            assert.ifError(err);

            assert.strictEqual(memoryExporter.getFinishedSpans().length, 2);
            span.end();
            const endedSpans = memoryExporter.getFinishedSpans();
            assert.strictEqual(endedSpans.length, 3);
            assert.strictEqual(endedSpans[0].name, 'set');
            assert.strictEqual(endedSpans[1].name, 'del');
            assert.strictEqual(endedSpans[2].name, 'test span');
            testUtils.assertSpan(
              endedSpans[0],
              SpanKind.CLIENT,
              attributes,
              [],
              unsetStatus
            );
            testUtils.assertPropagation(endedSpans[0], span);
            done();
          });
        });
      });

      it('should create a child span for get promise', async () => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [SemanticAttributes.DB_STATEMENT]: `get ${testKeyName}`,
        };
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          try {
            const value = await client.get(testKeyName);
            assert.strictEqual(value, 'data');
            assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
            span.end();
            const endedSpans = memoryExporter.getFinishedSpans();
            assert.strictEqual(endedSpans.length, 2);
            assert.strictEqual(endedSpans[0].name, 'get');
            testUtils.assertSpan(
              endedSpans[0],
              SpanKind.CLIENT,
              attributes,
              [],
              unsetStatus
            );
            testUtils.assertPropagation(endedSpans[0], span);
          } catch (error) {
            assert.ifError(error);
          }
        });
      });

      it('should create a child span for del', async () => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [SemanticAttributes.DB_STATEMENT]: `del ${testKeyName}`,
        };
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          try {
            const result = await client.del(testKeyName);
            assert.strictEqual(result, 1);
            assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
            span.end();
            const endedSpans = memoryExporter.getFinishedSpans();
            assert.strictEqual(endedSpans.length, 2);
            assert.strictEqual(endedSpans[0].name, 'del');
            testUtils.assertSpan(
              endedSpans[0],
              SpanKind.CLIENT,
              attributes,
              [],
              unsetStatus
            );
            testUtils.assertPropagation(endedSpans[0], span);
          } catch (error) {
            assert.ifError(error);
          }
        });
      });

      it('should create a child span for lua', done => {
        const config: IORedisInstrumentationConfig = {
          requireParentSpan: false,
        };
        instrumentation.setConfig(config);

        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [SemanticAttributes.DB_STATEMENT]: `evalsha bfbf458525d6a0b19200bfd6db3af481156b367b 1 ${testKeyName}`,
        };

        const span = provider.getTracer('ioredis-test').startSpan('test span');
        context.with(trace.setSpan(context.active(), span), () => {
          // This will define a command echo:
          client.defineCommand('echo', {
            numberOfKeys: 1,
            lua: 'return {KEYS[1],ARGV[1]}',
          });
          // Now `echo` can be used just like any other ordinary command,
          // and ioredis will try to use `EVALSHA` internally when possible for better performance.
          client.echo(testKeyName, (err, result) => {
            assert.ifError(err);

            span.end();
            const endedSpans = memoryExporter.getFinishedSpans();
            const evalshaSpan = endedSpans[0];
            // the script may be already cached on server therefore we get either 2 or 3 spans
            if (endedSpans.length === 3) {
              assert.strictEqual(endedSpans[2].name, 'test span');
              assert.strictEqual(endedSpans[1].name, 'eval');
              assert.strictEqual(endedSpans[0].name, 'evalsha');
              // in this case, server returns NOSCRIPT error for evalsha,
              // telling the client to use EVAL instead
              sanitizeEventForAssertion(evalshaSpan);
              testUtils.assertSpan(
                evalshaSpan,
                SpanKind.CLIENT,
                attributes,
                [
                  {
                    attributes: {
                      [SemanticAttributes.EXCEPTION_MESSAGE]:
                        'NOSCRIPT No matching script. Please use EVAL.',
                      [SemanticAttributes.EXCEPTION_STACKTRACE]:
                        predictableStackTrace,
                      [SemanticAttributes.EXCEPTION_TYPE]: 'ReplyError',
                    },
                    name: 'exception',
                    time: [0, 0],
                  },
                ],
                {
                  code: SpanStatusCode.ERROR,
                }
              );
            } else {
              assert.strictEqual(endedSpans.length, 2);
              assert.strictEqual(endedSpans[1].name, 'test span');
              assert.strictEqual(endedSpans[0].name, 'evalsha');
              testUtils.assertSpan(
                evalshaSpan,
                SpanKind.CLIENT,
                attributes,
                [],
                unsetStatus
              );
            }
            testUtils.assertPropagation(evalshaSpan, span);
            done();
          });
        });
      });
    });

    describe('Instrumenting without parent span', () => {
      before(() => {
        const config: IORedisInstrumentationConfig = {
          requireParentSpan: true,
        };
        instrumentation.setConfig(config);
      });
      it('should not create child span', async () => {
        await client.set(testKeyName, 'data');
        const result = await client.del(testKeyName);
        assert.strictEqual(result, 1);
        assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      });
    });

    describe('Instrumentation with requireParentSpan', () => {
      it('should instrument with requireParentSpan equal false', async () => {
        const config: IORedisInstrumentationConfig = {
          requireParentSpan: false,
        };
        instrumentation.setConfig(config);

        await client.set(testKeyName, 'data');
        const result = await client.del(testKeyName);
        assert.strictEqual(result, 1);

        const endedSpans = memoryExporter.getFinishedSpans();
        assert.strictEqual(endedSpans.length, 2);

        testUtils.assertSpan(
          endedSpans[0],
          SpanKind.CLIENT,
          {
            ...DEFAULT_ATTRIBUTES,
            [SemanticAttributes.DB_STATEMENT]: `set ${testKeyName} [1 other arguments]`,
          },
          [],
          unsetStatus
        );
      });

      it('should not instrument with requireParentSpan equal true', async () => {
        const config: IORedisInstrumentationConfig = {
          requireParentSpan: true,
        };
        instrumentation.setConfig(config);

        await client.set(testKeyName, 'data');
        const result = await client.del(testKeyName);
        assert.strictEqual(result, 1);

        assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      });
    });

    describe('Instrumenting with a custom db.statement serializer', () => {
      const dbStatementSerializer: DbStatementSerializer = (cmdName, cmdArgs) =>
        `FOOBAR_${cmdName}: ${cmdArgs[0]}`;
      before(() => {
        const config: IORedisInstrumentationConfig = {
          dbStatementSerializer,
        };
        instrumentation.setConfig(config);
      });

      IOREDIS_CALLBACK_OPERATIONS.forEach(command => {
        it(`should tag the span with a custom db.statement for cb style ${command.description}`, done => {
          const attributes = {
            ...DEFAULT_ATTRIBUTES,
            [SemanticAttributes.DB_STATEMENT]: dbStatementSerializer(
              command.name,
              command.args
            ),
          };
          const span = provider
            .getTracer('ioredis-test')
            .startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            command.method((err, _result) => {
              assert.ifError(err);
              assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
              span.end();
              const endedSpans = memoryExporter.getFinishedSpans();
              assert.strictEqual(endedSpans.length, 2);
              assert.strictEqual(endedSpans[0].name, command.name);
              testUtils.assertSpan(
                endedSpans[0],
                SpanKind.CLIENT,
                attributes,
                [],
                unsetStatus
              );
              testUtils.assertPropagation(endedSpans[0], span);
              done();
            });
          });
        });
      });
    });

    describe('Removing instrumentation', () => {
      before(() => {
        instrumentation.disable();
      });

      IOREDIS_CALLBACK_OPERATIONS.forEach(operation => {
        it(`should not create a child span for cb style ${operation.description}`, done => {
          const span = provider
            .getTracer('ioredis-test')
            .startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            operation.method((err, _) => {
              assert.ifError(err);
              assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
              span.end();
              const endedSpans = memoryExporter.getFinishedSpans();
              assert.strictEqual(endedSpans.length, 1);
              assert.strictEqual(endedSpans[0], span);
              done();
            });
          });
        });
      });

      it('should not create a child span for hset promise upon error', async () => {
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          try {
            await client.hset(hashKeyName, 'random', 'random');
            assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
            span.end();
            const endedSpans = memoryExporter.getFinishedSpans();
            assert.strictEqual(endedSpans.length, 1);
            assert.strictEqual(endedSpans[0].name, 'test span');
          } catch (error) {
            assert.ifError(error);
          }
        });
      });
    });

    describe('Instrumenting with a custom hooks', () => {
      before(() => {
        instrumentation.disable();
        instrumentation = new IORedisInstrumentation();
        instrumentation.setTracerProvider(provider);
        require('ioredis');
      });

      it('should call requestHook when set in config', async () => {
        const requestHook = sinon.spy(
          (span: Span, requestInfo: IORedisRequestHookInformation) => {
            span.setAttribute(
              'attribute key from request hook',
              'custom value from request hook'
            );
          }
        );
        instrumentation.setConfig(<IORedisInstrumentationConfig>{
          requestHook,
        });

        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          await client.incr('request-hook-test');
          const endedSpans = memoryExporter.getFinishedSpans();
          assert.strictEqual(endedSpans.length, 1);
          assert.strictEqual(
            endedSpans[0].attributes['attribute key from request hook'],
            'custom value from request hook'
          );
        });

        sinon.assert.calledOnce(requestHook);
        const [, requestInfo] = requestHook.firstCall.args;
        assert.ok(
          /\d{1,4}\.\d{1,4}\.\d{1,5}.*/.test(
            requestInfo.moduleVersion as string
          )
        );
        assert.strictEqual(requestInfo.cmdName, 'incr');
        assert.deepStrictEqual(requestInfo.cmdArgs, ['request-hook-test']);
      });

      it('should ignore requestHook which throws exception', async () => {
        const requestHook = sinon.spy(
          (span: Span, _requestInfo: IORedisRequestHookInformation) => {
            span.setAttribute(
              'attribute key BEFORE exception',
              'this attribute is added to span BEFORE exception is thrown thus we can expect it'
            );
            throw Error('error thrown in requestHook');
          }
        );
        instrumentation.setConfig(<IORedisInstrumentationConfig>{
          requestHook,
        });

        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          await client.incr('request-hook-throw-test');
          const endedSpans = memoryExporter.getFinishedSpans();
          assert.strictEqual(endedSpans.length, 1);
          assert.strictEqual(
            endedSpans[0].attributes['attribute key BEFORE exception'],
            'this attribute is added to span BEFORE exception is thrown thus we can expect it'
          );
        });

        sinon.assert.threw(requestHook);
      });

      it('should call responseHook when set in config', async () => {
        const responseHook = sinon.spy(
          (
            span: Span,
            cmdName: string,
            _cmdArgs: Array<string | Buffer | number>,
            response: unknown
          ) => {
            span.setAttribute(
              'attribute key from hook',
              'custom value from hook'
            );
          }
        );
        instrumentation.setConfig(<IORedisInstrumentationConfig>{
          responseHook,
        });

        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          await client.set('response-hook-test', 'test-value');
          const endedSpans = memoryExporter.getFinishedSpans();
          assert.strictEqual(endedSpans.length, 1);
          assert.strictEqual(
            endedSpans[0].attributes['attribute key from hook'],
            'custom value from hook'
          );
        });

        sinon.assert.calledOnce(responseHook);
        const [, cmdName, , response] = responseHook.firstCall.args as [
          Span,
          string,
          unknown,
          Buffer
        ];
        assert.strictEqual(cmdName, 'set');
        assert.strictEqual(response.toString(), 'OK');
      });

      it('should ignore responseHook which throws exception', async () => {
        const responseHook = sinon.spy(
          (
            _span: Span,
            _cmdName: string,
            _cmdArgs: Array<string | Buffer | number>,
            _response: unknown
          ) => {
            throw Error('error thrown in responseHook');
          }
        );
        instrumentation.setConfig(<IORedisInstrumentationConfig>{
          responseHook,
        });

        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          await client.incr('response-hook-throw-test');
          const endedSpans = memoryExporter.getFinishedSpans();

          // hook throw exception, but span should not be affected
          assert.strictEqual(endedSpans.length, 1);
        });

        sinon.assert.threw(responseHook);
      });
    });

    describe('setConfig - custom dbStatementSerializer config', () => {
      const dbStatementSerializer = (
        cmdName: string,
        cmdArgs: Array<string | Buffer | number>
      ) => {
        return Array.isArray(cmdArgs) && cmdArgs.length
          ? `FooBar_${cmdName} ${cmdArgs.join(',')}`
          : cmdName;
      };
      const config: IORedisInstrumentationConfig = {
        dbStatementSerializer: dbStatementSerializer,
      };
      before(() => {
        instrumentation.setConfig(config);
      });

      IOREDIS_CALLBACK_OPERATIONS.forEach(operation => {
        it(`should properly execute the db statement serializer for operation ${operation.description}`, done => {
          const span = provider
            .getTracer('ioredis-test')
            .startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            operation.method((err, _) => {
              assert.ifError(err);
              span.end();
              const endedSpans = memoryExporter.getFinishedSpans();
              assert.strictEqual(endedSpans.length, 2);
              const expectedStatement = dbStatementSerializer(
                operation.name,
                operation.args
              );
              assert.strictEqual(
                endedSpans[0].attributes[SemanticAttributes.DB_STATEMENT],
                expectedStatement
              );
              done();
            });
          });
        });
      });
    });
  });

  describe('#defaultDbStatementSerializer()', () => {
    [
      {
        cmdName: 'UNKNOWN',
        cmdArgs: ['something'],
        expected: 'UNKNOWN [1 other arguments]',
      },
      {
        cmdName: 'ECHO',
        cmdArgs: ['echo'],
        expected: 'ECHO [1 other arguments]',
      },
      {
        cmdName: 'LPUSH',
        cmdArgs: ['list', 'value'],
        expected: 'LPUSH list [1 other arguments]',
      },
      {
        cmdName: 'HSET',
        cmdArgs: ['hash', 'field', 'value'],
        expected: 'HSET hash field [1 other arguments]',
      },
      {
        cmdName: 'INCRBY',
        cmdArgs: ['key', 5],
        expected: 'INCRBY key 5',
      },
    ].forEach(({ cmdName, cmdArgs, expected }) => {
      it(`should serialize the correct number of arguments for ${cmdName}`, () => {
        assert.strictEqual(
          defaultDbStatementSerializer(cmdName, cmdArgs),
          expected
        );
      });
    });
  });
});
