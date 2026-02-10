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
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { SeverityNumber } from '@opentelemetry/api-logs';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';

import { RuntimeNodeInstrumentation } from '../src/index';

describe('runtime exception logging', () => {
  let exporter: InMemoryLogRecordExporter;
  let instrumentation: RuntimeNodeInstrumentation;

  beforeEach(() => {
    exporter = new InMemoryLogRecordExporter();
    const loggerProvider = new LoggerProvider({
      processors: [new SimpleLogRecordProcessor(exporter)],
    });
    instrumentation = new RuntimeNodeInstrumentation();
    instrumentation.setLoggerProvider(loggerProvider);
    instrumentation.enable();
  });

  afterEach(() => {
    instrumentation.disable();
  });

  it('emits a FATAL log for uncaught exceptions', () => {
    const error = new Error('Something went wrong');
    error.name = 'ValidationError';
    error.stack = 'Error: Something went wrong\n at foo (file.js:1:1)';

    process.emit('uncaughtExceptionMonitor', error, 'uncaughtException');

    const records = exporter.getFinishedLogRecords();
    assert.ok(records.length >= 1);
    const record = records[records.length - 1];
    assert.strictEqual(record.eventName, 'exception');
    assert.strictEqual(record.severityNumber, SeverityNumber.FATAL);
    assert.strictEqual(
      record.attributes[ATTR_EXCEPTION_MESSAGE],
      'Something went wrong'
    );
    assert.strictEqual(
      record.attributes[ATTR_EXCEPTION_TYPE],
      'ValidationError'
    );
    assert.strictEqual(
      record.attributes[ATTR_EXCEPTION_STACKTRACE],
      error.stack
    );
  });

  it('emits an ERROR log for unhandled rejections', () => {
    process.emit('unhandledRejection', 'nope', Promise.resolve());

    const records = exporter.getFinishedLogRecords();
    assert.ok(records.length >= 1);
    const record = records[records.length - 1];
    assert.strictEqual(record.eventName, 'exception');
    assert.strictEqual(record.severityNumber, SeverityNumber.ERROR);
    assert.strictEqual(record.attributes[ATTR_EXCEPTION_MESSAGE], 'nope');
  });

  it('captures attributes from non-Error objects', () => {
    const rejection = {
      name: 'WeirdError',
      message: 'bad',
      stack: 'stack here',
    };
    process.emit('unhandledRejection', rejection, Promise.resolve());

    const records = exporter.getFinishedLogRecords();
    assert.ok(records.length >= 1);
    const record = records[records.length - 1];
    assert.strictEqual(record.attributes[ATTR_EXCEPTION_TYPE], 'WeirdError');
    assert.strictEqual(record.attributes[ATTR_EXCEPTION_MESSAGE], 'bad');
    assert.strictEqual(
      record.attributes[ATTR_EXCEPTION_STACKTRACE],
      'stack here'
    );
  });

  it('stringifies unknown rejection values', () => {
    const rejection = { foo: 'bar' };
    process.emit('unhandledRejection', rejection, Promise.resolve());

    const records = exporter.getFinishedLogRecords();
    assert.ok(records.length >= 1);
    const record = records[records.length - 1];
    assert.strictEqual(
      record.attributes[ATTR_EXCEPTION_MESSAGE],
      '[object Object]'
    );
  });

  it('stringifies non-object values', () => {
    process.emit('unhandledRejection', 42, Promise.resolve());

    const records = exporter.getFinishedLogRecords();
    assert.ok(records.length >= 1);
    const record = records[records.length - 1];
    assert.strictEqual(record.attributes[ATTR_EXCEPTION_MESSAGE], '42');
  });

  it('applies custom attributes and passes event type', () => {
    instrumentation.disable();
    instrumentation = new RuntimeNodeInstrumentation({
      applyCustomAttributes: (_error, eventType) => ({
        'app.event.type': eventType,
      }),
    });
    const loggerProvider = new LoggerProvider({
      processors: [new SimpleLogRecordProcessor(exporter)],
    });
    instrumentation.setLoggerProvider(loggerProvider);
    instrumentation.enable();

    process.emit(
      'uncaughtExceptionMonitor',
      new Error('boom'),
      'uncaughtException'
    );

    const records = exporter.getFinishedLogRecords();
    assert.ok(records.length >= 1);
    const record = records[records.length - 1];
    assert.strictEqual(record.attributes['app.event.type'], 'uncaughtException');
  });

  it('maps exception attributes for all supported shapes', () => {
    const asAny = instrumentation as unknown as {
      _getExceptionAttributes: (error: unknown) => Record<string, unknown>;
    };

    const errorAttrs = asAny._getExceptionAttributes(new Error('boom'));
    assert.ok(errorAttrs[ATTR_EXCEPTION_MESSAGE]);

    const stringAttrs = asAny._getExceptionAttributes('oops');
    assert.strictEqual(stringAttrs[ATTR_EXCEPTION_MESSAGE], 'oops');

    const objectAttrs = asAny._getExceptionAttributes({
      name: 'CustomError',
      stack: 'stack',
    });
    assert.strictEqual(objectAttrs[ATTR_EXCEPTION_TYPE], 'CustomError');
    assert.strictEqual(objectAttrs[ATTR_EXCEPTION_STACKTRACE], 'stack');
    assert.strictEqual(
      objectAttrs[ATTR_EXCEPTION_MESSAGE],
      '[object Object]'
    );

    const fallbackAttrs = asAny._getExceptionAttributes(null);
    assert.strictEqual(fallbackAttrs[ATTR_EXCEPTION_MESSAGE], 'null');
  });

  it('emits via internal log helper', () => {
    const asAny = instrumentation as unknown as {
      _emitExceptionLog: (
        error: unknown,
        severityNumber: SeverityNumber,
        eventType: 'uncaughtException' | 'unhandledRejection'
      ) => void;
      _handleUncaughtException: (
        error: Error,
        origin: NodeJS.UncaughtExceptionOrigin
      ) => void;
      _handleUnhandledRejection: (reason: unknown) => void;
    };

    asAny._emitExceptionLog('boom', SeverityNumber.ERROR, 'unhandledRejection');
    asAny._handleUncaughtException(new Error('oops'), 'uncaughtException');
    asAny._handleUnhandledRejection('nope');

    const records = exporter.getFinishedLogRecords();
    assert.ok(records.length >= 1);
    const record = records[records.length - 1];
    assert.strictEqual(record.severityNumber, SeverityNumber.ERROR);
  });

  it('keeps emitting when applyCustomAttributes throws', () => {
    instrumentation.disable();
    instrumentation = new RuntimeNodeInstrumentation({
      applyCustomAttributes: () => {
        throw new Error('boom');
      },
    });
    const loggerProvider = new LoggerProvider({
      processors: [new SimpleLogRecordProcessor(exporter)],
    });
    instrumentation.setLoggerProvider(loggerProvider);
    instrumentation.enable();

    process.emit('unhandledRejection', 'nope', Promise.resolve());

    const records = exporter.getFinishedLogRecords();
    assert.ok(records.length >= 1);
    const record = records[records.length - 1];
    assert.strictEqual(record.attributes[ATTR_EXCEPTION_MESSAGE], 'nope');
  });

  it('handles applyCustomAttributes returning undefined', () => {
    instrumentation.disable();
    instrumentation = new RuntimeNodeInstrumentation({
      applyCustomAttributes: () => undefined,
    });
    const loggerProvider = new LoggerProvider({
      processors: [new SimpleLogRecordProcessor(exporter)],
    });
    instrumentation.setLoggerProvider(loggerProvider);
    instrumentation.enable();

    process.emit('unhandledRejection', 'nope', Promise.resolve());

    const records = exporter.getFinishedLogRecords();
    assert.ok(records.length >= 1);
    const record = records[records.length - 1];
    assert.strictEqual(record.attributes[ATTR_EXCEPTION_MESSAGE], 'nope');
  });

  it('does not emit logs when disabled', () => {
    instrumentation.disable();

    process.emit(
      'uncaughtExceptionMonitor',
      new Error('boom'),
      'uncaughtException'
    );
    process.emit('unhandledRejection', 'nope', Promise.resolve());

    const records = exporter.getFinishedLogRecords();
    assert.strictEqual(records.length, 0);
  });

  it('skips logging when disabled but handlers are invoked', () => {
    const handler =
      (instrumentation as unknown as {
        _onUnhandledRejectionHandler?: (
          reason: unknown,
          promise: Promise<unknown>
        ) => void;
      })._onUnhandledRejectionHandler ?? undefined;

    assert.ok(handler, 'expected unhandledRejection handler to be registered');

    instrumentation.disable();
    handler('nope', Promise.resolve());

    const records = exporter.getFinishedLogRecords();
    assert.strictEqual(records.length, 0);
  });

  it('skips logging when emit helper is called while disabled', () => {
    const asAny = instrumentation as unknown as {
      _emitExceptionLog: (
        error: unknown,
        severityNumber: SeverityNumber,
        eventType: 'uncaughtException' | 'unhandledRejection'
      ) => void;
    };

    instrumentation.disable();
    asAny._emitExceptionLog('boom', SeverityNumber.ERROR, 'unhandledRejection');

    const records = exporter.getFinishedLogRecords();
    assert.strictEqual(records.length, 0);
  });

  it('does not register handlers when capture is disabled', () => {
    instrumentation.disable();
    instrumentation = new RuntimeNodeInstrumentation({
      captureUncaughtException: false,
      captureUnhandledRejection: false,
    });
    const loggerProvider = new LoggerProvider({
      processors: [new SimpleLogRecordProcessor(exporter)],
    });
    instrumentation.setLoggerProvider(loggerProvider);
    instrumentation.enable();

    process.emit(
      'uncaughtExceptionMonitor',
      new Error('boom'),
      'uncaughtException'
    );
    process.emit('unhandledRejection', 'nope', Promise.resolve());

    const records = exporter.getFinishedLogRecords();
    assert.strictEqual(records.length, 0);
  });
});
