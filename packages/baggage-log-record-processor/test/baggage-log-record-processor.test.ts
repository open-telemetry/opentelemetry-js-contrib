/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaggageLogRecordProcessor } from '../src/baggage-log-record-processor';
import { ALLOW_ALL_BAGGAGE_KEYS } from '../src/types';
import { propagation, ROOT_CONTEXT } from '@opentelemetry/api';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { expect } from 'expect';

describe('BaggageLogRecordProcessor with all keys', () => {
  const baggageProcessor = new BaggageLogRecordProcessor(
    ALLOW_ALL_BAGGAGE_KEYS
  );
  const bag = propagation.createBaggage({
    brand: { value: 'samsonite' },
    color: { value: 'blue' },
  });

  it('onEmit adds current Baggage entries to a log record as attributes', () => {
    const exporter = new InMemoryLogRecordExporter();
    const loggerProvider = new LoggerProvider({
      processors: [baggageProcessor, new SimpleLogRecordProcessor(exporter)],
    });

    const logger = loggerProvider.getLogger('my-logger');
    const ctx = propagation.setBaggage(ROOT_CONTEXT, bag);

    logger.emit({
      body: 'my log body',
      context: ctx,
    });

    const logRecords = exporter.getFinishedLogRecords();
    expect(logRecords.length).toBe(1);
    expect(logRecords[0].attributes).toEqual({
      brand: 'samsonite',
      color: 'blue',
    });
  });

  it('forceFlush is a no-op and does not throw error', async () => {
    await expect(baggageProcessor.forceFlush()).resolves.not.toThrow();
  });

  it('shutdown is a no-op and does not throw error', async () => {
    await expect(baggageProcessor.shutdown()).resolves.not.toThrow();
  });
});

describe('BaggageLogRecordProcessor startWith key filter', () => {
  const baggageProcessor = new BaggageLogRecordProcessor((key: string) =>
    key.startsWith('brand')
  );
  const bag = propagation.createBaggage({
    brand: { value: 'samsonite' },
    color: { value: 'blue' },
  });

  it('onEmit adds current filtered by startWith Baggage entries to a log record as attributes', () => {
    const exporter = new InMemoryLogRecordExporter();
    const loggerProvider = new LoggerProvider({
      processors: [baggageProcessor, new SimpleLogRecordProcessor(exporter)],
    });
    const logger = loggerProvider.getLogger('my-logger');
    const ctx = propagation.setBaggage(ROOT_CONTEXT, bag);

    logger.emit({
      body: 'my log body',
      context: ctx,
    });

    const logRecords = exporter.getFinishedLogRecords();
    expect(logRecords.length).toBe(1);
    expect(logRecords[0].attributes).toEqual({ brand: 'samsonite' });
  });

  it('forceFlush is a no-op and does not throw error', async () => {
    await expect(baggageProcessor.forceFlush()).resolves.not.toThrow();
  });

  it('shutdown is a no-op and does not throw error', async () => {
    await expect(baggageProcessor.shutdown()).resolves.not.toThrow();
  });
});

describe('BaggageLogRecordProcessor with regex key filter', () => {
  const regex = new RegExp('^col.+');
  const baggageProcessor = new BaggageLogRecordProcessor((key: string) =>
    regex.test(key)
  );
  const bag = propagation.createBaggage({
    brand: { value: 'samsonite' },
    color: { value: 'blue' },
  });

  it('onEmit adds current filtered by regex Baggage entries to a log record as attributes', () => {
    const exporter = new InMemoryLogRecordExporter();
    const loggerProvider = new LoggerProvider({
      processors: [baggageProcessor, new SimpleLogRecordProcessor(exporter)],
    });
    const logger = loggerProvider.getLogger('my-logger');
    const ctx = propagation.setBaggage(ROOT_CONTEXT, bag);

    logger.emit({
      body: 'my log body',
      context: ctx,
    });

    const logRecords = exporter.getFinishedLogRecords();
    expect(logRecords.length).toBe(1);
    expect(logRecords[0].attributes).toEqual({ color: 'blue' });
  });

  it('forceFlush is a no-op and does not throw error', async () => {
    await expect(baggageProcessor.forceFlush()).resolves.not.toThrow();
  });

  it('shutdown is a no-op and does not throw error', async () => {
    await expect(baggageProcessor.shutdown()).resolves.not.toThrow();
  });
});
