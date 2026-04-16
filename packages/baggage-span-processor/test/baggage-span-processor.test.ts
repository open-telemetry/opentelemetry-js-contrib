/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaggageSpanProcessor } from '../src/baggage-span-processor';
import { ALLOW_ALL_BAGGAGE_KEYS } from '../src/types';
import { propagation, ROOT_CONTEXT, SpanKind } from '@opentelemetry/api';
import { BasicTracerProvider, Span } from '@opentelemetry/sdk-trace-base';
import { expect } from 'expect';

describe('BaggageSpanProcessor with all keys filter', () => {
  const baggageProcessor = new BaggageSpanProcessor(ALLOW_ALL_BAGGAGE_KEYS);

  const bag = propagation.createBaggage({
    brand: { value: 'samsonite' },
  });

  const expectedAttrs = {
    brand: 'samsonite',
  };

  let span: Span;

  beforeEach(() => {
    const tracer = new BasicTracerProvider().getTracer('baggage-testing');
    span = tracer.startSpan(
      'Edward W. Span',
      {
        kind: SpanKind.SERVER,
      },
      ROOT_CONTEXT
    ) as Span;
  });

  it('onStart adds current Baggage entries to a span as attributes', () => {
    expect(span.attributes).toEqual({});
    const ctx = propagation.setBaggage(ROOT_CONTEXT, bag);

    baggageProcessor.onStart(span, ctx);

    expect(span.attributes).toEqual(expectedAttrs);
  });

  it('forceFlush is a no-op and does not throw error', async () => {
    await expect(baggageProcessor.forceFlush()).resolves.not.toThrow();
  });

  it('onEnd is a no-op and does not throw error', async () => {
    expect(() => baggageProcessor.onEnd(span)).not.toThrow();
  });

  it('shutdown is a no-op and does not throw error', async () => {
    await expect(baggageProcessor.shutdown()).resolves.not.toThrow();
  });
});

describe('BaggageSpanProcessor with startWith key filter', () => {
  const baggageProcessor = new BaggageSpanProcessor((key: string) =>
    key.startsWith('brand')
  );

  const bag = propagation.createBaggage({
    brand: { value: 'samsonite' },
    color: { value: 'blue' },
  });

  const expectedAttrs = {
    brand: 'samsonite',
  };

  let span: Span;

  beforeEach(() => {
    const tracer = new BasicTracerProvider().getTracer('baggage-testing');
    span = tracer.startSpan(
      'Edward W. Span',
      {
        kind: SpanKind.SERVER,
      },
      ROOT_CONTEXT
    ) as Span;
  });

  it('should only add baggage entries that match filter', () => {
    expect(span.attributes).toEqual({});
    const ctx = propagation.setBaggage(ROOT_CONTEXT, bag);
    baggageProcessor.onStart(span, ctx);

    expect(span.attributes).toEqual(expectedAttrs);
  });
});

describe('BaggageSpanProcessor with regex key filter', () => {
  const regex = new RegExp('^col.+');
  const baggageProcessor = new BaggageSpanProcessor((key: string) =>
    regex.test(key)
  );

  const bag = propagation.createBaggage({
    brand: { value: 'samsonite' },
    color: { value: 'blue' },
  });

  const expectedAttrs = {
    color: 'blue',
  };

  let span: Span;

  beforeEach(() => {
    const tracer = new BasicTracerProvider().getTracer('baggage-testing');
    span = tracer.startSpan(
      'Edward W. Span',
      {
        kind: SpanKind.SERVER,
      },
      ROOT_CONTEXT
    ) as Span;
  });

  it('should only add baggage entries that match filter', () => {
    expect(span.attributes).toEqual({});
    const ctx = propagation.setBaggage(ROOT_CONTEXT, bag);
    baggageProcessor.onStart(span, ctx);

    expect(span.attributes).toEqual(expectedAttrs);
  });
});
