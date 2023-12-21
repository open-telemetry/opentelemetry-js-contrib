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

import * as assert from 'assert';
import * as semver from 'semver';
import * as sinon from 'sinon';

import { INVALID_SPAN_CONTEXT, context, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  TestContext,
  TestInstrumentation,
  assertInjection,
  assertRecord,
  initTestContext,
  kMessage,
  setupInstrumentation,
  testInjection,
  testNoInjection,
} from './common';

import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { pino as Pino } from 'pino';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const tracer = provider.getTracer('default');
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
context.setGlobalContextManager(new AsyncHooksContextManager());

describe('PinoInstrumentation', () => {
  let testInstrumentation: TestInstrumentation;
  let testContext: TestContext;
  describe('enabled instrumentation', () => {
    beforeEach(() => {
      testInstrumentation = setupInstrumentation();
      testContext = initTestContext(testInstrumentation);
    });

    it('injects span context to records', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span, testContext);
      });
    });

    it('injects span context to records with custom keys', () => {
      const logKeys = {
        traceId: 'traceId',
        spanId: 'spanId',
        traceFlags: 'traceFlags',
      };

      testInstrumentation = setupInstrumentation({ logKeys });
      testContext = initTestContext(testInstrumentation);

      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span, testContext, logKeys);
      });
    });

    it('injects span context to records in default export', function () {
      // @ts-expect-error the same function reexported
      if (!testInstrumentation.pino.default) {
        this.skip();
      }
      initTestContext(testInstrumentation, 'default');
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span, testContext);
      });
    });

    it('injects span context to records in named export', function () {
      // @ts-expect-error the same function reexported
      if (!testInstrumentation.pino.pino) {
        this.skip();
      }
      initTestContext(testInstrumentation, 'pino');
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span, testContext);
      });
    });

    it('injects span context to child logger records', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        const child = testContext.logger.child({ foo: 42 });
        child.info(kMessage);
        assertInjection(span, testContext);
      });
    });

    it('calls the users log hook', () => {
      const span = tracer.startSpan('abc');
      testInstrumentation.instrumentation.setConfig({
        enabled: true,
        logHook: (_span, record, level) => {
          record['resource.service.name'] = 'test-service';
          if (semver.satisfies(testInstrumentation.pino.version, '>= 7.9.0')) {
            assert.strictEqual(level, 30);
          }
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        const record = testInjection(span, testContext);
        assert.strictEqual(record['resource.service.name'], 'test-service');
      });
    });

    it('does not inject span context if no span is active', () => {
      assert.strictEqual(trace.getSpan(context.active()), undefined);
      testNoInjection(testContext);
    });

    it('does not inject span context if span context is invalid', () => {
      const span = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
      context.with(trace.setSpan(context.active(), span), () => {
        testNoInjection(testContext);
      });
    });

    it('does not propagate exceptions from user hooks', () => {
      const span = tracer.startSpan('abc');
      testInstrumentation.instrumentation.setConfig({
        enabled: true,
        logHook: () => {
          throw new Error('Oops');
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span, testContext);
      });
    });
  });

  describe('logger construction', () => {
    let stdoutSpy: sinon.SinonSpy;

    beforeEach(() => {
      testInstrumentation = setupInstrumentation();
      testContext = initTestContext(testInstrumentation);

      stdoutSpy = sinon.spy(process.stdout, 'write');
    });

    afterEach(() => {
      stdoutSpy.restore();
    });

    it('does not fail when constructing logger without arguments', () => {
      testContext.logger = testInstrumentation.pino();
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testContext.logger.info(kMessage);
      });
      const record = JSON.parse(stdoutSpy.firstCall.args[0].toString());
      assertRecord(record, span);
    });

    it('preserves user options and adds a mixin', () => {
      testContext.logger = testInstrumentation.pino(
        { name: 'LogLog' },
        testContext.stream
      );

      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        const record = testInjection(span, testContext);
        assert.strictEqual(record['name'], 'LogLog');
      });
    });

    describe('binary arguments', () => {
      it('is possible to construct logger with undefined options', () => {
        testContext.logger = testInstrumentation.pino(
          undefined as unknown as Pino.LoggerOptions,
          testContext.stream
        );
        const span = tracer.startSpan('abc');
        context.with(trace.setSpan(context.active(), span), () => {
          testInjection(span, testContext);
        });
      });

      it('preserves user mixins', () => {
        testContext.logger = testInstrumentation.pino(
          { name: 'LogLog', mixin: () => ({ a: 2, b: 'bar' }) },
          testContext.stream
        );

        const span = tracer.startSpan('abc');
        context.with(trace.setSpan(context.active(), span), () => {
          const record = testInjection(span, testContext);
          assert.strictEqual(record['a'], 2);
          assert.strictEqual(record['b'], 'bar');
          assert.strictEqual(record['name'], 'LogLog');
        });
      });

      it('ensures user mixin values take precedence', () => {
        testContext.logger = testInstrumentation.pino(
          {
            mixin() {
              return { trace_id: '123' };
            },
          },
          testContext.stream
        );

        const span = tracer.startSpan('abc');
        context.with(trace.setSpan(context.active(), span), () => {
          testContext.logger.info(kMessage);
        });

        const record = JSON.parse(
          testContext.writeSpy.firstCall.args[0].toString()
        );
        assert.strictEqual(record['trace_id'], '123');
      });
    });
  });
});
