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
import { SEMRESATTRS_SERVICE_NAME  } from '@opentelemetry/semantic-conventions';
import { Resource } from '@opentelemetry/resources';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  InMemoryLogRecordExporter,
} from '@opentelemetry/sdk-logs';

import {
  TestInstrumentationAndContext,
  assertInjection,
  assertRecord,
  initTestContext,
  kMessage,
  setupInstrumentationAndInitTestContext,
  testInjection,
  testNoInjection,
} from './common';
import {
  runTestFixture,
  TestCollector,
} from '@opentelemetry/contrib-test-utils';

import type { pino as Pino } from 'pino';

const tracerProvider = new NodeTracerProvider();
tracerProvider.register();
tracerProvider.addSpanProcessor(
  new SimpleSpanProcessor(new InMemorySpanExporter())
);
const tracer = tracerProvider.getTracer('default');
// XXX need this? Bunyan test doesn't ahve it, FWIW.
context.setGlobalContextManager(new AsyncHooksContextManager());

const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: 'test-instrumentation-bunyan',
});
const loggerProvider = new LoggerProvider({ resource });
const memExporter = new InMemoryLogRecordExporter();
loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(memExporter));
logs.setGlobalLoggerProvider(loggerProvider);

// XXX HERE tests for logSending, logCorrelation opts

describe('PinoInstrumentation', () => {
  let testContext: TestInstrumentationAndContext;

  describe('enabled instrumentation', () => {
    beforeEach(() => {
      testContext = setupInstrumentationAndInitTestContext();
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

      testContext = setupInstrumentationAndInitTestContext({ logKeys });

      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span, testContext, logKeys);
      });
    });

    it('injects span context to records in default export', function () {
      // @ts-expect-error the same function reexported
      if (!testContext.pino.default) {
        this.skip();
      }
      initTestContext(testContext, 'default');
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span, testContext);
      });
    });

    it('injects span context to records in named export', function () {
      // @ts-expect-error the same function reexported
      if (!testContext.pino.pino) {
        this.skip();
      }
      initTestContext(testContext, 'pino');
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
      testContext.instrumentation.setConfig({
        enabled: true,
        logHook: (_span, record, level) => {
          record['resource.service.name'] = 'test-service';
          if (semver.satisfies(testContext.pino.version, '>= 7.9.0')) {
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
      testContext.instrumentation.setConfig({
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
      testContext = setupInstrumentationAndInitTestContext();

      stdoutSpy = sinon.spy(process.stdout, 'write');
    });

    afterEach(() => {
      stdoutSpy.restore();
    });

    it('does not fail when constructing logger without arguments', () => {
      testContext.logger = testContext.pino();
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testContext.logger.info(kMessage);
      });
      const record = JSON.parse(stdoutSpy.firstCall.args[0].toString());
      assertRecord(record, span);
    });

    it('preserves user options and adds a mixin', () => {
      testContext.logger = testContext.pino(
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
        testContext.logger = testContext.pino(
          undefined as unknown as Pino.LoggerOptions,
          testContext.stream
        );
        const span = tracer.startSpan('abc');
        context.with(trace.setSpan(context.active(), span), () => {
          testInjection(span, testContext);
        });
      });

      it('preserves user mixins', () => {
        testContext.logger = testContext.pino(
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
        testContext.logger = testContext.pino(
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

  describe('ESM usage', () => {
    it('should work with ESM default import', async function () {
      testContext = setupInstrumentationAndInitTestContext();
      let logRecords: any[];
      await runTestFixture({
        cwd: __dirname,
        argv: ['fixtures/use-pino-default-import.mjs'],
        env: {
          NODE_OPTIONS:
            '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
          NODE_NO_WARNINGS: '1',
        },
        checkResult: (err, stdout, _stderr) => {
          assert.ifError(err);
          logRecords = stdout
            .trim()
            .split('\n')
            .map(ln => JSON.parse(ln));
          assert.strictEqual(logRecords.length, 1);
        },
        checkCollector: (collector: TestCollector) => {
          // Check that both log records had the trace-context of the span injected.
          const spans = collector.sortedSpans;
          assert.strictEqual(spans.length, 1);
          logRecords.forEach(rec => {
            assert.strictEqual(rec.trace_id, spans[0].traceId);
            assert.strictEqual(rec.span_id, spans[0].spanId);
          });
        },
      });
    });

    it('should work with ESM named import', async function () {
      if (semver.lt(testContext.pino.version, '6.8.0')) {
        // Pino 6.8.0 added named ESM exports (https://github.com/pinojs/pino/pull/936).
        this.skip();
      } else {
        let logRecords: any[];
        await runTestFixture({
          cwd: __dirname,
          argv: ['fixtures/use-pino-named-import.mjs'],
          env: {
            NODE_OPTIONS:
              '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
            NODE_NO_WARNINGS: '1',
          },
          checkResult: (err, stdout, _stderr) => {
            assert.ifError(err);
            logRecords = stdout
              .trim()
              .split('\n')
              .map(ln => JSON.parse(ln));
            assert.strictEqual(logRecords.length, 1);
          },
          checkCollector: (collector: TestCollector) => {
            // Check that both log records had the trace-context of the span injected.
            const spans = collector.sortedSpans;
            assert.strictEqual(spans.length, 1);
            logRecords.forEach(rec => {
              assert.strictEqual(rec.trace_id, spans[0].traceId);
              assert.strictEqual(rec.span_id, spans[0].spanId);
            });
          },
        });
      }
    });
  });
});
