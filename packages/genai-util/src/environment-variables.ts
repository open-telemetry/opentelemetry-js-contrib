/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentCaptureMode } from './types';

/**
 * Environment variable controlling capture of message content (prompt/completion).
 */
export const ENV_GENAI_CAPTURE_MESSAGE_CONTENT =
  'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT' as const;

/**
 * Parse an arbitrary input value into a valid ContentCaptureMode.
 *
 * @experimental This function is experimental and subject to change.
 */
export function parseContentCaptureMode(
  value: string | undefined | null
): ContentCaptureMode {
  if (value === undefined || value === null) {
    return 'none';
  }

  const strVal = String(value).trim().toLowerCase();
  switch (strVal) {
    case 'span_only':
    case 'span':
      return 'span_only';
    case 'none':
    case 'no_content':
    case '':
    default:
      return 'none';
  }
}

/**
 * Returns true if content should be attached to span attributes.
 *
 * @experimental This function is experimental and subject to change.
 */
export function isSpanContentCaptureEnabled(mode: ContentCaptureMode): boolean {
  return mode === 'span_only';
}
