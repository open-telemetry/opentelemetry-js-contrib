/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { INVALID_SPANID } from '@opentelemetry/api';

export const TRACE_ID_BYTES = 16;

const SPAN_ID_BYTES = 8;
const EPOCH_BYTES = 4;

const FALLBACK_SPANID = '0000000000000001';

type RandomBytesGenerator = (numBytes: number) => string;

export function generateTraceId(
  generateRandomBytes: RandomBytesGenerator
): string {
  const epoch = Math.floor(Date.now() / 1000).toString(16);
  const rand = generateRandomBytes(TRACE_ID_BYTES - EPOCH_BYTES);
  // Starts with epoch so guaranteed to be valid.
  return epoch + rand;
}

export function generateSpanId(
  generateRandomBytes: RandomBytesGenerator
): string {
  const spanId = generateRandomBytes(SPAN_ID_BYTES);
  if (spanId === INVALID_SPANID) {
    // Random was all zero. Very low chance, but in case it happens return a non-0 span ID to ensure it is valid.
    return FALLBACK_SPANID;
  }
  return spanId;
}
