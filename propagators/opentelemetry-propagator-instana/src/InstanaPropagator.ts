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

import {
  Context,
  trace,
  isSpanContextValid,
  isValidSpanId,
  isValidTraceId,
  TextMapGetter,
  TextMapPropagator,
  TextMapSetter,
  TraceFlags,
  INVALID_TRACEID,
  INVALID_SPANID,
} from '@opentelemetry/api';

/** Instana header names */
export const INSTANA_TRACE_ID_HEADER = 'X-INSTANA-T';
export const INSTANA_SPAN_ID_HEADER = 'X-INSTANA-S';
export const INSTANA_LEVEL_HEADER = 'X-INSTANA-L';

const FIELDS = [
  INSTANA_TRACE_ID_HEADER,
  INSTANA_SPAN_ID_HEADER,
  INSTANA_LEVEL_HEADER,
];

function readHeader(
  carrier: unknown,
  getter: TextMapGetter,
  key: string
): string {
  // By convention, X-INSTANA-* headers are sent all-upper-case. For http and http/2, Node.js normalizes all headers to
  // all-lower-case, that's why we first read via the lower case variant of the header name. For other protocols, no
  // such normalization happens, so we also need to read via the original all-upper-case variant.
  let header =
    getter.get(carrier, key.toLowerCase()) || getter.get(carrier, key);
  if (Array.isArray(header)) [header] = header;
  return header || '';
}

/**
 * Propagator for the Instana HTTP headers.
 */
export class InstanaPropagator implements TextMapPropagator {
  /**
   * Injects the current span context into Instana's vendor specific trace correlation headers (X-INSTANA-T, X-INSTANA-S
   * and X-INSTANA-L).
   */
  inject(context: Context, carrier: unknown, setter: TextMapSetter) {
    const spanContext = trace.getSpan(context)?.spanContext();
    if (!spanContext || !isSpanContextValid(spanContext)) {
      return;
    }

    setter.set(carrier, INSTANA_TRACE_ID_HEADER, spanContext.traceId);
    setter.set(carrier, INSTANA_SPAN_ID_HEADER, spanContext.spanId);
    const sampled =
      (spanContext.traceFlags & TraceFlags.SAMPLED) == TraceFlags.SAMPLED;
    setter.set(carrier, INSTANA_LEVEL_HEADER, sampled ? '1' : '0');
  }

  /**
   * Extracts the span context from Instana's vendor specific trace correlation headers (X-INSTANA-T, X-INSTANA-S
   * and X-INSTANA-L).
   */
  extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    let traceId = readHeader(carrier, getter, INSTANA_TRACE_ID_HEADER);
    if (traceId && traceId.length < 32) {
      traceId = traceId.padStart(32, '0');
    }
    let spanId = readHeader(carrier, getter, INSTANA_SPAN_ID_HEADER);
    if (spanId && spanId.length < 16) {
      spanId = spanId.padStart(16, '0');
    }
    const level = readHeader(carrier, getter, INSTANA_LEVEL_HEADER) || '1';
    const sampled = level !== '0';
    const traceFlags = sampled ? TraceFlags.SAMPLED : TraceFlags.NONE;

    if (isValidTraceId(traceId) && isValidSpanId(spanId)) {
      context = trace.setSpan(
        context,
        trace.wrapSpanContext({
          traceId,
          spanId,
          isRemote: true,
          traceFlags,
        })
      );
    } else if (!sampled) {
      // Even if we do not receive a trace ID/span ID via X-INSTANA-T/X-INSTANA-S, if there is an explicit incoming
      // X-INSTANA-L=0, we want to capture that via trace flags. For Instana tracers, it is perfectly valid to send
      // X-INSTANA-L=0 without X-INSTANA-T/-S.
      context = trace.setSpan(
        context,
        trace.wrapSpanContext({
          traceId: INVALID_TRACEID,
          spanId: INVALID_SPANID,
          isRemote: true,
          traceFlags,
        })
      );
    }

    return context;
  }

  fields(): string[] {
    return FIELDS.slice();
  }
}
