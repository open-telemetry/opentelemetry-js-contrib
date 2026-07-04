/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace';
import { context, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  InMemoryLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import * as assert from 'assert';
import { ConsoleInstrumentation } from '../src';

const tracerProvider = new NodeTracerProvider({
  spanProcessors: [
    new SimpleSpanProcessor({ exporter: new InMemorySpanExporter() }),
  ],
});
tracerProvider.register();
const tracer = tracerProvider.getTracer('default');

const memExporter = new InMemoryLogRecordExporter();
const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor({ exporter: memExporter })],
});
logs.setGlobalLoggerProvider(loggerProvider);

const instrumentation = new ConsoleInstrumentation();

describe('ConsoleInstrumentation', () => {
  beforeEach(() => {
    instrumentation.setConfig({});
    memExporter.getFinishedLogRecords().length = 0;
  });

  describe('log sending', () => {
    it('emits LogRecord for console.log', () => {
      console.log('hello world');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'hello world');
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.INFO);
      assert.strictEqual(logRecords[0].severityText, 'info');
    });

    it('emits LogRecord for console.info', () => {
      console.info('info message');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'info message');
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.INFO);
      assert.strictEqual(logRecords[0].severityText, 'info');
    });

    it('emits LogRecord for console.warn', () => {
      console.warn('warning message');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'warning message');
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.WARN);
      assert.strictEqual(logRecords[0].severityText, 'warn');
    });

    it('emits LogRecord for console.error', () => {
      console.error('error message');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'error message');
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.ERROR);
      assert.strictEqual(logRecords[0].severityText, 'error');
    });

    it('emits LogRecord for console.debug', () => {
      console.debug('debug message');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'debug message');
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.DEBUG);
      assert.strictEqual(logRecords[0].severityText, 'debug');
    });

    it('emits LogRecord for console.trace', () => {
      console.trace('trace message');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'trace message');
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.TRACE);
      assert.strictEqual(logRecords[0].severityText, 'trace');
    });

    it('formats multiple arguments', () => {
      console.log('hello', 'world', 42);
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'hello world 42');
    });

    it('formats object arguments with util.inspect', () => {
      console.log('data:', { key: 'value' });
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, "data: { key: 'value' }");
    });

    it('handles format specifiers', () => {
      console.log('num: %d, str: %s', 42, 'hello');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'num: 42, str: hello');
    });
  });

  describe('trace context correlation', () => {
    it('associates active span context with the LogRecord', () => {
      const span = tracer.startSpan('test-span');
      context.with(trace.setSpan(context.active(), span), () => {
        const { traceId, spanId, traceFlags } = span.spanContext();
        console.log('in span');
        const logRecords = memExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 1);
        // spanContext is populated by the OTel SDK from the emitted context
        assert.strictEqual(logRecords[0].spanContext?.traceId, traceId);
        assert.strictEqual(logRecords[0].spanContext?.spanId, spanId);
        assert.strictEqual(logRecords[0].spanContext?.traceFlags, traceFlags);
      });
      span.end();
    });

    it('does not associate span context when no span is active', () => {
      console.log('no span');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].spanContext, undefined);
    });
  });

  describe('configuration', () => {
    it('respects logSeverity filter', () => {
      instrumentation.setConfig({ logSeverity: SeverityNumber.WARN });
      console.log('info log');
      console.warn('warn log');
      console.error('error log');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 2);
      assert.strictEqual(logRecords[0].body, 'warn log');
      assert.strictEqual(logRecords[1].body, 'error log');
    });
  });

  describe('disabled instrumentation', () => {
    it('does not emit LogRecords when disabled', () => {
      instrumentation.disable();
      console.log('should not be sent');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 0);
      instrumentation.enable();
    });
  });
});
