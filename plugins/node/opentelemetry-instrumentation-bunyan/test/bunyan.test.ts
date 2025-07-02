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
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, INVALID_SPAN_CONTEXT, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  InMemoryLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { isWrapped } from '@opentelemetry/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Writable } from 'stream';
import { BunyanInstrumentation, OpenTelemetryBunyanStream } from '../src';
import { PACKAGE_VERSION } from '../src/version';

import type * as BunyanLogger from 'bunyan';

// import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const tracerProvider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
});
tracerProvider.register();
const tracer = tracerProvider.getTracer('default');

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'test-instrumentation-bunyan',
});
const memExporter = new InMemoryLogRecordExporter();
const loggerProvider = new LoggerProvider({
  resource,
  processors: [new SimpleLogRecordProcessor(memExporter)],
});
logs.setGlobalLoggerProvider(loggerProvider);

const instrumentation = new BunyanInstrumentation();
const Logger = require('bunyan');

describe('BunyanInstrumentation', () => {
  let log: BunyanLogger;
  let stream: Writable;
  let writeSpy: sinon.SinonSpy;

  it('is instrumented', () => {
    assert.ok(isWrapped((Logger.prototype as any)['_emit']));
  });

  describe('enabled instrumentation', () => {
    beforeEach(() => {
      instrumentation.setConfig({}); // reset to defaults
      memExporter.getFinishedLogRecords().length = 0; // clear
      stream = new Writable();
      stream._write = () => {};
      writeSpy = sinon.spy(stream, 'write');
      log = Logger.createLogger({
        name: 'test-logger-name',
        level: 'debug',
        stream,
      });
    });

    it('injects span context to records', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        const { traceId, spanId, traceFlags } = span.spanContext();
        log.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], traceId);
        assert.strictEqual(record['span_id'], spanId);
        assert.strictEqual(
          record['trace_flags'],
          `0${traceFlags.toString(16)}`
        );
        // Sanity check the message is unchanged
        assert.strictEqual('foo', record['msg']);
      });
    });

    it('calls the logHook', () => {
      const span = tracer.startSpan('abc');
      instrumentation.setConfig({
        logHook: (_span, record) => {
          record['resource.service.name'] = 'test-service';
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        log.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['resource.service.name'], 'test-service');
      });
    });

    it('does not inject span context if no span is active', () => {
      log.info('foo');
      assert.strictEqual(trace.getSpan(context.active()), undefined);
      sinon.assert.calledOnce(writeSpy);
      const record = JSON.parse(writeSpy.firstCall.args[0].toString());
      assert.strictEqual(record['trace_id'], undefined);
      assert.strictEqual(record['span_id'], undefined);
      assert.strictEqual(record['trace_flags'], undefined);
      assert.strictEqual('foo', record['msg']);
    });

    it('does not inject span context if span context is invalid', () => {
      const span = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
      context.with(trace.setSpan(context.active(), span), () => {
        log.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], undefined);
        assert.strictEqual(record['span_id'], undefined);
        assert.strictEqual(record['trace_flags'], undefined);
        assert.strictEqual('foo', record['msg']);
      });
    });

    it('does not propagate exceptions from logHook', () => {
      const span = tracer.startSpan('abc');
      instrumentation.setConfig({
        logHook: () => {
          throw new Error('Oops');
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        const { traceId, spanId } = span.spanContext();
        log.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], traceId);
        assert.strictEqual(record['span_id'], spanId);
        assert.strictEqual('foo', record['msg']);
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
        log.info('foo');
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
        span.end();
      });
    });

    it('emits log records to Logs SDK', () => {
      const logRecords = memExporter.getFinishedLogRecords();

      // levels
      log.trace('at trace level');
      log.debug('at debug level');
      log.info('at info level');
      log.warn('at warn level');
      log.error('at error level');
      log.fatal('at fatal level');
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
      log.info({ foo: 'bar' }, 'a message');
      const rec = logRecords[logRecords.length - 1];
      assert.strictEqual(rec.body, 'a message');
      assert.deepStrictEqual(rec.attributes, {
        name: 'test-logger-name',
        foo: 'bar',
      });
      assert.strictEqual(
        rec.resource.attributes['service.name'],
        'test-instrumentation-bunyan'
      );
      assert.strictEqual(
        rec.instrumentationScope.name,
        '@opentelemetry/instrumentation-bunyan'
      );
      assert.strictEqual(rec.instrumentationScope.version, PACKAGE_VERSION);
      assert.strictEqual(rec.spanContext, undefined);

      // spanContext
      tracer.startActiveSpan('abc', span => {
        const { traceId, spanId, traceFlags } = span.spanContext();
        log.info('in active span');
        const rec = logRecords[logRecords.length - 1];
        assert.strictEqual(rec.spanContext?.traceId, traceId);
        assert.strictEqual(rec.spanContext?.spanId, spanId);
        assert.strictEqual(rec.spanContext?.traceFlags, traceFlags);

        // This rec should *NOT* have the `trace_id` et al attributes.
        assert.strictEqual(rec.attributes.trace_id, undefined);
        assert.strictEqual(rec.attributes.span_id, undefined);
        assert.strictEqual(rec.attributes.trace_flags, undefined);

        span.end();
      });
    });

    it('handles log record edge cases', () => {
      let rec;
      const logRecords = memExporter.getFinishedLogRecords();

      // A non-Date "time" Bunyan field.
      log.info({ time: 'miller' }, 'hi');
      rec = logRecords[logRecords.length - 1];
      assert.deepEqual(
        rec.hrTime.map(n => typeof n),
        ['number', 'number']
      );
      assert.strictEqual(rec.attributes.time, 'miller');

      // An atypical Bunyan level number.
      log.info({ level: 42 }, 'just above Bunyan WARN==40');
      rec = logRecords[logRecords.length - 1];
      assert.strictEqual(rec.severityNumber, SeverityNumber.WARN2);
      assert.strictEqual(rec.severityText, undefined);

      log.info({ level: 200 }, 'far above Bunyan FATAL==60');
      rec = logRecords[logRecords.length - 1];
      assert.strictEqual(rec.severityNumber, SeverityNumber.FATAL4);
      assert.strictEqual(rec.severityText, undefined);
    });

    it('does not emit to the Logs SDK if disableLogSending=true', () => {
      instrumentation.setConfig({ disableLogSending: true });

      // Changing `disableLogSending` only has an impact on Loggers created
      // *after* it is set. So we cannot test with the `log` created in
      // `beforeEach()` above.
      log = Logger.createLogger({ name: 'test-logger-name', stream });

      tracer.startActiveSpan('abc', span => {
        const { traceId, spanId } = span.spanContext();
        log.info('foo');
        assert.strictEqual(memExporter.getFinishedLogRecords().length, 0);

        // Test log correlation still works.
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual('foo', record['msg']);
        assert.strictEqual(record['trace_id'], traceId);
        assert.strictEqual(record['span_id'], spanId);
        span.end();
      });
    });

    it('emits to the Logs SDK with `new Logger(...)`', () => {
      log = new Logger({ name: 'test-logger-name', stream });
      log.info('foo');

      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      let rec = logRecords[logRecords.length - 1];
      assert.strictEqual(rec.body, 'foo');

      const child = log.child({ aProperty: 'bar' });
      child.info('hi');
      rec = logRecords[logRecords.length - 1];
      assert.strictEqual(rec.body, 'hi');
      assert.strictEqual(rec.attributes.aProperty, 'bar');
    });

    it('emits to the Logs SDK with `Logger(...)`', () => {
      log = Logger({ name: 'test-logger-name', stream });
      log.info('foo');

      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      let rec = logRecords[logRecords.length - 1];
      assert.strictEqual(rec.body, 'foo');

      const child = log.child({ aProperty: 'bar' });
      child.info('hi');
      rec = logRecords[logRecords.length - 1];
      assert.strictEqual(rec.body, 'hi');
      assert.strictEqual(rec.attributes.aProperty, 'bar');
    });

    it('log record error level', () => {
      instrumentation.setConfig({ logSeverity: SeverityNumber.FATAL });
      // Setting `logSeverity` only has an impact on Loggers created
      // *after* it is set. So we cannot test with the `log` created in
      // `beforeEach()` above.
      log = Logger.createLogger({ name: 'test-logger-name', stream });
      log.error('error log');
      log.fatal('fatal log');
      const logRecords = memExporter.getFinishedLogRecords();
      // Only one log record match configured severity
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'fatal log');
    });

    it('log record error level', () => {
      instrumentation.setConfig({ logSeverity: SeverityNumber.ERROR });
      // Setting `logSeverity` only has an impact on Loggers created
      // *after* it is set. So we cannot test with the `log` created in
      // `beforeEach()` above.
      log = Logger.createLogger({ name: 'test-logger-name', stream });
      log.warn('warn log');
      log.error('error log');
      const logRecords = memExporter.getFinishedLogRecords();
      // Only one log record match configured severity
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'error log');
    });

    it('log record warn level', () => {
      instrumentation.setConfig({ logSeverity: SeverityNumber.WARN });
      // Setting `logSeverity` only has an impact on Loggers created
      // *after* it is set. So we cannot test with the `log` created in
      // `beforeEach()` above.
      log = Logger.createLogger({ name: 'test-logger-name', stream });
      log.info('info log');
      log.warn('warn log');
      const logRecords = memExporter.getFinishedLogRecords();
      // Only one log record match configured severity
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'warn log');
    });

    it('log record info level', () => {
      instrumentation.setConfig({ logSeverity: SeverityNumber.INFO });
      // Setting `logSeverity` only has an impact on Loggers created
      // *after* it is set. So we cannot test with the `log` created in
      // `beforeEach()` above.
      log = Logger.createLogger({ name: 'test-logger-name', stream });
      log.debug('debug log');
      log.info('info log');
      const logRecords = memExporter.getFinishedLogRecords();
      // Only one log record match configured severity
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'info log');
    });

    it('log record debug level', () => {
      instrumentation.setConfig({ logSeverity: SeverityNumber.DEBUG });
      log = Logger.createLogger({ name: 'test-logger-name', stream });
      log.info('info log');
      log.debug('debug log');
      // Just the log.info() writes to `stream`.
      sinon.assert.calledOnce(writeSpy);
      // Both log.info() and log.debug() should be written to the OTel Logs SDK.
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 2);
      assert.strictEqual(logRecords[0].body, 'info log');
      assert.strictEqual(logRecords[1].body, 'debug log');
    });

    it('log record trace level', () => {
      instrumentation.setConfig({ logSeverity: SeverityNumber.TRACE });
      log = Logger.createLogger({ name: 'test-logger-name', stream });
      log.info('info log');
      log.debug('debug log');
      log.debug('trace log');
      // Just the log.info() writes to `stream`.
      sinon.assert.calledOnce(writeSpy);
      // Both log.info() and log.debug() should be written to the OTel Logs SDK.
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 3);
      assert.strictEqual(logRecords[0].body, 'info log');
      assert.strictEqual(logRecords[1].body, 'debug log');
      assert.strictEqual(logRecords[2].body, 'trace log');
    });
  });

  describe('disabled instrumentation', () => {
    before(() => {
      instrumentation.disable();
    });

    after(() => {
      instrumentation.enable();
    });

    beforeEach(() => {
      stream = new Writable();
      stream._write = () => {};
      writeSpy = sinon.spy(stream, 'write');
      log = Logger.createLogger({ name: 'test', stream });
      memExporter.getFinishedLogRecords().length = 0; // clear
    });

    it('does not inject span context', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        log.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], undefined);
        assert.strictEqual(record['span_id'], undefined);
        assert.strictEqual(record['trace_flags'], undefined);
        // Sanity check the message is unchanged
        assert.strictEqual('foo', record['msg']);
      });
    });

    it('does not call log hook', () => {
      const span = tracer.startSpan('abc');
      instrumentation.setConfig({
        logHook: (_span, record) => {
          record['resource.service.name'] = 'test-service';
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        log.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['resource.service.name'], undefined);
      });
    });

    it('does not emit to the Logs SDK', () => {
      tracer.startActiveSpan('abc', span => {
        log.info('foo');
        assert.strictEqual(memExporter.getFinishedLogRecords().length, 0);
      });
    });
  });
});

