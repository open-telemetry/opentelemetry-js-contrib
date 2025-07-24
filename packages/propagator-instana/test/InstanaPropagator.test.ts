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
  trace,
  defaultTextMapGetter,
  defaultTextMapSetter,
  INVALID_SPANID,
  INVALID_TRACEID,
  SpanContext,
  TraceFlags,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import * as assert from 'assert';
import {
  InstanaPropagator,
  INSTANA_TRACE_ID_HEADER,
  INSTANA_SPAN_ID_HEADER,
  INSTANA_LEVEL_HEADER,
} from '../src/InstanaPropagator';

describe('InstanaPropagator', () => {
  const propagator = new InstanaPropagator();
  let carrier: { [key: string]: unknown };

  beforeEach(() => {
    carrier = {};
  });

  describe('.inject()', () => {
    it('injects a valid span context into the X-INSTANA-T/-S/-L headers', () => {
      const spanContext: SpanContext = {
        traceId: '80f198ee56343ba864fe8b2a57d3eff7',
        spanId: 'e457b5a2e4d86bd1',
        traceFlags: TraceFlags.SAMPLED,
      };

      propagator.inject(
        trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(spanContext)),
        carrier,
        defaultTextMapSetter
      );

      assert.strictEqual(
        carrier[INSTANA_TRACE_ID_HEADER],
        '80f198ee56343ba864fe8b2a57d3eff7'
      );
      assert.strictEqual(carrier[INSTANA_SPAN_ID_HEADER], 'e457b5a2e4d86bd1');
      assert.strictEqual(carrier[INSTANA_LEVEL_HEADER], '1');
    });

    it('translates sampled flag into level header', () => {
      const spanContext: SpanContext = {
        traceId: '80f198ee56343ba864fe8b2a57d3eff7',
        spanId: 'e457b5a2e4d86bd1',
        traceFlags: TraceFlags.NONE,
      };

      propagator.inject(
        trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(spanContext)),
        carrier,
        defaultTextMapSetter
      );

      assert.strictEqual(
        carrier[INSTANA_TRACE_ID_HEADER],
        '80f198ee56343ba864fe8b2a57d3eff7'
      );
      assert.strictEqual(carrier[INSTANA_SPAN_ID_HEADER], 'e457b5a2e4d86bd1');
      assert.strictEqual(carrier[INSTANA_LEVEL_HEADER], '0');
    });

    it('correctly reads sampled flags, even if other flags are set', () => {
      const spanContext: SpanContext = {
        traceId: '80f198ee56343ba864fe8b2a57d3eff7',
        spanId: 'e457b5a2e4d86bd1',
        // 81 = 1000 0001, so this sets the sampled flag (rightmost bit) and one other flag (leftmost bit, semantics
        // unspecified at the time of writing)
        traceFlags: 81,
      };

      propagator.inject(
        trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(spanContext)),
        carrier,
        defaultTextMapSetter
      );

      assert.strictEqual(
        carrier[INSTANA_TRACE_ID_HEADER],
        '80f198ee56343ba864fe8b2a57d3eff7'
      );
      assert.strictEqual(carrier[INSTANA_SPAN_ID_HEADER], 'e457b5a2e4d86bd1');
      assert.strictEqual(carrier[INSTANA_LEVEL_HEADER], '1');
    });

    it('does nothing if the trace ID is invalid', () => {
      const spanContext: SpanContext = {
        traceId: INVALID_TRACEID,
        spanId: 'e457b5a2e4d86bd1',
        traceFlags: TraceFlags.SAMPLED,
      };

      propagator.inject(
        trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(spanContext)),
        carrier,
        defaultTextMapSetter
      );

      assert.strictEqual(carrier[INSTANA_TRACE_ID_HEADER], undefined);
      assert.strictEqual(carrier[INSTANA_SPAN_ID_HEADER], undefined);
      assert.strictEqual(carrier[INSTANA_LEVEL_HEADER], undefined);
    });

    it('does nothing if the span ID is invalid', () => {
      const spanContext: SpanContext = {
        traceId: '80f198ee56343ba864fe8b2a57d3eff7',
        spanId: INVALID_SPANID,
        traceFlags: TraceFlags.SAMPLED,
      };

      propagator.inject(
        trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(spanContext)),
        carrier,
        defaultTextMapSetter
      );

      assert.strictEqual(carrier[INSTANA_TRACE_ID_HEADER], undefined);
      assert.strictEqual(carrier[INSTANA_SPAN_ID_HEADER], undefined);
      assert.strictEqual(carrier[INSTANA_LEVEL_HEADER], undefined);
    });
  });

  describe('.extract', () => {
    it('extracts context with trace ID, span ID, and sampled=true', () => {
      // Header names converted to lower case to emulate the normalization of header names applied by the Node.js http
      // module.
      carrier = {
        [INSTANA_TRACE_ID_HEADER.toLowerCase()]:
          '80f198ee56343ba864fe8b2a57d3eff7',
        [INSTANA_SPAN_ID_HEADER.toLowerCase()]: 'e457b5a2e4d86bd1',
        [INSTANA_LEVEL_HEADER.toLowerCase()]: '1',
      };

      const context = propagator.extract(
        ROOT_CONTEXT,
        carrier,
        defaultTextMapGetter
      );

      const extractedSpanContext = trace.getSpan(context)?.spanContext();

      assert.deepStrictEqual(extractedSpanContext, {
        traceId: '80f198ee56343ba864fe8b2a57d3eff7',
        spanId: 'e457b5a2e4d86bd1',
        isRemote: true,
        traceFlags: TraceFlags.SAMPLED,
      });
    });

    it('extracts context when no header name normalization occurs', () => {
      // Not converting header names to lower case to emulate what would happen for non-HTTP protocols where no
      // normalization is applied.
      carrier = {
        [INSTANA_TRACE_ID_HEADER]: '80f198ee56343ba864fe8b2a57d3eff7',
        [INSTANA_SPAN_ID_HEADER]: 'e457b5a2e4d86bd1',
        [INSTANA_LEVEL_HEADER]: '1',
      };

      const context = propagator.extract(
        ROOT_CONTEXT,
        carrier,
        defaultTextMapGetter
      );

      const extractedSpanContext = trace.getSpan(context)?.spanContext();

      assert.deepStrictEqual(extractedSpanContext, {
        traceId: '80f198ee56343ba864fe8b2a57d3eff7',
        spanId: 'e457b5a2e4d86bd1',
        isRemote: true,
        traceFlags: TraceFlags.SAMPLED,
      });
    });

    it('assumes level=1 when level header is missing', () => {
      carrier = {
        [INSTANA_TRACE_ID_HEADER.toLowerCase()]:
          '80f198ee56343ba864fe8b2a57d3eff7',
        [INSTANA_SPAN_ID_HEADER.toLowerCase()]: 'e457b5a2e4d86bd1',
      };

      const context = propagator.extract(
        ROOT_CONTEXT,
        carrier,
        defaultTextMapGetter
      );

      const extractedSpanContext = trace.getSpan(context)?.spanContext();

      assert.deepStrictEqual(extractedSpanContext, {
        traceId: '80f198ee56343ba864fe8b2a57d3eff7',
        spanId: 'e457b5a2e4d86bd1',
        isRemote: true,
        traceFlags: TraceFlags.SAMPLED,
      });
    });

    it('extracts context with trace ID, span ID, sampled=false', () => {
      carrier = {
        [INSTANA_TRACE_ID_HEADER.toLowerCase()]:
          '80f198ee56343ba864fe8b2a57d3eff7',
        [INSTANA_SPAN_ID_HEADER.toLowerCase()]: 'e457b5a2e4d86bd1',
        [INSTANA_LEVEL_HEADER.toLowerCase()]: '0',
      };

      const context = propagator.extract(
        ROOT_CONTEXT,
        carrier,
        defaultTextMapGetter
      );

      const extractedSpanContext = trace.getSpan(context)?.spanContext();

      assert.deepStrictEqual(extractedSpanContext, {
        traceId: '80f198ee56343ba864fe8b2a57d3eff7',
        spanId: 'e457b5a2e4d86bd1',
        isRemote: true,
        traceFlags: TraceFlags.NONE,
      });
    });

    it('extracts sampled=false from X-INSTANA-L=0, even if trace ID and span ID are missing', () => {
      carrier = {
        [INSTANA_LEVEL_HEADER.toLowerCase()]: '0',
      };

      const context = propagator.extract(
        ROOT_CONTEXT,
        carrier,
        defaultTextMapGetter
      );

      const extractedSpanContext = trace.getSpan(context)?.spanContext();

      assert.deepStrictEqual(extractedSpanContext, {
        traceId: INVALID_TRACEID,
        spanId: INVALID_SPANID,
        isRemote: true,
        traceFlags: TraceFlags.NONE,
      });
    });

    it('left-pads a 64-bit trace ID', () => {
      carrier = {
        [INSTANA_TRACE_ID_HEADER.toLowerCase()]: '4aaba1a52cf8ee09',
        [INSTANA_SPAN_ID_HEADER.toLowerCase()]: 'e457b5a2e4d86bd1',
        [INSTANA_LEVEL_HEADER.toLowerCase()]: '1',
      };

      const context = propagator.extract(
        ROOT_CONTEXT,
        carrier,
        defaultTextMapGetter
      );

      const extractedSpanContext = trace.getSpan(context)?.spanContext();
      assert.deepStrictEqual(extractedSpanContext, {
        traceId: '00000000000000004aaba1a52cf8ee09',
        spanId: 'e457b5a2e4d86bd1',
        isRemote: true,
        traceFlags: TraceFlags.SAMPLED,
      });
    });

    it('left-pads the span ID if necessary', () => {
      carrier = {
        [INSTANA_TRACE_ID_HEADER.toLowerCase()]:
          '80f198ee56343ba864fe8b2a57d3eff7',
        [INSTANA_SPAN_ID_HEADER.toLowerCase()]: '7b5a2e4d86bd1',
        [INSTANA_LEVEL_HEADER.toLowerCase()]: '1',
      };

      const context = propagator.extract(
        ROOT_CONTEXT,
        carrier,
        defaultTextMapGetter
      );

      const extractedSpanContext = trace.getSpan(context)?.spanContext();
      assert.deepStrictEqual(extractedSpanContext, {
        traceId: '80f198ee56343ba864fe8b2a57d3eff7',
        spanId: '0007b5a2e4d86bd1',
        isRemote: true,
        traceFlags: TraceFlags.SAMPLED,
      });
    });

    it('handles malformed trace ID', () => {
      carrier = {
        [INSTANA_TRACE_ID_HEADER.toLowerCase()]:
          'ghjklmnopqrstuvwxyz0123456789abc',
        [INSTANA_SPAN_ID_HEADER.toLowerCase()]: 'e457b5a2e4d86bd1',
        [INSTANA_LEVEL_HEADER.toLowerCase()]: '1',
      };

      const context = propagator.extract(
        ROOT_CONTEXT,
        carrier,
        defaultTextMapGetter
      );

      const extractedSpanContext = trace.getSpan(context)?.spanContext();
      assert.deepStrictEqual(undefined, extractedSpanContext);
    });

    it('handles malformed span ID', () => {
      carrier = {
        [INSTANA_TRACE_ID_HEADER.toLowerCase()]:
          '0f198ee56343ba864fe8b2a57d3eff7',
        [INSTANA_SPAN_ID_HEADER.toLowerCase()]: 'ghjklmnopqrstuv',
        [INSTANA_LEVEL_HEADER.toLowerCase()]: '1',
      };

      const context = propagator.extract(
        ROOT_CONTEXT,
        carrier,
        defaultTextMapGetter
      );

      const extractedSpanContext = trace.getSpan(context)?.spanContext();
      assert.deepStrictEqual(undefined, extractedSpanContext);
    });

    it('handles invalid trace ID', () => {
      carrier = {
        [INSTANA_TRACE_ID_HEADER.toLowerCase()]: INVALID_TRACEID,
        [INSTANA_SPAN_ID_HEADER.toLowerCase()]: 'e457b5a2e4d86bd1',
        [INSTANA_LEVEL_HEADER.toLowerCase()]: '1',
      };

      const context = propagator.extract(
        ROOT_CONTEXT,
        carrier,
        defaultTextMapGetter
      );

      const extractedSpanContext = trace.getSpan(context)?.spanContext();
      assert.deepStrictEqual(undefined, extractedSpanContext);
    });

    it('handles invalid span ID', () => {
      carrier = {
        [INSTANA_TRACE_ID_HEADER.toLowerCase()]:
          '80f198ee56343ba864fe8b2a57d3eff7',
        [INSTANA_SPAN_ID_HEADER.toLowerCase()]: INVALID_SPANID,
        [INSTANA_LEVEL_HEADER.toLowerCase()]: '1',
      };

      const context = propagator.extract(
        ROOT_CONTEXT,
        carrier,
        defaultTextMapGetter
      );

      const extractedSpanContext = trace.getSpan(context)?.spanContext();
      assert.deepStrictEqual(undefined, extractedSpanContext);
    });
  });

  describe('.fields', () => {
    it('provides all fields', () => {
      assert.deepStrictEqual(
        [INSTANA_TRACE_ID_HEADER, INSTANA_SPAN_ID_HEADER, INSTANA_LEVEL_HEADER],
        propagator.fields()
      );
    });
  });
});
