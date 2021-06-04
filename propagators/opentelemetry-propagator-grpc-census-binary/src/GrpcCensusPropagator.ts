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
  TextMapGetter,
  TextMapSetter,
  TextMapPropagator,
} from '@opentelemetry/api';
import { BinaryTraceContext } from './BinaryTraceContext';

/** The metadata key under which span context is stored as a binary value. */
export const GRPC_TRACE_KEY = 'grpc-trace-bin';

const VALID_TRACEID_REGEX = /^[0-9a-f]{32}$/i;
const VALID_SPANID_REGEX = /^[0-9a-f]{16}$/i;
const INVALID_ID_REGEX = /^0+$/i;

/**
 * Check whether a traceId is valid
 * @param traceId - traceId to check
 * @returns true if valid
 */
function isValidTraceId(traceId: string): boolean {
  return VALID_TRACEID_REGEX.test(traceId) && !INVALID_ID_REGEX.test(traceId);
}

/**
 * Check whether a spanId is valid
 * @param spanId - spanId to check
 * @returns true if valid
 */
function isValidSpanId(spanId: string): boolean {
  return VALID_SPANID_REGEX.test(spanId) && !INVALID_ID_REGEX.test(spanId);
}

/**
 * Propagator for the grpc-trace-bin header used by OpenCensus for
 * gRPC. Acts as a bridge between the TextMapPropagator interface and
 * the binary encoding/decoding that happens in the supporting
 * BinaryTraceContext class.
 */
export class GrpcCensusPropagator implements TextMapPropagator {
  /**
   * Injects trace propagation context into the carrier after encoding
   * in binary format
   *
   * @param context - Context to be injected
   * @param carrier - Carrier in which to inject (for gRPC this will
   *     be a grpc.Metadata object)
   * @param setter - setter function that sets the correct key in
   *     the carrier
   */
  inject(context: Context, carrier: unknown, setter: TextMapSetter) {
    const spanContext = trace.getSpan(context)?.spanContext();
    if (!spanContext) return;

    if (
      isValidTraceId(spanContext.traceId) &&
      isValidSpanId(spanContext.spanId)
    ) {
      // We set the header only if there is an existing sampling decision.
      // Otherwise we will omit it => Absent.
      if (spanContext.traceFlags !== undefined) {
        const encodedArray = BinaryTraceContext.toBytes(spanContext);
        const encodedContext = Buffer.from(encodedArray.buffer);

        if (carrier && encodedContext) {
          // Set the gRPC header (carrier will be of type grpc.Metadata)
          // @TODO FIX ME once this is resolved
          // https://github.com/open-telemetry/opentelemetry-specification/issues/437
          setter.set(carrier, GRPC_TRACE_KEY, encodedContext as any);
          // setter.set(carrier, GRPC_TRACE_KEY, encodedContext);
        }
      }
    }
  }

  /**
   * Extracts trace propagation context from the carrier and decodes
   * from the binary format
   *
   * @param context - context to set extracted span context on
   * @param carrier - Carrier from which to extract (for gRPC this will
   *     be a grpc.Metadata object)
   * @param getter - getter function that gets value(s) for the correct
   *     key in the carrier
   * @returns Extracted context if successful, otherwise the input context
   */
  extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    if (carrier) {
      // Get the gRPC header (carrier will be of type grpc.Metadata and
      // getter actually returns an Array so we use the zero-th element if
      // it exists)

      // @TODO FIX ME once this is resolved
      // https://github.com/open-telemetry/opentelemetry-specification/issues/437
      const values = getter.get(
        carrier,
        GRPC_TRACE_KEY
      ) as unknown as Array<Buffer>;
      // const values = getter.get(carrier, GRPC_TRACE_KEY) as Array<Buffer>;
      const metadataValue = values.length > 0 ? values[0] : null;

      if (!metadataValue) {
        // No metadata, return empty context
        return context;
      } else {
        const decodedContext = BinaryTraceContext.fromBytes(metadataValue);

        if (decodedContext) {
          const traceId = decodedContext.traceId;
          const spanId = decodedContext.spanId;

          if (isValidTraceId(traceId) && isValidSpanId(spanId)) {
            return trace.setSpan(
              context,
              trace.wrapSpanContext({
                traceId,
                spanId,
                isRemote: true,
                traceFlags: decodedContext.traceFlags,
              })
            );
          }
          return context;
        } else {
          // Failed to deserialize Span Context, return empty context
          return context;
        }
      }
    }

    return context;
  }

  fields(): string[] {
    return [GRPC_TRACE_KEY];
  }
}
