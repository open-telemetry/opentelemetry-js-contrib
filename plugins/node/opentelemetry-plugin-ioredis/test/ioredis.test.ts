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
  StatusCode,
  context,
  SpanKind,
  Status,
  NoopLogger,
  getSpan,
  setSpan,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as testUtils from '@opentelemetry/test-utils';
import {
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import * as assert from 'assert';
import * as ioredisTypes from 'ioredis';
import { IORedisPlugin, plugin } from '../src';
import { IoredisPluginConfig, DbStatementSerializer } from '../src/types';
import {
  DatabaseAttribute,
  ExceptionAttribute,
  GeneralAttribute,
} from '@opentelemetry/semantic-conventions';

const memoryExporter = new InMemorySpanExporter();

const CONFIG = {
  host: process.env.OPENTELEMETRY_REDIS_HOST || 'localhost',
  port: parseInt(process.env.OPENTELEMETRY_REDIS_PORT || '63790', 10),
};

const URL = `redis://${CONFIG.host}:${CONFIG.port}`;

const DEFAULT_ATTRIBUTES = {
  [DatabaseAttribute.DB_SYSTEM]: IORedisPlugin.DB_SYSTEM,
  [GeneralAttribute.NET_PEER_NAME]: CONFIG.host,
  [GeneralAttribute.NET_PEER_PORT]: CONFIG.port,
  [GeneralAttribute.NET_PEER_ADDRESS]: URL,
};

const unsetStatus: Status = {
  code: StatusCode.UNSET,
};

const predictableStackTrace =
  '-- Stack trace replaced by test to predictable value -- ';
const sanitizeEventForAssertion = (span: ReadableSpan) => {
  span.events.forEach(e => {
    // stack trace includes data such as /user/{userName}/repos/{projectName}
    if (e.attributes?.[ExceptionAttribute.STACKTRACE]) {
      e.attributes[ExceptionAttribute.STACKTRACE] = predictableStackTrace;
    }

    // since time will change on each test invocation, it is being replaced to predicable value
    e.time = [0, 0];
  });
};

describe('ioredis', () => {
  const provider = new NodeTracerProvider();
  let ioredis: typeof ioredisTypes;
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

    ioredis = require('ioredis');
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    plugin.enable(ioredis, provider, new NoopLogger());
  });

  after(() => {
    if (shouldTestLocal) {
      testUtils.cleanUpDocker('redis');
    }
  });

  it('should have correct module name', () => {
    assert.strictEqual(plugin.moduleName, 'ioredis');
  });

  describe('#createClient()', () => {
    it('should propagate the current span to event handlers', done => {
      const span = provider.getTracer('ioredis-test').startSpan('test span');
      let client: ioredisTypes.Redis;
      const attributes = {
        ...DEFAULT_ATTRIBUTES,
        [DatabaseAttribute.DB_STATEMENT]: 'connect',
      };
      const readyHandler = () => {
        const endedSpans = memoryExporter.getFinishedSpans();

        assert.strictEqual(getSpan(context.active()), span);
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

      context.with(setSpan(context.active(), span), () => {
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
      method: (cb: ioredisTypes.CallbackFunction<unknown>) => unknown;
    }> = [
      {
        description: 'insert',
        name: 'hset',
        args: [hashKeyName, 'testField', 'testValue'],
        method: (cb: ioredisTypes.CallbackFunction<number>) =>
          client.hset(hashKeyName, 'testField', 'testValue', cb),
      },
      {
        description: 'get',
        name: 'get',
        args: [testKeyName],
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
      memoryExporter.reset();
    });

    describe('Instrumenting query operations', () => {
      IOREDIS_CALLBACK_OPERATIONS.forEach(command => {
        it(`should create a child span for cb style ${command.description}`, done => {
          const attributes = {
            ...DEFAULT_ATTRIBUTES,
            [DatabaseAttribute.DB_STATEMENT]: `${
              command.name
            } ${command.args.join(' ')}`,
          };
          const span = provider
            .getTracer('ioredis-test')
            .startSpan('test span');
          context.with(setSpan(context.active(), span), () => {
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
          [DatabaseAttribute.DB_STATEMENT]: `hset ${hashKeyName} random random`,
        };
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(setSpan(context.active(), span), async () => {
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
        await context.with(setSpan(context.active(), span), async () => {
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
            assert.strictEqual(ioredisSpan.status.code, StatusCode.ERROR);
            const exceptionEvent = ioredisSpan.events[0];
            assert.strictEqual(exceptionEvent.name, 'exception');
            assert.strictEqual(
              exceptionEvent.attributes?.[ExceptionAttribute.MESSAGE],
              ex.message
            );
            assert.strictEqual(
              exceptionEvent.attributes?.[ExceptionAttribute.STACKTRACE],
              ex.stack
            );
            assert.strictEqual(
              exceptionEvent.attributes?.[ExceptionAttribute.TYPE],
              ex.name
            );
          }
        });
      });

      it('should create a child span for streamify scanning', done => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [DatabaseAttribute.DB_STATEMENT]: 'scan 0',
        };
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
          const stream = client.scanStream();
          stream
            .on('data', resultKeys => {
              // `resultKeys` is an array of strings representing key names.
              // Note that resultKeys may contain 0 keys, and that it will sometimes
              // contain duplicates due to SCAN's implementation in Redis.
              for (let i = 0; i < resultKeys.length; i++) {
                console.log(resultKeys[i]);
              }
            })
            .on('end', () => {
              console.log('all keys have been visited');
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
        });
      });

      it('should create a child span for pubsub', async () => {
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(setSpan(context.active(), span), async () => {
          try {
            // use lazyConnect so we can call the `connect` function and await it.
            // this ensures that all operations are sequential and predictable.
            const pub = new ioredis(URL, {lazyConnect: true});
            await pub.connect();
            const sub = new ioredis(URL, {lazyConnect: true});
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
            const spanNames = [
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
            let i = 0;
            while (i < 11) {
              assert.strictEqual(endedSpans[i].name, spanNames[i]);
              i++;
            }

            const attributes = {
              ...DEFAULT_ATTRIBUTES,
              [DatabaseAttribute.DB_STATEMENT]: 'subscribe news music',
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

      it('should create a child span for lua', done => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [DatabaseAttribute.DB_STATEMENT]: `evalsha bfbf458525d6a0b19200bfd6db3af481156b367b 1 ${testKeyName}`,
        };

        const span = provider.getTracer('ioredis-test').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
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
                      [ExceptionAttribute.MESSAGE]:
                        'NOSCRIPT No matching script. Please use EVAL.',
                      [ExceptionAttribute.STACKTRACE]: predictableStackTrace,
                      [ExceptionAttribute.TYPE]: 'ReplyError',
                    },
                    name: 'exception',
                    time: [0, 0],
                  },
                ],
                {
                  code: StatusCode.ERROR,
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

      it('should create a child span for multi/transaction', done => {
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          [DatabaseAttribute.DB_STATEMENT]: 'multi',
        };

        const span = provider.getTracer('ioredis-test').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
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
          [DatabaseAttribute.DB_STATEMENT]: 'set foo bar',
        };

        const span = provider.getTracer('ioredis-test').startSpan('test span');
        context.with(setSpan(context.active(), span), () => {
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
          [DatabaseAttribute.DB_STATEMENT]: `get ${testKeyName}`,
        };
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(setSpan(context.active(), span), async () => {
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
          [DatabaseAttribute.DB_STATEMENT]: `del ${testKeyName}`,
        };
        const span = provider.getTracer('ioredis-test').startSpan('test span');
        await context.with(setSpan(context.active(), span), async () => {
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
    });

    describe('Instrumenting without parent span', () => {
      before(() => {
        plugin.disable();
        plugin.enable(ioredis, provider, new NoopLogger(), {});
      });
      it('should not create child span', async () => {
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
        plugin.disable();
        const config: IoredisPluginConfig = {
          dbStatementSerializer,
        };
        plugin.enable(ioredis, provider, new NoopLogger(), config);
      });

      IOREDIS_CALLBACK_OPERATIONS.forEach(command => {
        it(`should tag the span with a custom db.statement for cb style ${command.description}`, done => {
          const attributes = {
            ...DEFAULT_ATTRIBUTES,
            [DatabaseAttribute.DB_STATEMENT]: dbStatementSerializer(
              command.name,
              command.args
            ),
          };
          const span = provider
            .getTracer('ioredis-test')
            .startSpan('test span');
          context.with(setSpan(context.active(), span), () => {
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
        plugin.disable();
      });

      IOREDIS_CALLBACK_OPERATIONS.forEach(operation => {
        it(`should not create a child span for cb style ${operation.description}`, done => {
          const span = provider
            .getTracer('ioredis-test')
            .startSpan('test span');
          context.with(setSpan(context.active(), span), () => {
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
        await context.with(setSpan(context.active(), span), async () => {
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
  });
});
