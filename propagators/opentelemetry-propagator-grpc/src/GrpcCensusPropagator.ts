/*!
 * Copyright 2020, OpenTelemetry Authors
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
  GetterFunction,
  HttpTextPropagator,
  SetterFunction,
} from '@opentelemetry/api';
import {
  getParentSpanContext,
  setExtractedSpanContext,
} from '@opentelemetry/core';
import { BinaryTraceContext } from './BinaryTraceContext';

/** The metadata key under which span context is stored as a binary value. */
export const GRPC_TRACE_KEY = 'grpc-trace-bin';

const VALID_TRACEID_REGEX = /^[0-9a-f]{32}$/i;
const VALID_SPANID_REGEX = /^[0-9a-f]{16}$/i;
const INVALID_ID_REGEX = /^0+$/i;

function isValidTraceId(traceId: string): boolean {
  return VALID_TRACEID_REGEX.test(traceId) && !INVALID_ID_REGEX.test(traceId);
}

function isValidSpanId(spanId: string): boolean {
  return VALID_SPANID_REGEX.test(spanId) && !INVALID_ID_REGEX.test(spanId);
}

/**
 * Propagator for the grpc-trace-bin header in gRPC
 * Inspired by: https://github.com/census-instrumentation/opencensus-node/tree/master/packages/opencensus-propagation-binaryformat/src
 */
export class GrpcCensusPropagator implements HttpTextPropagator {
  inject(context: Context, carrier: unknown, setter: SetterFunction) {
    const spanContext = getParentSpanContext(context);
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
          setter(carrier, GRPC_TRACE_KEY, encodedContext);
        }
      }
    }
  }

  extract(context: Context, carrier: unknown, getter: GetterFunction): Context {
    if (carrier) {
      // Get the gRPC header (carrier will be of type grpc.Metadata and
      // getter actually returns an Array so we use the zero-th element if
      // it exists)
      const values = getter(carrier, GRPC_TRACE_KEY) as Array<Buffer>;
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
            return setExtractedSpanContext(context, {
              traceId,
              spanId,
              isRemote: true,
              traceFlags: decodedContext.traceFlags,
            });
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
}
