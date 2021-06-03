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
  ROOT_CONTEXT,
  SpanContext,
  TextMapGetter,
  TextMapSetter,
  TraceFlags,
  trace,
} from '@opentelemetry/api';
import * as assert from 'assert';
import { Metadata, MetadataValue } from 'grpc';
import {
  GrpcCensusPropagator,
  GRPC_TRACE_KEY,
} from '../src/GrpcCensusPropagator';

describe('GrpcCensusPropagator', () => {
  const censusPropagator = new GrpcCensusPropagator();
  const metadata = new Metadata();

  beforeEach(() => {
    metadata.remove(GRPC_TRACE_KEY);
  });

  describe('.inject()', () => {
    it('should set grpc-trace-bin header correctly for sampled span', () => {
      const spanContext: SpanContext = {
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
      };
      censusPropagator.inject(
        trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(spanContext)),
        metadata,
        makeSetter((metadata: any, k: any, v: any) =>
          metadata.set(k, v as MetadataValue)
        )
      );

      const value = metadata.getMap()[GRPC_TRACE_KEY] as Buffer;

      const binaryExpected = `0000${spanContext.traceId}01${
        spanContext.spanId
      }02${'01'}`;

      assert.deepStrictEqual(value.toString('hex'), binaryExpected);
    });

    it('should set grpc-trace-bin header correctly for unsampled span', () => {
      const spanContext: SpanContext = {
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.NONE,
      };
      censusPropagator.inject(
        trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(spanContext)),
        metadata,
        makeSetter((metadata: any, k: any, v: any) =>
          metadata.set(k, v as MetadataValue)
        )
      );

      const value = metadata.getMap()[GRPC_TRACE_KEY] as Buffer;

      const binaryExpected = `0000${spanContext.traceId}01${
        spanContext.spanId
      }02${'00'}`;

      assert.deepStrictEqual(value.toString('hex'), binaryExpected);
    });

    it('should not inject empty spancontext', () => {
      const emptySpanContext = {
        traceId: '',
        spanId: '',
        traceFlags: TraceFlags.NONE,
      };
      censusPropagator.inject(
        trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(emptySpanContext)),
        metadata,
        makeSetter((metadata: any, k: any, v: any) =>
          metadata.set(k, v as MetadataValue)
        )
      );

      const value = metadata.getMap()[GRPC_TRACE_KEY] as Buffer;
      assert.deepStrictEqual(value, undefined);
    });

    it('should not inject when context has no parent', () => {
      censusPropagator.inject(
        ROOT_CONTEXT,
        metadata,
        makeSetter((metadata: any, k: any, v: any) =>
          metadata.set(k, v as MetadataValue)
        )
      );

      const value = metadata.getMap()[GRPC_TRACE_KEY] as Buffer;
      assert.deepStrictEqual(value, undefined);
    });

    it('should not try to inject without valid TraceFlags', () => {
      const spanContext = {
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: undefined,
      };
      censusPropagator.inject(
        // cast to any so that undefined traceFlags can be used for coverage
        trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(spanContext as any)),
        metadata,
        makeSetter((metadata: any, k: any, v: any) =>
          metadata.set(k, v as MetadataValue)
        )
      );

      const value = metadata.getMap()[GRPC_TRACE_KEY] as Buffer;
      assert.deepStrictEqual(value, undefined);
    });

    it('should not try to inject without carrier', () => {
      const emptySpanContext = {
        traceId: 'd4cda95b652f4a1592b449d5929fda1b',
        spanId: '6e0c63257de34c92',
        traceFlags: TraceFlags.SAMPLED,
      };
      censusPropagator.inject(
        trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(emptySpanContext)),
        null,
        makeSetter((metadata: any, k: any, v: any) =>
          metadata.set(k, v as MetadataValue)
        )
      );

      const value = metadata.getMap()[GRPC_TRACE_KEY] as Buffer;
      assert.deepStrictEqual(value, undefined);
    });
  });

  describe('.extract()', () => {
    it('should extract context of a unsampled span from carrier', () => {
      const encodedArray = getUnsampledSpanEncodedArray();
      const encoded = Buffer.from(encodedArray.buffer);
      metadata.set(GRPC_TRACE_KEY, encoded);

      const extractedSpanContext = trace
        .getSpan(censusPropagator.extract(ROOT_CONTEXT, metadata, makeGetter()))
        ?.spanContext();

      assert.deepStrictEqual(extractedSpanContext, {
        spanId: '75e8ed491aec7eca',
        traceId: 'd4cda95b652f4a0b92b449d5929fda1b',
        isRemote: true,
        traceFlags: TraceFlags.NONE,
      });
    });

    it('should extract context of a sampled span from carrier', () => {
      const encodedArray = getUnsampledSpanEncodedArray();

      // switch last byte to sampled
      encodedArray[encodedArray.length - 1] = 1;
      const encoded = Buffer.from(encodedArray.buffer);
      metadata.set(GRPC_TRACE_KEY, encoded);

      const extractedSpanContext = trace
        .getSpan(censusPropagator.extract(ROOT_CONTEXT, metadata, makeGetter()))
        ?.spanContext();

      assert.deepStrictEqual(extractedSpanContext, {
        spanId: '75e8ed491aec7eca',
        traceId: 'd4cda95b652f4a0b92b449d5929fda1b',
        isRemote: true,
        traceFlags: TraceFlags.SAMPLED,
      });
    });

    it('should return undefined when header is not set', () => {
      const extractedSpanContext = trace
        .getSpan(censusPropagator.extract(ROOT_CONTEXT, metadata, makeGetter()))
        ?.spanContext();
      assert.deepStrictEqual(extractedSpanContext, undefined);
    });

    it('should return undefined for invalid field IDs', () => {
      // zero out all 29 bytes - this will fail due to lack of valid
      // field IDs for spanId and options (bytes 18 and 27)
      const encodedArray = new Uint8Array(29);

      const encoded = Buffer.from(encodedArray.buffer);
      metadata.set(GRPC_TRACE_KEY, encoded);

      const extractedSpanContext = trace
        .getSpan(censusPropagator.extract(ROOT_CONTEXT, metadata, makeGetter()))
        ?.spanContext();

      assert.deepStrictEqual(extractedSpanContext, undefined);
    });

    it('should return undefined for invalid trace or span ids', () => {
      // this should give coverage for the flow where either
      // isValidTraceId or isValidSpanId fails

      // zero out all 29 bytes except for the spanId field ID and
      // the options field IF
      const encodedArray = new Uint8Array(29);
      encodedArray[18] = 1;
      encodedArray[27] = 2;

      const encoded = Buffer.from(encodedArray.buffer);
      metadata.set(GRPC_TRACE_KEY, encoded);

      const extractedSpanContext = trace
        .getSpan(censusPropagator.extract(ROOT_CONTEXT, metadata, makeGetter()))
        ?.spanContext();

      assert.deepStrictEqual(extractedSpanContext, undefined);
    });

    it('should return undefined when carrier is null', () => {
      const extractedSpanContext = trace
        .getSpan(censusPropagator.extract(ROOT_CONTEXT, metadata, makeGetter()))
        ?.spanContext();
      assert.deepStrictEqual(extractedSpanContext, undefined);
    });
  });

  describe('fields', () => {
    it('should return valid values', () => {
      assert.deepStrictEqual(censusPropagator.fields(), ['grpc-trace-bin']);
    });
  });
});

function getUnsampledSpanEncodedArray() {
  return new Uint8Array([
    0, 0, 212, 205, 169, 91, 101, 47, 74, 11, 146, 180, 73, 213, 146, 159, 218,
    27, 1, 117, 232, 237, 73, 26, 236, 126, 202, 2, 0,
  ]);
}

function makeSetter(callback: (metadata: any, k: any, v: any) => void) {
  const setter: TextMapSetter = {
    set(carrier, key, value) {
      callback(carrier, key, value);
    },
  };
  return setter;
}

function makeGetter() {
  const getter: TextMapGetter = {
    get(carrier, key) {
      if (carrier) {
        return carrier.get(key);
      }
    },
    keys(carrier) {
      if (carrier == null) {
        return [];
      }
      return Object.keys(carrier);
    },
  };
  return getter;
}
