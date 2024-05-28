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
import { Writable } from 'stream';

import * as semver from 'semver';
import * as sinon from 'sinon';
import { INVALID_SPAN_CONTEXT, context, trace, Span } from '@opentelemetry/api';
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
  runTestFixture,
  TestCollector,
} from '@opentelemetry/contrib-test-utils';

import { PinoInstrumentation, PinoInstrumentationConfig } from '../src';
import { PACKAGE_NAME, PACKAGE_VERSION } from '../src/version';

import type { pino as Pino } from 'pino';

const tracerProvider = new NodeTracerProvider();
tracerProvider.register();
tracerProvider.addSpanProcessor(
  new SimpleSpanProcessor(new InMemorySpanExporter())
);
const tracer = tracerProvider.getTracer('default');
context.setGlobalContextManager(new AsyncHooksContextManager());

// Setup LoggerProvider for "log sending" tests.
const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: 'test-instrumentation-pino',
});
const loggerProvider = new LoggerProvider({ resource });
const memExporter = new InMemoryLogRecordExporter();
loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(memExporter));
logs.setGlobalLoggerProvider(loggerProvider);

const instrumentation = new PinoInstrumentation();
const pino = require('pino');

describe('PinoInstrumentation', () => {
  describe('disabled instrumentation', () => {
    let logger: Pino.Logger;
    let stream: Writable;
    let writeSpy: sinon.SinonSpy;

    beforeEach(() => {
      instrumentation.disable();
      stream = new Writable();
      stream._write = () => {};
      writeSpy = sinon.spy(stream, 'write');
      logger = pino(stream);
    });

    after(() => {
      instrumentation.enable();
    });

    it('does not inject span context', () => {
      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['msg'], 'a message');
        assert.strictEqual(record['trace_id'], undefined);
        assert.strictEqual(record['span_id'], undefined);
        assert.strictEqual(record['trace_flags'], undefined);
      });
    });

    it('does not call log hook', () => {
      instrumentation.setConfig({
        enabled: false,
        logHook: (_span, record) => {
          record['resource.service.name'] = 'test-service';
        },
      });
      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['resource.service.name'], undefined);
      });
    });

    it('injects span context once re-enabled', () => {
      instrumentation.enable();
      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assertRecord(record, span);
      });
    });
  });

  describe('log correlation', () => {
    let logger: Pino.Logger;
    let stream: Writable;
    let writeSpy: sinon.SinonSpy;

    beforeEach(() => {
      instrumentation.setConfig({}); // reset to defaults
      memExporter.getFinishedLogRecords().length = 0; // clear
      stream = new Writable();
      stream._write = () => {};
      writeSpy = sinon.spy(stream, 'write');
      logger = pino(stream);
    });

    it('injects span context to records', () => {
      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assertRecord(record, span);
        assert.strictEqual(record['msg'], 'a message');
      });
    });

    it('injects span context to records with custom keys', () => {
      const logKeys = {
        traceId: 'traceId',
        spanId: 'spanId',
        traceFlags: 'traceFlags',
      };
      instrumentation.setConfig({ logKeys });
      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assertRecord(record, span, logKeys);
        assert.strictEqual(record['trace_id'], undefined);
        assert.strictEqual(record['span_id'], undefined);
        assert.strictEqual(record['trace_flags'], undefined);
        assert.strictEqual(record['msg'], 'a message');
      });
    });

    it('injects span context to child logger records', () => {
      const child = logger.child({ childField: 42 });
      tracer.startActiveSpan('abc', span => {
        child.info('a message');
        span.end();

        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assertRecord(record, span);
        assert.strictEqual(record['msg'], 'a message');
        assert.strictEqual(record['childField'], 42);
      });
    });

    it('does not inject span context if no span is active', () => {
      assert.strictEqual(trace.getSpan(context.active()), undefined);

      logger.info('a message');

      sinon.assert.calledOnce(writeSpy);
      const record = JSON.parse(writeSpy.firstCall.args[0].toString());
      assert.strictEqual(record['trace_id'], undefined);
      assert.strictEqual(record['span_id'], undefined);
      assert.strictEqual(record['trace_flags'], undefined);
    });

    it('does not inject span context if span context is invalid', () => {
      const span = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
      context.with(trace.setSpan(context.active(), span), () => {
        logger.info('a message');

        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], undefined);
        assert.strictEqual(record['span_id'], undefined);
        assert.strictEqual(record['trace_flags'], undefined);
      });
    });

    it('calls the logHook', () => {
      instrumentation.setConfig({
        logHook: (_span, record, level) => {
          record['resource.service.name'] = 'test-service';
          if (semver.satisfies(pino.version, '>=7.9.0')) {
            assert.strictEqual(level, 30);
          }
        },
      });

      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assertRecord(record, span);
        assert.strictEqual(record['resource.service.name'], 'test-service');
      });
    });

    it('does not propagate exceptions from logHook', () => {
      instrumentation.setConfig({
        logHook: (_span, record, level) => {
          throw new Error('Oops');
        },
      });
      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assertRecord(record, span);
      });
    });

    it('does not inject or call logHook if disableLogCorrelation=true', () => {
      instrumentation.setConfig({
        disableLogCorrelation: true,
        logHook: (_span, record) => {
          record['resource.service.name'] = 'test-service';
        },
      });
      tracer.startActiveSpan('abc', span => {
        logger.info('foo');
        span.end();

        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual('foo', record['msg']);
        assert.strictEqual(record['trace_id'], undefined);
        assert.strictEqual(record['span_id'], undefined);
        assert.strictEqual(record['trace_flags'], undefined);
        assert.strictEqual(record['resource.service.name'], undefined);

        assert.strictEqual(
          memExporter.getFinishedLogRecords().length,
          1,
          'Log sending still works'
        );
      });
    });

    it('instrumentation of `pino.default(...)` works', function () {
      if (!pino.default) {
        this.skip();
      }
      logger = pino.default(stream);

      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        const { traceId, spanId } = span.spanContext();
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], traceId);
        assert.strictEqual(record['span_id'], spanId);
      });
    });

    it('instrumentation of `pino.pino(...)` works', function () {
      if (!pino.default) {
        this.skip();
      }
      logger = pino.pino(stream);

      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        const { traceId, spanId } = span.spanContext();
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], traceId);
        assert.strictEqual(record['span_id'], spanId);
      });
    });
  });

  describe('logger construction', () => {
    let stdoutSpy: sinon.SinonSpy;

    beforeEach(() => {
      instrumentation.setConfig({}); // reset to defaults
      stdoutSpy = sinon.spy(process.stdout, 'write');
    });

    afterEach(() => {
      stdoutSpy.restore();
    });

    it('`pino()` with no args works', () => {
      const logger = pino();
      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        const record = JSON.parse(stdoutSpy.firstCall.args[0].toString());
        assertRecord(record, span);
      });
    });

    it('`pino(options)` works', () => {
      const logger = pino({ name: 'LogLog' });
      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        const record = JSON.parse(stdoutSpy.firstCall.args[0].toString());
        assertRecord(record, span);
        assert.strictEqual(record['name'], 'LogLog');
      });
    });

    it('`pino(undefined, stream)` works', () => {
      const logger = pino(undefined, process.stdout);
      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        const record = JSON.parse(stdoutSpy.firstCall.args[0].toString());
        assertRecord(record, span);
      });
    });

    it('preserves user mixins', () => {
      const logger = pino(
        { name: 'LogLog', mixin: () => ({ a: 2, b: 'bar' }) },
        process.stdout
      );
      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        const record = JSON.parse(stdoutSpy.firstCall.args[0].toString());
        assertRecord(record, span);
        assert.strictEqual(record['a'], 2);
        assert.strictEqual(record['b'], 'bar');
        assert.strictEqual(record['name'], 'LogLog');
      });
    });

    it('ensures user mixin values take precedence', () => {
      const logger = pino(
        {
          mixin() {
            return { trace_id: '123' };
          },
        },
        process.stdout
      );
      tracer.startActiveSpan('abc', span => {
        logger.info('a message');
        span.end();

        const { spanId } = span.spanContext();
        const record = JSON.parse(stdoutSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], '123');
        assert.strictEqual(record['span_id'], spanId);
      });
    });
  });

  describe('log sending', () => {
    let logger: Pino.Logger;
    let stream: Writable;
    let writeSpy: sinon.SinonSpy;

    beforeEach(() => {
      instrumentation.setConfig({}); // reset to defaults
      memExporter.getFinishedLogRecords().length = 0; // clear
      stream = new Writable();
      stream._write = () => {};
      writeSpy = sinon.spy(stream, 'write');
      logger = pino({
        name: 'test-logger-name',
        level: 'debug',
      }, stream);
    });

    it('emits log records to Logs SDK', () => {
      const logRecords = memExporter.getFinishedLogRecords();

      // levels
      logger.trace('at trace level');
      logger.debug('at debug level');
      logger.info('at info level');
      logger.warn('at warn level');
      logger.error('at error level');
      logger.fatal('at fatal level');
      assert.strictEqual(logRecords.length, 5);
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.DEBUG);
      assert.strictEqual(logRecords[0].severityText, 'debug');
      assert.strictEqual(logRecords[1].severityNumber, SeverityNumber.INFO);
      assert.strictEqual(logRecords[1].severityText, 'info');
      assert.strictEqual(logRecords[2].severityNumber, SeverityNumber.WARN);
      assert.strictEqual(logRecords[2].severityText, 'warn');
      assert.strictEqual(logRecords[3].severityNumber, SeverityNumber.ERROR);
      assert.strictEqual(logRecords[3].severityText, 'error');
      assert.strictEqual(logRecords[4].severityNumber, SeverityNumber.FATAL);
      assert.strictEqual(logRecords[4].severityText, 'fatal');

      // attributes, resource, instrumentationScope, etc.
      logger.info({ foo: 'bar' }, 'a message');
      const rec = logRecords[logRecords.length - 1];
      assert.strictEqual(rec.body, 'a message');
      assert.deepStrictEqual(rec.attributes, {
        name: 'test-logger-name',
        foo: 'bar',
      });
      assert.strictEqual(
        rec.resource.attributes['service.name'],
        'test-instrumentation-pino'
      );
      assert.strictEqual(rec.instrumentationScope.name, PACKAGE_NAME);
      assert.strictEqual(rec.instrumentationScope.version, PACKAGE_VERSION);
      assert.strictEqual(rec.spanContext, undefined);

      // spanContext
      tracer.startActiveSpan('abc', span => {
        logger.info('in active span');
        span.end();

        const { traceId, spanId, traceFlags } = span.spanContext();
        const rec = logRecords[logRecords.length - 1];
        assert.strictEqual(rec.spanContext?.traceId, traceId);
        assert.strictEqual(rec.spanContext?.spanId, spanId);
        assert.strictEqual(rec.spanContext?.traceFlags, traceFlags);

        // This rec should *NOT* have the `trace_id` et al attributes.
        assert.strictEqual(rec.attributes.trace_id, undefined);
        assert.strictEqual(rec.attributes.span_id, undefined);
        assert.strictEqual(rec.attributes.trace_flags, undefined);
      });
    });

    // it('handles log record edge cases', () => {
    //   let rec;
    //   const logRecords = memExporter.getFinishedLogRecords();

    //   // A non-Date "time" Bunyan field.
    //   log.info({ time: 'miller' }, 'hi');
    //   rec = logRecords[logRecords.length - 1];
    //   assert.deepEqual(
    //     rec.hrTime.map(n => typeof n),
    //     ['number', 'number']
    //   );
    //   assert.strictEqual(rec.attributes.time, 'miller');

    //   // An atypical Bunyan level number.
    //   log.info({ level: 42 }, 'just above Bunyan WARN==40');
    //   rec = logRecords[logRecords.length - 1];
    //   assert.strictEqual(rec.severityNumber, SeverityNumber.WARN2);
    //   assert.strictEqual(rec.severityText, undefined);

    //   log.info({ level: 200 }, 'far above Bunyan FATAL==60');
    //   rec = logRecords[logRecords.length - 1];
    //   assert.strictEqual(rec.severityNumber, SeverityNumber.FATAL4);
    //   assert.strictEqual(rec.severityText, undefined);
    // });

    it('does not emit to the Logs SDK if disableLogSending=true', () => {
      instrumentation.setConfig({ disableLogSending: true });

      // Changing `disableLogSending` only has an impact on Loggers created
      // *after* it is set. So we cannot test with the `logger` created in
      // `beforeEach()` above.
      logger = pino({ name: 'test-logger-name' }, stream);

      tracer.startActiveSpan('abc', span => {
        logger.info('foo');
        span.end();

        assert.strictEqual(memExporter.getFinishedLogRecords().length, 0);

        // Test log correlation still works.
        const { traceId, spanId } = span.spanContext();
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual('foo', record['msg']);
        assert.strictEqual(record['trace_id'], traceId);
        assert.strictEqual(record['span_id'], spanId);
      });
    });
  });

  describe('ESM usage', () => {
    it('should work with ESM default import', async function () {
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
      if (semver.lt(pino.version, '6.8.0')) {
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

function assertRecord(
  record: any,
  span: Span,
  expectedKeys?: PinoInstrumentationConfig['logKeys']
) {
  const { traceId, spanId, traceFlags } = span.spanContext();
  assert.strictEqual(record[expectedKeys?.traceId ?? 'trace_id'], traceId);
  assert.strictEqual(record[expectedKeys?.spanId ?? 'span_id'], spanId);
  assert.strictEqual(
    record[expectedKeys?.traceFlags ?? 'trace_flags'],
    `0${traceFlags.toString(16)}`
  );
}
