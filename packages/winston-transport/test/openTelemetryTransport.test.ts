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

const loggerProvider = new LoggerProvider();
const memoryLogExporter = new InMemoryLogRecordExporter();
loggerProvider.addLogRecordProcessor(
  new SimpleLogRecordProcessor(memoryLogExporter)
);
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
      transport.log({ message: kMessage, level: 'error' }, callback);
      transport.log({ message: kMessage, level: 'warn' }, callback);
      transport.log({ message: kMessage, level: 'info' }, callback);
      transport.log({ message: kMessage, level: 'http' }, callback);
      transport.log({ message: kMessage, level: 'verbose' }, callback);
      transport.log({ message: kMessage, level: 'debug' }, callback);
      transport.log({ message: kMessage, level: 'silly' }, callback);
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
      transport.log({ message: kMessage, level: 'error' }, callback);
      transport.log({ message: kMessage, level: 'warn' }, callback);
      transport.log({ message: kMessage, level: 'help' }, callback);
      transport.log({ message: kMessage, level: 'data' }, callback);
      transport.log({ message: kMessage, level: 'info' }, callback);
      transport.log({ message: kMessage, level: 'debug' }, callback);
      transport.log({ message: kMessage, level: 'verbose' }, callback);
      transport.log({ message: kMessage, level: 'prompt' }, callback);
      transport.log({ message: kMessage, level: 'input' }, callback);
      transport.log({ message: kMessage, level: 'silly' }, callback);
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
      transport.log({ message: kMessage, level: 'emerg' }, callback);
      transport.log({ message: kMessage, level: 'alert' }, callback);
      transport.log({ message: kMessage, level: 'crit' }, callback);
      transport.log({ message: kMessage, level: 'error' }, callback);
      transport.log({ message: kMessage, level: 'warning' }, callback);
      transport.log({ message: kMessage, level: 'notice' }, callback);
      transport.log({ message: kMessage, level: 'info' }, callback);
      transport.log({ message: kMessage, level: 'debug' }, callback);
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

  it('serialized attibutes', () => {
    const transport = new OpenTelemetryTransportV3();
    transport.log(
      {
        message: 'test',
        level: 'error',
        someObject: { test: 'value' },
        someArray: [{ test: 'value' }],
        someError: new Error('testError'),
        someInt8Array: new Int8Array(1),
        someUint8Array: new Uint8Array(1),
        someUint8ClampedArray: new Uint8ClampedArray(1),
        someInt16Array: new Int16Array(1),
        someUint16Array: new Uint16Array(1),
        someInt32Array: new Int32Array(1),
        someUint32Array: new Uint32Array(1),
        someFloat32Array: new Float32Array(1),
        someFloat64Array: new Float64Array(1),
        someBigInt64Array: new BigInt64Array(1),
        someBigUint64Array: new BigUint64Array(1),
      },
      () => {}
    );
    const logRecords = memoryLogExporter.getFinishedLogRecords();
    assert.strictEqual(logRecords.length, 1);
    assert.strictEqual(
      logRecords[0].attributes['someObject'],
      '{"test":"value"}'
    );
    assert.strictEqual(
      logRecords[0].attributes['someArray'],
      '[{"test":"value"}]'
    );
    assert.ok(
      (logRecords[0].attributes['someError'] as string).startsWith(
        '[object Error] { message: "testError", name: "Error", stack: "Error: testError'
      ),
      'Wrong error serialization'
    );
    assert.ok(logRecords[0].attributes['someInt8Array'] instanceof Int8Array);
    assert.ok(logRecords[0].attributes['someUint8Array'] instanceof Uint8Array);
    assert.ok(
      logRecords[0].attributes['someUint8ClampedArray'] instanceof
        Uint8ClampedArray
    );
    assert.ok(logRecords[0].attributes['someInt16Array'] instanceof Int16Array);
    assert.ok(
      logRecords[0].attributes['someUint16Array'] instanceof Uint16Array
    );
    assert.ok(logRecords[0].attributes['someInt32Array'] instanceof Int32Array);
    assert.ok(
      logRecords[0].attributes['someUint32Array'] instanceof Uint32Array
    );
    assert.ok(
      logRecords[0].attributes['someFloat32Array'] instanceof Float32Array
    );
    assert.ok(
      logRecords[0].attributes['someFloat64Array'] instanceof Float64Array
    );
    assert.ok(
      logRecords[0].attributes['someBigInt64Array'] instanceof BigInt64Array
    );
    assert.ok(
      logRecords[0].attributes['someBigUint64Array'] instanceof BigUint64Array
    );
  });
});
