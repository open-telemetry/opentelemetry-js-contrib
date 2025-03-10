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

import { WebExceptionInstrumentation } from '../src/instrumentation';
// @ts-expect-error: not an export, but we want the prebundled version
import chai from 'chai/chai.js';
import { EventLoggerProvider } from '@opentelemetry/sdk-events';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  InMemoryLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import { events } from '@opentelemetry/api-events';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';
const assert = chai.assert;

describe('WebExceptionInstrumentation', () => {
  const loggerProvider = new LoggerProvider();
  const exporter = new InMemoryLogRecordExporter();
  const logRecordProcessor = new SimpleLogRecordProcessor(exporter);
  loggerProvider.addLogRecordProcessor(logRecordProcessor);

  const eventLoggerProvider = new EventLoggerProvider(loggerProvider);
  events.setGlobalEventLoggerProvider(eventLoggerProvider);

  // Helper function to throw an error of a specific type so that we can allow the error to propagate and test the instrumentation.
  const throwErr = (message: string, stack?: string): void => {
    class ValidationError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
      }
    }
    const err = new ValidationError(message);
    if (stack) {
      err.stack = stack;
    }
    throw err;
  };

  let mochaErrorHandler: OnErrorEventHandler;

  beforeEach(() => {
    mochaErrorHandler = window.onerror;
    // We need to handle the error ourselves to prevent Mocha from failing the test.
    window.onerror = (
      event: Event | string,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error
    ) => {
      if (error?.name !== 'ValidationError') {
        // If we are testing our instrumentation, we want to let the error propagate.
        // If it is any other kind of error, we want Mocha to handle the error as expected.
        mochaErrorHandler?.call(window, event, source, lineno, colno, error);
      }
    };
  });

  afterEach(() => {
    // Resume Mocha handling of uncaughtExceptions.
    window.onerror = mochaErrorHandler;
  });

  describe('constructor', () => {
    it('should construct an instance', () => {
      const instrumentation = new WebExceptionInstrumentation({
        enabled: false,
      });
      assert.ok(instrumentation instanceof WebExceptionInstrumentation);
    });
  });

  describe('throwing an error', () => {
    const instr = new WebExceptionInstrumentation();
    beforeEach(() => {
      registerInstrumentations({
        instrumentations: [instr],
      });

      instr.enable();
    });

    afterEach(() => {
      instr.disable();
      exporter.reset();
    });

    it('should create an event when an error is thrown', async () => {
      setTimeout(() => {
        throwErr('Something happened!');
      });

      setTimeout(() => {
        const events = exporter.getFinishedLogRecords();
        assert.ok(events.length > 0, 'Expected at least one log record');
        const event = events[0];
        assert.strictEqual(event.attributes['event.name'], 'exception');
      }, 0);
    });

    it('should apply semantic attributes for exceptions to the event', async () => {
      const stack =
        '' +
        '  Error: Something happened\n' +
        '    at baz (filename.js:10:15)\n' +
        '    at bar (filename.js:6:3)\n' +
        '    at foo (filename.js:2:3)\n' +
        '    at (filename.js:13:1)';
      setTimeout(() => {
        throwErr('Something happened!', stack);
      });

      setTimeout(() => {
        const events = exporter.getFinishedLogRecords();
        assert.ok(events.length > 0, 'Expected at least one log record');
        const event = events[0];
        const body = event.body as Record<string, any>;
        assert.strictEqual(body[ATTR_EXCEPTION_MESSAGE], 'Something happened!');
        assert.strictEqual(body[ATTR_EXCEPTION_TYPE], 'ValidationError');
        assert.strictEqual(body[ATTR_EXCEPTION_STACKTRACE], stack);
      }, 0);
    });
  });

  describe('adding custom attributes', () => {
    const applyCustomAttrs = (error: Error) => {
      return {
        'app.custom.exception': error.message.toLocaleUpperCase(),
      };
    };
    const instr = new WebExceptionInstrumentation({
      applyCustomAttributes: applyCustomAttrs,
    });
    beforeEach(() => {
      registerInstrumentations({
        instrumentations: [instr],
      });

      instr.enable();
    });

    afterEach(() => {
      instr.disable();
      exporter.reset();
    });
    it('should add custom attributes to the event', async () => {
      setTimeout(() => {
        throwErr('Something happened!');
      });

      setTimeout(() => {
        const events = exporter.getFinishedLogRecords();
        assert.ok(events.length > 0, 'Expected at least one log record');
        const event = events[0];
        const body = event.body as Record<string, any>;
        assert.strictEqual(body['app.custom.exception'], 'SOMETHING HAPPENED!');
      }, 0);
    });
  });
});
