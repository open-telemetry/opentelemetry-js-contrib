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

import { BaggageSpanProcessor } from '../src/baggage-span-processor';
import {
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  TraceFlags,
} from '@opentelemetry/api';
import { BasicTracerProvider, Span } from '@opentelemetry/sdk-trace-base';
import { expect } from 'expect';

describe('BaggageSpanProcessor', () => {
  const baggageProcessor = new BaggageSpanProcessor();

  const bag = propagation.createBaggage({
    brand: { value: 'samsonite' },
  });

  const expectedAttrs = {
    brand: 'samsonite',
  };

  let span: Span;

  beforeEach(() => {
    span = new Span(
      new BasicTracerProvider().getTracer('baggage-testing'),
      ROOT_CONTEXT,
      'Edward W. Span',
      {
        traceId: 'e4cda95b652f4a1592b449d5929fda1b',
        spanId: '7e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
      },
      SpanKind.SERVER
    );
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

describe('BaggageSpanProcessor with custom key filter', () => {
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
    span = new Span(
      new BasicTracerProvider().getTracer('baggage-testing'),
      ROOT_CONTEXT,
      'Edward W. Span',
      {
        traceId: 'e4cda95b652f4a1592b449d5929fda1b',
        spanId: '7e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
      },
      SpanKind.SERVER
    );
  });

  it('should only add baggage entries that match filter', () => {
    expect(span.attributes).toEqual({});
    const ctx = propagation.setBaggage(ROOT_CONTEXT, bag);
    baggageProcessor.onStart(span, ctx);

    expect(span.attributes).toEqual(expectedAttrs);
  });
});
