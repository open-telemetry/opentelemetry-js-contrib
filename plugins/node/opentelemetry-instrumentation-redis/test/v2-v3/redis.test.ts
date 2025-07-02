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
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import * as assert from 'assert';
import { RedisInstrumentation } from '../../src';
import {
  DBSYSTEMVALUES_REDIS,
  SEMATTRS_DB_CONNECTION_STRING,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
} from '@opentelemetry/semantic-conventions';

const instrumentation = testUtils.registerInstrumentationTesting(
  new RedisInstrumentation()
);

import type { Callback } from '../../src/v2-v3/internal-types';
import { RedisResponseCustomAttributeFunction } from '../../src/types';

const CONFIG = {
  host: process.env.OPENTELEMETRY_REDIS_HOST || 'localhost',
  port: Number(process.env.OPENTELEMETRY_REDIS_PORT || 63790),
};

const URL = `redis://${CONFIG.host}:${CONFIG.port}`;

const DEFAULT_ATTRIBUTES = {
  [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_REDIS,
  [SEMATTRS_NET_PEER_NAME]: CONFIG.host,
  [SEMATTRS_NET_PEER_PORT]: CONFIG.port,
  [SEMATTRS_DB_CONNECTION_STRING]: URL,
};

const unsetStatus: SpanStatus = {
  code: SpanStatusCode.UNSET,
};

describe('redis v2-v3', () => {
  let redis: any;
  const shouldTestLocal = process.env.RUN_REDIS_TESTS_LOCAL;
  const shouldTest = process.env.RUN_REDIS_TESTS || shouldTestLocal;
  const tracer = trace.getTracer('external');

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
  });

  after(() => {
    if (shouldTestLocal) {
      testUtils.cleanUpDocker('redis');
    }
  });

  describe('#createClient()', () => {
    it('should propagate the current span to event handlers', done => {
      const span = tracer.startSpan('test span');
      let client: any;
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
    let client: any;

    const REDIS_OPERATIONS: Array<{
      description: string;
      command: string;
      args: string[];
      expectedDbStatement: string;
      method: (cb: Callback<unknown>) => unknown;
    }> = [
      {
        description: 'insert',
        command: 'hset',
        args: ['hash', 'random', 'random'],
        expectedDbStatement: 'hash random [1 other arguments]',
        method: (cb: Callback<number>) =>
          client.hset('hash', 'random', 'random', cb),
      },
      {
        description: 'get',
        command: 'get',
        args: ['test'],
        expectedDbStatement: 'test',
        method: (cb: Callback<string | null>) => client.get('test', cb),
      },
      {
        description: 'delete',
        command: 'del',
        args: ['test'],
        expectedDbStatement: 'test',
        method: (cb: Callback<number>) => client.del('test', cb),
      },
    ];

    before(done => {
      client = redis.createClient(URL);
      client.on('error', (err: any) => {
        done(err);
      });
      client.on('ready', done);
    });

    beforeEach(done => {
      client.set('test', 'data', () => {
        testUtils.resetMemoryExporter();
        done();
      });
    });

    after(done => {
      client.quit(done);
    });

    afterEach(done => {
      client.del('hash', () => {
        testUtils.resetMemoryExporter();
        done();
      });
    });

    describe('Instrumenting query operations', () => {
      REDIS_OPERATIONS.forEach(operation => {
        it(`should create a child span for ${operation.description}`, done => {
          const attributes = {
            ...DEFAULT_ATTRIBUTES,
            [SEMATTRS_DB_STATEMENT]: `${operation.command} ${operation.expectedDbStatement}`,
          };
          const span = tracer.startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            operation.method((err, _result) => {
              assert.ifError(err);
              assert.strictEqual(testUtils.getTestSpans().length, 1);
              span.end();
              const endedSpans = testUtils.getTestSpans();
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

    describe('dbStatementSerializer config', () => {
      const dbStatementSerializer = (
        cmdName: string,
        cmdArgs: Array<string | Buffer>
      ) => {
        return Array.isArray(cmdArgs) && cmdArgs.length
          ? `${cmdName} ${cmdArgs.join(' ')}`
          : cmdName;
      };

      beforeEach(() => {
        instrumentation.setConfig({ dbStatementSerializer });
      });

      REDIS_OPERATIONS.forEach(operation => {
        it(`should properly execute the db statement serializer for operation ${operation.description}`, done => {
          const span = tracer.startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            operation.method((err, _) => {
              assert.ifError(err);
              span.end();
              const endedSpans = testUtils.getTestSpans();
              assert.strictEqual(endedSpans.length, 2);
              const expectedStatement = dbStatementSerializer(
                operation.command,
                operation.args
              );
              assert.strictEqual(
                endedSpans[0].attributes[SEMATTRS_DB_STATEMENT],
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
          _cmdArgs: Array<string | Buffer>,
          response: unknown
        ) => {
          span.setAttribute(dataFieldName, new String(response).toString());
        };

        beforeEach(() => {
          instrumentation.setConfig({ responseHook });
        });

        REDIS_OPERATIONS.forEach(operation => {
          it(`should apply responseHook for operation ${operation.description}`, done => {
            operation.method((err, reply) => {
              assert.ifError(err);
              const endedSpans = testUtils.getTestSpans();
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
          _cmdArgs: Array<string | Buffer>,
          _response: unknown
        ) => {
          throw 'Some kind of error';
        };

        beforeEach(() => {
          instrumentation.setConfig({ responseHook: badResponseHook });
        });

        REDIS_OPERATIONS.forEach(operation => {
          it(`should not fail because of responseHook error for operation ${operation.description}`, done => {
            operation.method((err, _reply) => {
              assert.ifError(err);
              const endedSpans = testUtils.getTestSpans();
              assert.strictEqual(endedSpans.length, 1);
              done();
            });
          });
        });
      });
    });

    describe('requireParentSpan config', () => {
      beforeEach(() => {
        instrumentation.setConfig({ requireParentSpan: true });
      });

      REDIS_OPERATIONS.forEach(operation => {
        it(`should not create span without parent span for operation ${operation.description}`, done => {
          context.with(ROOT_CONTEXT, () => {
            operation.method((err, _) => {
              assert.ifError(err);
              const endedSpans = testUtils.getTestSpans();
              assert.strictEqual(endedSpans.length, 0);
              done();
            });
          });
        });

        it(`should create span when a parent span exists for operation ${operation.description}`, done => {
          const span = tracer.startSpan('test span');
          context.with(trace.setSpan(context.active(), span), () => {
            operation.method((err, _) => {
              assert.ifError(err);
              const endedSpans = testUtils.getTestSpans();
              assert.strictEqual(endedSpans.length, 1);
              done();
            });
          });
        });
      });
    });
  });
});
