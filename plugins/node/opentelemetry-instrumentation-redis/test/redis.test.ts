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
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { RedisInstrumentation } from '../src';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';

const instrumentation = new RedisInstrumentation();
instrumentation.enable();
instrumentation.disable();

import * as redisTypes from 'redis';
import { RedisResponseCustomAttributeFunction } from '../src/types';

const memoryExporter = new InMemorySpanExporter();

const CONFIG = {
  host: process.env.OPENTELEMETRY_REDIS_HOST || 'localhost',
  port: process.env.OPENTELEMETRY_REDIS_PORT || '63790',
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

describe('redis@2.x', () => {
  const provider = new NodeTracerProvider();
  const tracer = provider.getTracer('external');
  let redis: typeof redisTypes;
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

    redis = require('redis');
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();
  });

  after(() => {
    if (shouldTestLocal) {
      testUtils.cleanUpDocker('redis');
    }
  });

  describe('#createClient()', () => {
    it('should propagate the current span to event handlers', done => {
      const span = tracer.startSpan('test span');
      let client: redisTypes.RedisClient;
      const readyHandler = () => {
        assert.strictEqual(trace.getSpan(context.active()), span);
        client.quit(done);
      };
      const errorHandler = (err: Error) => {
        assert.ifError(err);
        client.quit(done);
      };

      context.with(trace.setSpan(context.active(), span), () => {
        client = redis.createClient(URL);
        client.on('ready', readyHandler);
        client.on('error', errorHandler);
      });
    });
  });

  describe('#send_internal_message()', () => {
    let client: redisTypes.RedisClient;

    const REDIS_OPERATIONS: Array<{
      description: string;
      command: string;
      args: string[];
      method: (cb: redisTypes.Callback<unknown>) => unknown;
    }> = [
      {
        description: 'insert',
        command: 'hset',
        args: ['hash', 'random', 'random'],
        method: (cb: redisTypes.Callback<number>) =>
          client.hset('hash', 'random', 'random', cb),
      },
      {
        description: 'get',
        command: 'get',
        args: ['test'],
        method: (cb: redisTypes.Callback<string | null>) =>
          client.get('test', cb),
      },
      {
        description: 'delete',
        command: 'del',
        args: ['test'],
        method: (cb: redisTypes.Callback<number>) => client.del('test', cb),
      },
    ];

    before(done => {
      client = redis.createClient(URL);
      client.on('error', err => {
        done(err);
      });
      client.on('ready', done);
    });

    beforeEach(done => {
      client.set('test', 'data', () => {
        memoryExporter.reset();
        done();
      });
    });

    after(done => {
      client.quit(done);
    });

    afterEach(done => {
      client.del('hash', () => {
        memoryExporter.reset();
        done();
      });
    });

    describe('Instrumenting query operations', () => {
      REDIS_OPERATIONS.forEach(operation => {
        it(`should create a child span for ${operation.description}`, done => {
          const attributes = {
            ...DEFAULT_ATTRIBUTES,
            [SemanticAttributes.DB_STATEMENT]: operation.command,
          };
          const span = tracer.startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            operation.method((err, _result) => {
              assert.ifError(err);
              assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
              span.end();
              const endedSpans = memoryExporter.getFinishedSpans();
              assert.strictEqual(endedSpans.length, 2);
              assert.strictEqual(
                endedSpans[0].name,
                `redis-${operation.command}`
              );
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

      it('should invoke callback with original command context', () => {
        const rootSpan = tracer.startSpan('test span');
        context.with(trace.setSpan(context.active(), rootSpan), () => {
          client.set('callbacksTestKey', 'value', () => {
            const activeSpan = trace.getSpan(context.active());
            assert.strictEqual(activeSpan, rootSpan);
          });
        });
      });
    });

    describe('Removing instrumentation', () => {
      before(() => {
        instrumentation.disable();
      });

      REDIS_OPERATIONS.forEach(operation => {
        it(`should not create a child span for ${operation.description}`, done => {
          const span = tracer.startSpan('test span');
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
    });

    describe('dbStatementSerializer config', () => {
      const dbStatementSerializer = (cmdName: string, cmdArgs: string[]) => {
        return Array.isArray(cmdArgs) && cmdArgs.length
          ? `${cmdName} ${cmdArgs.join(' ')}`
          : cmdName;
      };

      before(() => {
        instrumentation.disable();
        instrumentation.setConfig({ dbStatementSerializer });
        instrumentation.enable();
      });

      REDIS_OPERATIONS.forEach(operation => {
        it(`should properly execute the db statement serializer for operation ${operation.description}`, done => {
          const span = tracer.startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            operation.method((err, _) => {
              assert.ifError(err);
              span.end();
              const endedSpans = memoryExporter.getFinishedSpans();
              assert.strictEqual(endedSpans.length, 2);
              const expectedStatement = dbStatementSerializer(
                operation.command,
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

    describe('responseHook config', () => {
      describe('valid responseHook', () => {
        const dataFieldName = 'redis.data';

        const responseHook: RedisResponseCustomAttributeFunction = (
          span: Span,
          _cmdName: string,
          _cmdArgs: string[],
          response: unknown
        ) => {
          span.setAttribute(dataFieldName, new String(response).toString());
        };

        before(() => {
          instrumentation.disable();
          instrumentation.setConfig({ responseHook });
          instrumentation.enable();
        });

        REDIS_OPERATIONS.forEach(operation => {
          it(`should apply responseHook for operation ${operation.description}`, done => {
            operation.method((err, reply) => {
              assert.ifError(err);
              const endedSpans = memoryExporter.getFinishedSpans();
              assert.strictEqual(
                endedSpans[0].attributes[dataFieldName],
                new String(reply).toString()
              );
              done();
            });
          });
        });
      });

      describe('invalid responseHook', () => {
        const badResponseHook: RedisResponseCustomAttributeFunction = (
          _span: Span,
          _cmdName: string,
          _cmdArgs: string[],
          _response: unknown
        ) => {
          throw 'Some kind of error';
        };

        before(() => {
          instrumentation.disable();
          instrumentation.setConfig({ responseHook: badResponseHook });
          instrumentation.enable();
        });

        REDIS_OPERATIONS.forEach(operation => {
          it(`should not fail because of responseHook error for operation ${operation.description}`, done => {
            operation.method((err, _reply) => {
              assert.ifError(err);
              const endedSpans = memoryExporter.getFinishedSpans();
              assert.strictEqual(endedSpans.length, 1);
              done();
            });
          });
        });
      });
    });

    describe('requireParentSpan config', () => {
      before(() => {
        instrumentation.disable();
        instrumentation.setConfig({ requireParentSpan: true });
        instrumentation.enable();
      });

      REDIS_OPERATIONS.forEach(operation => {
        it(`should not create span without parent span for operation ${operation.description}`, done => {
          operation.method((err, _) => {
            assert.ifError(err);
            const endedSpans = memoryExporter.getFinishedSpans();
            assert.strictEqual(endedSpans.length, 0);
            done();
          });
        });

        it(`should create span when a parent span exists for operation ${operation.description}`, done => {
          const span = tracer.startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            operation.method((err, _) => {
              assert.ifError(err);
              const endedSpans = memoryExporter.getFinishedSpans();
              assert.strictEqual(endedSpans.length, 1);
              done();
            });
          });
        });
      });
    });
  });
});
