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
  spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
});
tracerProvider.register();
const tracer = tracerProvider.getTracer('default');

const memExporter = new InMemoryLogRecordExporter();
const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(memExporter)],
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
      assert.strictEqual(logRecords[0].severityText, 'INFO');
    });

    it('emits LogRecord for console.info', () => {
      console.info('info message');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'info message');
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.INFO);
      assert.strictEqual(logRecords[0].severityText, 'INFO');
    });

    it('emits LogRecord for console.warn', () => {
      console.warn('warning message');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'warning message');
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.WARN);
      assert.strictEqual(logRecords[0].severityText, 'WARN');
    });

    it('emits LogRecord for console.error', () => {
      console.error('error message');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'error message');
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.ERROR);
      assert.strictEqual(logRecords[0].severityText, 'ERROR');
    });

    it('emits LogRecord for console.debug', () => {
      console.debug('debug message');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'debug message');
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.DEBUG);
      assert.strictEqual(logRecords[0].severityText, 'DEBUG');
    });

    it('emits LogRecord for console.trace', () => {
      console.trace('trace message');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'trace message');
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.TRACE);
      assert.strictEqual(logRecords[0].severityText, 'TRACE');
    });

    it('formats multiple arguments', () => {
      console.log('hello', 'world', 42);
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'hello world 42');
    });

    it('formats object arguments as JSON', () => {
      console.log('data:', { key: 'value' });
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].body, 'data: {"key":"value"}');
    });
  });

  describe('trace context correlation', () => {
    it('includes trace context in attributes when span is active', () => {
      const span = tracer.startSpan('test-span');
      context.with(trace.setSpan(context.active(), span), () => {
        const { traceId, spanId, traceFlags } = span.spanContext();
        console.log('in span');
        const logRecords = memExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 1);
        assert.strictEqual(logRecords[0].attributes['trace_id'], traceId);
        assert.strictEqual(logRecords[0].attributes['span_id'], spanId);
        assert.strictEqual(
          logRecords[0].attributes['trace_flags'],
          `0${traceFlags.toString(16)}`
        );
        // spanContext is auto-populated by the OTel SDK
        assert.strictEqual(logRecords[0].spanContext?.traceId, traceId);
        assert.strictEqual(logRecords[0].spanContext?.spanId, spanId);
        assert.strictEqual(logRecords[0].spanContext?.traceFlags, traceFlags);
      });
      span.end();
    });

    it('does not include trace context when no span is active', () => {
      console.log('no span');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 1);
      assert.strictEqual(logRecords[0].attributes['trace_id'], undefined);
      assert.strictEqual(logRecords[0].attributes['span_id'], undefined);
      assert.strictEqual(logRecords[0].attributes['trace_flags'], undefined);
      assert.strictEqual(logRecords[0].spanContext, undefined);
    });

    it('does not inject trace context when disableLogCorrelation=true', () => {
      instrumentation.setConfig({ disableLogCorrelation: true });
      const span = tracer.startSpan('test-span');
      context.with(trace.setSpan(context.active(), span), () => {
        console.log('no correlation');
        const logRecords = memExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 1);
        assert.strictEqual(logRecords[0].attributes['trace_id'], undefined);
        assert.strictEqual(logRecords[0].attributes['span_id'], undefined);
        assert.strictEqual(logRecords[0].attributes['trace_flags'], undefined);
        // SDK still populates spanContext since emit happens in active context
        assert.strictEqual(
          logRecords[0].spanContext?.traceId,
          span.spanContext().traceId
        );
      });
      span.end();
    });
  });

  describe('configuration', () => {
    it('does not emit LogRecords when disableLogSending is true', () => {
      instrumentation.setConfig({ disableLogSending: true });
      console.log('should not be sent');
      const logRecords = memExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 0);
    });

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

    it('calls logHook and includes returned attributes', () => {
      instrumentation.setConfig({
        logHook: (_span, record) => {
          record['custom.field'] = 'test-value';
        },
      });
      const span = tracer.startSpan('test-span');
      context.with(trace.setSpan(context.active(), span), () => {
        console.warn('test hook');
        const logRecords = memExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 1);
        assert.strictEqual(
          logRecords[0].attributes['custom.field'],
          'test-value'
        );
      });
      span.end();
    });

    it('does not call logHook when no span is active', () => {
      let hookCalled = false;
      instrumentation.setConfig({
        logHook: () => {
          hookCalled = true;
        },
      });
      console.log('no span');
      assert.strictEqual(hookCalled, false);
    });

    it('does not call logHook when disableLogCorrelation=true', () => {
      let hookCalled = false;
      instrumentation.setConfig({
        disableLogCorrelation: true,
        logHook: () => {
          hookCalled = true;
        },
      });
      const span = tracer.startSpan('test-span');
      context.with(trace.setSpan(context.active(), span), () => {
        console.log('no hook');
        assert.strictEqual(hookCalled, false);
        // Log sending still works
        assert.strictEqual(memExporter.getFinishedLogRecords().length, 1);
      });
      span.end();
    });

    it('does not propagate exceptions from logHook', () => {
      instrumentation.setConfig({
        logHook: () => {
          throw new Error('hook error');
        },
      });
      const span = tracer.startSpan('test-span');
      context.with(trace.setSpan(context.active(), span), () => {
        console.log('test');
        const logRecords = memExporter.getFinishedLogRecords();
        assert.strictEqual(logRecords.length, 1);
        assert.strictEqual(logRecords[0].body, 'test');
        // Trace context still populated despite hook error
        assert.strictEqual(
          logRecords[0].attributes['trace_id'],
          span.spanContext().traceId
        );
      });
      span.end();
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
