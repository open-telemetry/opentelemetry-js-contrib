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
  TraceFlags,
  TextMapPropagator,
  TextMapSetter,
  TextMapGetter,
  trace,
} from '@opentelemetry/api';

export class DummyPropagation implements TextMapPropagator {
  static TRACE_CONTEXT_KEY = 'x-dummy-trace-id';
  static SPAN_CONTEXT_KEY = 'x-dummy-span-id';

  extract(context: Context, carrier: unknown, getter: TextMapGetter) {
    const extractedSpanContext = {
      traceId: getter.get(
        carrier,
        DummyPropagation.TRACE_CONTEXT_KEY
      ) as string,
      spanId: getter.get(carrier, DummyPropagation.SPAN_CONTEXT_KEY) as string,
      traceFlags: TraceFlags.SAMPLED,
    };

    if (!extractedSpanContext.traceId || !extractedSpanContext.spanId)
      return context;

    return trace.setSpanContext(context, extractedSpanContext);
  }

  inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    const spanContext = trace.getSpanContext(context);
    if (!spanContext) return;

    setter.set(
      carrier,
      DummyPropagation.TRACE_CONTEXT_KEY,
      spanContext.traceId
    );
    setter.set(carrier, DummyPropagation.SPAN_CONTEXT_KEY, spanContext.spanId);
  }

  fields(): string[] {
    return [
      DummyPropagation.TRACE_CONTEXT_KEY,
      DummyPropagation.SPAN_CONTEXT_KEY,
    ];
  }
}
