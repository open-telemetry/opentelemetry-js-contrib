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

import { ExceptionInstrumentation } from '../src/instrumentation';
// @ts-expect-error: not an export, but we want the prebundled version
import chai from 'chai/chai.js';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  InMemoryLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';
import { logs } from '@opentelemetry/api-logs';
const assert = chai.assert;

const STRING_ERROR = 'Some error string.'

describe('ExceptionInstrumentation', () => {
  const exporter = new InMemoryLogRecordExporter();
  const logRecordProcessor = new SimpleLogRecordProcessor(exporter);
  const loggerProvider = new LoggerProvider({processors:[logRecordProcessor]});
  logs.setGlobalLoggerProvider(loggerProvider);

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
      error?: Error | string
    ) => {
      console.log(error);
      if (error instanceof Error && error.name !== 'ValidationError') {
        // If we are testing our instrumentation, we want to let the error propagate.
        // If it is any other kind of error, we want Mocha to handle the error as expected.
        mochaErrorHandler?.call(window, event, source, lineno, colno, error);
      }

      if (typeof error === 'string' && error !== STRING_ERROR) {
        // If we are testing our instrumentation, we want to let the error propagate.
        // If it is any other kind of error, we want Mocha to handle the error as expected.
        mochaErrorHandler?.call(window, event, source, lineno, colno);
      }
    };
  });

  afterEach(() => {
    // Resume Mocha handling of uncaughtExceptions.
    window.onerror = mochaErrorHandler;
  });

  describe('constructor', () => {
    it('should construct an instance', () => {
      const instrumentation = new ExceptionInstrumentation({
        enabled: false,
      });
      assert.ok(instrumentation instanceof ExceptionInstrumentation);
    });
  });

  describe('throwing an error', () => {
    const instr = new ExceptionInstrumentation();
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
        assert.strictEqual(event.eventName, 'exception');
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
        assert.strictEqual(event.attributes[ATTR_EXCEPTION_MESSAGE], 'Something happened!');
        assert.strictEqual(event.attributes[ATTR_EXCEPTION_TYPE], 'ValidationError');
        assert.strictEqual(event.attributes[ATTR_EXCEPTION_STACKTRACE], stack);
      }, 0);
    });

    it('should handle throwing an error as a string', async () => {
      setTimeout(() => {
        throw STRING_ERROR;
      });

      setTimeout(() => {
        const events = exporter.getFinishedLogRecords();
        assert.ok(events.length > 0, 'Expected at least one log record');
        const event = events[0];
        assert.strictEqual(event.attributes[ATTR_EXCEPTION_MESSAGE], STRING_ERROR);
      }, 0);
    });
  });

  describe('adding custom attributes', () => {
    const applyCustomAttrs = (error: Error | string) => {
      if (typeof error === 'string') {
        return { 'app.custom.exception': error.toLocaleUpperCase() };
      }
      return {
        'app.custom.exception': error.message.toLocaleUpperCase(),
      };
    };
    const instr = new ExceptionInstrumentation({
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
        assert.strictEqual(
          event.attributes['app.custom.exception'],
          'SOMETHING HAPPENED!'
        );
      }, 0);
    });

    it('should add custom attributes if the error is a string', async () => {
      setTimeout(() => {
        throw STRING_ERROR;
      });

      setTimeout(() => {
        const events = exporter.getFinishedLogRecords();
        assert.ok(events.length > 0, 'Expected at least one log record');
        const event = events[0];
        assert.strictEqual(event.attributes[ATTR_EXCEPTION_MESSAGE], STRING_ERROR);
        assert.strictEqual(event.attributes['app.custom.exception'], STRING_ERROR.toLocaleUpperCase());
      }, 0);
    });
  });
});
