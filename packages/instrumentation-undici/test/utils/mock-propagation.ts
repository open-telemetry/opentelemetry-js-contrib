/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Context,
  TextMapPropagator,
  trace,
  TraceFlags,
} from '@opentelemetry/api';

export class MockPropagation implements TextMapPropagator {
  static TRACE_CONTEXT_KEY = 'x-mock-trace-id';
  static SPAN_CONTEXT_KEY = 'x-mock-span-id';
  extract(context: Context, carrier: Record<string, string>) {
    const extractedSpanContext = {
      traceId: carrier[MockPropagation.TRACE_CONTEXT_KEY] as string,
      spanId: carrier[MockPropagation.SPAN_CONTEXT_KEY] as string,
      traceFlags: TraceFlags.SAMPLED,
      isRemote: true,
    };
    if (extractedSpanContext.traceId && extractedSpanContext.spanId) {
      return trace.setSpanContext(context, extractedSpanContext);
    }
    return context;
  }
  inject(context: Context, carrier: Record<string, string>): void {
    const spanContext = trace.getSpanContext(context);

    if (spanContext) {
      carrier[MockPropagation.TRACE_CONTEXT_KEY] = spanContext.traceId;
      carrier[MockPropagation.SPAN_CONTEXT_KEY] = spanContext.spanId;
    }
  }
  fields(): string[] {
    return [
      MockPropagation.TRACE_CONTEXT_KEY,
      MockPropagation.SPAN_CONTEXT_KEY,
    ];
  }
}
