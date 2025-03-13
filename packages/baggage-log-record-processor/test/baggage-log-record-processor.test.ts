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

import { BaggageLogRecordProcessor } from '../src/baggage-log-record-processor';
import { ALLOW_ALL_BAGGAGE_KEYS } from '../src/types';
import { propagation, ROOT_CONTEXT, diag, DiagLogLevel, DiagConsoleLogger } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { LoggerProvider, LogRecord, InMemoryLogRecordExporter, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { LoggerProviderSharedState } from '@opentelemetry/sdk-logs/build/src/internal/LoggerProviderSharedState';
import { expect } from 'expect';

describe('BaggageLogRecordProcessor with all keys filter', () => {
  const baggageProcessor = new BaggageLogRecordProcessor(ALLOW_ALL_BAGGAGE_KEYS);

  const bag = propagation.createBaggage({
    brand: { value: 'samsonite' },
  });
  const expectedAttrs = {
    brand: 'samsonite',
  };

  let logRecord: LogRecord;
  

  beforeEach(() => {
    const loggerProvider = new LoggerProvider();
    const memoryLogExporter = new InMemoryLogRecordExporter();
    loggerProvider.addLogRecordProcessor(
      new SimpleLogRecordProcessor(memoryLogExporter)
    );
    logs.setGlobalLoggerProvider(loggerProvider);

    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
    diag.info('info message');

    const logRecords = memoryLogExporter.getFinishedLogRecords();
    console.log(logRecords); // <<< Returning no logs
    logRecord = new LogRecord(
      new LoggerProviderSharedState(
        logRecords[0].resource, 
        100, 
        {attributeValueLengthLimit: 100, attributeCountLimit: 100}
      ), 
      logRecords[0].instrumentationScope, 
      logRecords[0]
    );
    loggerProvider.getLogger('baggage-testing').emit(logRecord);

    // logRecord = {
    //   ...logRecords[0],
    //   totalAttributesCount: 0,
    //   _isReadonly: false,
    //   _logRecordLimits: 100,
    //   setAttribute: 
    //   // severityNumber: 5,
    //   // severityText: 'debug',
    //   // body: 'log message',
    //   // attributes: {},
    //   // hrTime: [1609504210, 150000000],
    //   // hrTimeObserved: [1609504210, 150000000],
    // };
    
  });

  it('onEmit adds current Baggage entries to a log record as attributes', () => {
    expect(logRecord.attributes).toEqual({});
    const ctx = propagation.setBaggage(ROOT_CONTEXT, bag);
    
    baggageProcessor.onEmit(logRecord, ctx);

    expect(logRecord.attributes).toEqual(expectedAttrs);
  });

  it('forceFlush is a no-op and does not throw error', async () => {
    await expect(baggageProcessor.forceFlush()).resolves.not.toThrow();
  });

  it('shutdown is a no-op and does not throw error', async () => {
    await expect(baggageProcessor.shutdown()).resolves.not.toThrow();
  });
});