describe('OpenTelemetryBunyanStream', () => {
  before(() => {
    instrumentation.disable();
  });

  beforeEach(() => {
    memExporter.getFinishedLogRecords().length = 0; // clear
  });

  it('can be used directly with createLogger', () => {
    const log = Logger.createLogger({
      name: 'test-logger-name',
      streams: [
        {
          type: 'raw',
          stream: new OpenTelemetryBunyanStream(),
          level: 'debug',
        },
      ],
    });

    // levels
    log.trace('at trace level');
    log.debug('at debug level');
    log.info('at info level');
    log.warn('at warn level');
    log.error('at error level');
    log.fatal('at fatal level');
    const logRecords = memExporter.getFinishedLogRecords();
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
    log.info({ foo: 'bar' }, 'a message');
    const rec = logRecords[logRecords.length - 1];
    assert.strictEqual(rec.body, 'a message');
    assert.deepStrictEqual(rec.attributes, {
      name: 'test-logger-name',
      foo: 'bar',
    });
    assert.strictEqual(
      rec.resource.attributes['service.name'],
      'test-instrumentation-bunyan'
    );
    assert.strictEqual(
      rec.instrumentationScope.name,
      '@opentelemetry/instrumentation-bunyan'
    );
    assert.strictEqual(rec.instrumentationScope.version, PACKAGE_VERSION);
    assert.strictEqual(rec.spanContext, undefined);

    // spanContext
    tracer.startActiveSpan('abc', span => {
      const { traceId, spanId, traceFlags } = span.spanContext();
      log.info('in active span');
      const rec = logRecords[logRecords.length - 1];
      assert.strictEqual(rec.spanContext?.traceId, traceId);
      assert.strictEqual(rec.spanContext?.spanId, spanId);
      assert.strictEqual(rec.spanContext?.traceFlags, traceFlags);

      // This rec should *NOT* have the `trace_id` et al attributes.
      assert.strictEqual(rec.attributes.trace_id, undefined);
      assert.strictEqual(rec.attributes.span_id, undefined);
      assert.strictEqual(rec.attributes.trace_flags, undefined);

      span.end();
    });
  });
});
