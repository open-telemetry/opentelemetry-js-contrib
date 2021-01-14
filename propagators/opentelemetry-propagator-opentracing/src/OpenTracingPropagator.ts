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
  Baggage,
  Context,
  getBaggage,
  getParentSpanContext,
  isSpanContextValid,
  isValidSpanId,
  isValidTraceId,
  setBaggage,
  setExtractedSpanContext,
  TextMapGetter,
  TextMapPropagator,
  TextMapSetter,
  TraceFlags,
} from '@opentelemetry/api';

/** OT header keys */
export const OT_TRACE_ID_HEADER = 'ot-tracer-traceid';
export const OT_SPAN_ID_HEADER = 'ot-tracer-spanid';
export const OT_SAMPLED_HEADER = 'ot-tracer-sampled';
export const OT_BAGGAGE_PREFIX = 'ot-tracer-baggage-';

const PADDING = '0'.repeat(16);

function readHeader(
  carrier: unknown,
  getter: TextMapGetter,
  key: string
): string {
  let header = getter.get(carrier, key);
  if (Array.isArray(header)) [header] = header;
  return header || '';
}

/**
 * Propagator for the OpenTracing HTTP format.
 */
export class OpenTracingPropagator implements TextMapPropagator {
  inject(context: Context, carrier: unknown, setter: TextMapSetter) {
    const spanContext = getParentSpanContext(context);
    if (!spanContext || !isSpanContextValid(spanContext)) return;

    setter.set(carrier, OT_TRACE_ID_HEADER, spanContext.traceId);
    setter.set(carrier, OT_SPAN_ID_HEADER, spanContext.spanId);
    setter.set(
      carrier,
      OT_SAMPLED_HEADER,
      spanContext.traceFlags === TraceFlags.SAMPLED ? 'true' : 'false'
    );

    const baggage = getBaggage(context);
    if (!baggage) return;

    Object.entries(baggage).forEach(([k, v]) => {
      setter.set(carrier, `${OT_BAGGAGE_PREFIX}${k}`, v.value);
    });
  }

  extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    let traceId = readHeader(carrier, getter, OT_TRACE_ID_HEADER);
    if (traceId.length == 16) traceId = `${PADDING}${traceId}`;
    const spanId = readHeader(carrier, getter, OT_SPAN_ID_HEADER);
    const sampled = readHeader(carrier, getter, OT_SAMPLED_HEADER);
    const traceFlags =
      sampled === 'true' ? TraceFlags.SAMPLED : TraceFlags.NONE;

    if (isValidTraceId(traceId) && isValidSpanId(spanId)) {
      context = setExtractedSpanContext(context, {
        traceId,
        spanId,
        isRemote: true,
        traceFlags,
      });

      const baggage: Baggage = getBaggage(context) || {};

      getter.keys(carrier).forEach(k => {
        if (!k.startsWith(OT_BAGGAGE_PREFIX)) return;
        const value = readHeader(carrier, getter, k);
        baggage[k.substr(OT_BAGGAGE_PREFIX.length)] = { value };
      });

      if (Object.keys(baggage).length > 0) {
        context = setBaggage(context, baggage);
      }
    }

    return context;
  }

  fields(): string[] {
    return [OT_TRACE_ID_HEADER, OT_SPAN_ID_HEADER, OT_SAMPLED_HEADER];
  }
}
