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
  trace,
  propagation,
  isSpanContextValid,
  isValidSpanId,
  isValidTraceId,
  TextMapGetter,
  TextMapPropagator,
  TextMapSetter,
  TraceFlags,
} from '@opentelemetry/api';

/** OT header keys */
export const OT_TRACE_ID_HEADER = 'ot-tracer-traceid';
export const OT_SPAN_ID_HEADER = 'ot-tracer-spanid';
export const OT_SAMPLED_HEADER = 'ot-tracer-sampled';
export const OT_BAGGAGE_PREFIX = 'ot-baggage-';

const FIELDS = [OT_TRACE_ID_HEADER, OT_SPAN_ID_HEADER, OT_SAMPLED_HEADER];
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

const VALID_HEADER_NAME_CHARS = /^[\^_`a-zA-Z\-0-9!#$%&'*+.|~]+$/;

function isValidHeaderName(name: string): boolean {
  return VALID_HEADER_NAME_CHARS.test(name);
}

const INVALID_HEADER_VALUE_CHARS = /[^\t\x20-\x7e\x80-\xff]/;

function isValidHeaderValue(value: string): boolean {
  return !INVALID_HEADER_VALUE_CHARS.test(value);
}

/**
 * Propagator for the ot-trace HTTP format from OpenTracing.
 */
export class OTTracePropagator implements TextMapPropagator {
  inject(context: Context, carrier: unknown, setter: TextMapSetter) {
    const spanContext = trace.getSpan(context)?.spanContext();
    if (!spanContext || !isSpanContextValid(spanContext)) return;

    setter.set(carrier, OT_TRACE_ID_HEADER, spanContext.traceId.substr(16));
    setter.set(carrier, OT_SPAN_ID_HEADER, spanContext.spanId);
    setter.set(
      carrier,
      OT_SAMPLED_HEADER,
      (spanContext.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED
        ? 'true'
        : 'false'
    );

    const baggage = propagation.getBaggage(context);
    if (!baggage) return;
    baggage.getAllEntries().forEach(([k, v]) => {
      if (!isValidHeaderName(k) || !isValidHeaderValue(v.value)) return;
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
      context = trace.setSpan(
        context,
        trace.wrapSpanContext({
          traceId,
          spanId,
          isRemote: true,
          traceFlags,
        })
      );

      let baggage: Baggage =
        propagation.getBaggage(context) || propagation.createBaggage();

      getter.keys(carrier).forEach(k => {
        if (!k.startsWith(OT_BAGGAGE_PREFIX)) return;
        const value = readHeader(carrier, getter, k);
        baggage = baggage.setEntry(k.substr(OT_BAGGAGE_PREFIX.length), {
          value,
        });
      });

      if (baggage.getAllEntries().length > 0) {
        context = propagation.setBaggage(context, baggage);
      }
    }

    return context;
  }

  /**
   * Note: fields does not include baggage headers as they are dependent on
   * carrier instance. Attempting to reuse a carrier by clearing fields could
   * result in a memory leak.
   */
  fields(): string[] {
    return FIELDS.slice();
  }
}
