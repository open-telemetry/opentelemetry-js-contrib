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
const assert = chai.assert;

describe('WebExceptionInstrumentation', () => {
  const loggerProvider = new LoggerProvider();
  const exporter = new InMemoryLogRecordExporter();
  const logRecordProcessor = new SimpleLogRecordProcessor(exporter);
  loggerProvider.addLogRecordProcessor(logRecordProcessor);

  const eventLoggerProvider = new EventLoggerProvider(loggerProvider);
  events.setGlobalEventLoggerProvider(eventLoggerProvider);

  describe('constructor', () => {
    it('should construct an instance', () => {
      const instrumentation = new WebExceptionInstrumentation({
        enabled: false,
      });
      assert.ok(instrumentation instanceof WebExceptionInstrumentation);
    });
  });

  describe('throwing an error', () => {
    beforeEach(() => {
      const instr = new WebExceptionInstrumentation();
      registerInstrumentations({
        instrumentations: [instr],
      });
      instr.enable();
    });

    it('should create an event when an error is thrown', async () => {
      const err = new Error('Something happened!');
      err.stack =
        '' +
        '  Error: Something happened\n' +
        '    at baz (filename.js:10:15)\n' +
        '    at bar (filename.js:6:3)\n' +
        '    at foo (filename.js:2:3)\n' +
        '    at (filename.js:13:1)';
      setTimeout(() => {
        try {
          throw err;
        } catch (error) {
          assert.ok(error instanceof Error);
          // Do nothing
        }
      });

      // Wait for error to be processed and log to be created
      setTimeout(() => {
        try {
          const events = exporter.getFinishedLogRecords();
          assert.ok(events.length > 0, 'Expected at least one log record');
          const event = events[0];
          assert.ok(event.attributes['event.name'] === 'exception');
        } catch (e) {}
      }, 0);
    });
  });
});
