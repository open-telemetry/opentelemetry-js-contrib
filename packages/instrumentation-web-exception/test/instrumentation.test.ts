/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExceptionInstrumentation } from '../src/instrumentation';
// @ts-expect-error TS1479: chai v6 is ESM-only; the CJS build flags it, but browser tests load it as ESM
import { assert } from 'chai';
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
import { diag, DiagLogLevel, logs } from '@opentelemetry/api';

const STRING_ERROR = 'Some error string.';

describe('ExceptionInstrumentation', () => {
  const exporter = new InMemoryLogRecordExporter();
  const logRecordProcessor = new SimpleLogRecordProcessor({ exporter });
  const loggerProvider = new LoggerProvider({
    processors: [logRecordProcessor],
  });
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
    let disableInstrumentations: () => void;
    beforeEach(() => {
      disableInstrumentations = registerInstrumentations({
        instrumentations: [new ExceptionInstrumentation()],
      });
    });

    afterEach(() => {
      disableInstrumentations();
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
        assert.strictEqual(
          event.attributes[ATTR_EXCEPTION_MESSAGE],
          'Something happened!'
        );
        assert.strictEqual(
          event.attributes[ATTR_EXCEPTION_TYPE],
          'ValidationError'
        );
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
        assert.strictEqual(
          event.attributes[ATTR_EXCEPTION_MESSAGE],
          STRING_ERROR
        );
      }, 0);
    });
  });

  describe('handling an event without an error', () => {
    let debugCalls: unknown[][];
    let cleanup: Array<() => void>;

    beforeEach(() => {
      debugCalls = [];
      cleanup = [];
      diag.setLogger(
        {
          error() {},
          warn() {},
          info() {},
          debug: (...args: unknown[]) => {
            debugCalls.push(args);
          },
          verbose() {},
        },
        DiagLogLevel.DEBUG
      );
    });

    afterEach(() => {
      // Runs even when a test fails part way, so nothing leaks into later tests.
      cleanup.forEach(undo => undo());
      diag.disable();
      exporter.reset();
    });

    const loggedDebug = (message: string) =>
      debugCalls.some(args => args.includes(message));

    const registerEnabledInstrumentation = () => {
      cleanup.push(
        registerInstrumentations({
          instrumentations: [new ExceptionInstrumentation()],
        })
      );
    };

    it('should ignore an error event whose error is null or undefined', () => {
      const instrumentation = new ExceptionInstrumentation({ enabled: false });
      // What browsers deliver for cross-origin script errors, the
      // ResizeObserver loop error and `throw null`: the error is null in
      // Chrome and Safari, undefined in Firefox.
      for (const error of [null, undefined]) {
        for (const message of [
          'Script error.',
          'ResizeObserver loop completed with undelivered notifications.',
          'Uncaught null',
        ]) {
          instrumentation.onError(new ErrorEvent('error', { message, error }));
        }
      }
      assert.strictEqual(exporter.getFinishedLogRecords().length, 0);
      assert.ok(loggedDebug('ignored error event with no error'));
    });

    it('should ignore an unhandled rejection whose reason is null or undefined', () => {
      const instrumentation = new ExceptionInstrumentation({ enabled: false });
      for (const reason of [null, undefined]) {
        instrumentation.onError(
          new PromiseRejectionEvent('unhandledrejection', {
            promise: Promise.resolve(),
            reason,
          })
        );
      }
      assert.strictEqual(exporter.getFinishedLogRecords().length, 0);
      assert.ok(loggedDebug('ignored unhandledrejection event with no reason'));
    });

    it('should still report an empty string error or reason', () => {
      const instrumentation = new ExceptionInstrumentation({ enabled: false });
      instrumentation.onError(new ErrorEvent('error', { error: '' }));
      instrumentation.onError(
        new PromiseRejectionEvent('unhandledrejection', {
          promise: Promise.resolve(),
          reason: '',
        })
      );
      const records = exporter.getFinishedLogRecords();
      assert.strictEqual(records.length, 2);
      for (const record of records) {
        assert.deepStrictEqual(record.attributes, {
          [ATTR_EXCEPTION_MESSAGE]: '',
        });
      }
    });

    it('should not call applyCustomAttributes for an event without an error', () => {
      const received: unknown[] = [];
      const instrumentation = new ExceptionInstrumentation({
        enabled: false,
        applyCustomAttributes: error => {
          received.push(error);
          return {};
        },
      });
      instrumentation.onError(
        new ErrorEvent('error', { message: 'Script error.', error: null })
      );
      assert.deepStrictEqual(received, []);
    });

    it('should not record its own error for a real Promise.reject(null)', async () => {
      registerEnabledInstrumentation();
      void Promise.reject(null);
      void Promise.reject();
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.ok(
        loggedDebug('ignored unhandledrejection event with no reason'),
        'expected the rejections to reach the instrumentation'
      );
      assert.strictEqual(exporter.getFinishedLogRecords().length, 0);
    });

    it('should not report a real ResizeObserver loop error', async () => {
      // Guards against reporting the loop error, which was never recorded.
      registerEnabledInstrumentation();
      let loopErrors = 0;
      const countLoopErrors = (event: ErrorEvent) => {
        if (event.message.startsWith('ResizeObserver loop ')) {
          loopErrors++;
        }
      };
      window.addEventListener('error', countLoopErrors);
      const element = document.createElement('div');
      document.body.appendChild(element);
      let resizes = 0;
      const observer = new ResizeObserver(() => {
        // Resizing the observed element from its own callback makes the
        // browser skip the new observation and report the loop error.
        if (resizes < 3) {
          resizes++;
          element.style.width = `${resizes * 10}px`;
        }
      });
      cleanup.push(() => {
        observer.disconnect();
        element.remove();
        window.removeEventListener('error', countLoopErrors);
      });
      observer.observe(element);
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.ok(loopErrors > 0, 'expected a ResizeObserver loop error');
      assert.strictEqual(exporter.getFinishedLogRecords().length, 0);
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

    let disableInstrumentations: () => void;

    beforeEach(() => {
      disableInstrumentations = registerInstrumentations({
        instrumentations: [
          new ExceptionInstrumentation({
            applyCustomAttributes: applyCustomAttrs,
          }),
        ],
      });
    });

    afterEach(() => {
      disableInstrumentations();
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
        assert.strictEqual(
          event.attributes[ATTR_EXCEPTION_MESSAGE],
          STRING_ERROR
        );
        assert.strictEqual(
          event.attributes['app.custom.exception'],
          STRING_ERROR.toLocaleUpperCase()
        );
      }, 0);
    });
  });
});
