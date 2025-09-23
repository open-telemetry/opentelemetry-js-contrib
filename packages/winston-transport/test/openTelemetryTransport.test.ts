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

import { SeverityNumber, logs } from '@opentelemetry/api-logs';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  InMemoryLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { OpenTelemetryTransportV3 } from '../src';

const memoryLogExporter = new InMemoryLogRecordExporter();
const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor(memoryLogExporter)],
});
logs.setGlobalLoggerProvider(loggerProvider);

const kMessage = 'log-message';

describe('OpenTelemetryTransportV3', () => {
  beforeEach(() => {
    memoryLogExporter.getFinishedLogRecords().length = 0; // clear
  });

  it('emit LogRecord', () => {
    const transport = new OpenTelemetryTransportV3();
    const writeSpy = sinon.spy(transport, 'emit');
    transport.log({ message: kMessage }, () => {});
    setImmediate(() => {
      sinon.assert.calledOnce(writeSpy);
    });
    const logRecords = memoryLogExporter.getFinishedLogRecords();
    assert.strictEqual(logRecords.length, 1);
    assert.strictEqual(kMessage, logRecords[0].body, kMessage);
  });

  it('emit LogRecord with extra attibutes', () => {
    const transport = new OpenTelemetryTransportV3();
    const extraAttributes = {
      extraAttribute1: 'attributeValue1',
      extraAttribute2: 'attributeValue2',
    };
    const parameters = Object.assign({ message: kMessage }, extraAttributes);
    transport.log(parameters, () => {});
    const logRecords = memoryLogExporter.getFinishedLogRecords();
    assert.strictEqual(logRecords.length, 1);
    assert.strictEqual(logRecords[0].body, kMessage);
    assert.strictEqual(
      logRecords[0].attributes['extraAttribute1'],
      'attributeValue1'
    );
    assert.strictEqual(
      logRecords[0].attributes['extraAttribute2'],
      'attributeValue2'
    );
  });

  describe('emit logRecord severity', () => {
    it('npm levels', () => {
      const callback = () => {};
      const transport = new OpenTelemetryTransportV3();
      const sym = Symbol.for('level');
      for (const level of [
        'error',
        'warn',
        'info',
        'http',
        'verbose',
        'debug',
        'silly',
      ]) {
        transport.log({ message: kMessage, level, [sym]: level }, callback);
      }
      const logRecords = memoryLogExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 7);
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.ERROR);
      assert.strictEqual(logRecords[1].severityNumber, SeverityNumber.WARN);
      assert.strictEqual(logRecords[2].severityNumber, SeverityNumber.INFO);
      assert.strictEqual(logRecords[3].severityNumber, SeverityNumber.DEBUG3);
      assert.strictEqual(logRecords[4].severityNumber, SeverityNumber.DEBUG2);
      assert.strictEqual(logRecords[5].severityNumber, SeverityNumber.DEBUG);
      assert.strictEqual(logRecords[6].severityNumber, SeverityNumber.TRACE);
    });

    it('cli levels', () => {
      const callback = () => {};
      const transport = new OpenTelemetryTransportV3();
      const sym = Symbol.for('level');
      for (const level of [
        'error',
        'warn',
        'help',
        'data',
        'info',
        'debug',
        'verbose',
        'prompt',
        'input',
        'silly',
      ]) {
        transport.log({ message: kMessage, level, [sym]: level }, callback);
      }
      const logRecords = memoryLogExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 10);
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.ERROR);
      assert.strictEqual(logRecords[1].severityNumber, SeverityNumber.WARN);
      assert.strictEqual(logRecords[2].severityNumber, SeverityNumber.INFO3);
      assert.strictEqual(logRecords[3].severityNumber, SeverityNumber.INFO2);
      assert.strictEqual(logRecords[4].severityNumber, SeverityNumber.INFO);
      assert.strictEqual(logRecords[5].severityNumber, SeverityNumber.DEBUG);
      assert.strictEqual(logRecords[6].severityNumber, SeverityNumber.DEBUG2);
      assert.strictEqual(logRecords[7].severityNumber, SeverityNumber.TRACE4);
      assert.strictEqual(logRecords[8].severityNumber, SeverityNumber.TRACE2);
      assert.strictEqual(logRecords[9].severityNumber, SeverityNumber.TRACE);
    });

    it('syslog levels', () => {
      const callback = () => {};
      const transport = new OpenTelemetryTransportV3();
      const sym = Symbol.for('level');
      for (const level of [
        'emerg',
        'alert',
        'crit',
        'error',
        'warning',
        'notice',
        'info',
        'debug',
      ]) {
        transport.log({ message: kMessage, level, [sym]: level }, callback);
      }
      const logRecords = memoryLogExporter.getFinishedLogRecords();
      assert.strictEqual(logRecords.length, 8);
      assert.strictEqual(logRecords[0].severityNumber, SeverityNumber.FATAL3);
      assert.strictEqual(logRecords[1].severityNumber, SeverityNumber.FATAL2);
      assert.strictEqual(logRecords[2].severityNumber, SeverityNumber.FATAL);
      assert.strictEqual(logRecords[3].severityNumber, SeverityNumber.ERROR);
      assert.strictEqual(logRecords[4].severityNumber, SeverityNumber.WARN);
      assert.strictEqual(logRecords[5].severityNumber, SeverityNumber.INFO2);
      assert.strictEqual(logRecords[6].severityNumber, SeverityNumber.INFO);
      assert.strictEqual(logRecords[7].severityNumber, SeverityNumber.DEBUG);
    });
  });
});
