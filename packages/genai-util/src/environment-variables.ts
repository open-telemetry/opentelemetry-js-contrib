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
 * Environment variable specifying custom completion hook module.
 */
export const ENV_GENAI_COMPLETION_HOOK =
  'OTEL_INSTRUMENTATION_GENAI_COMPLETION_HOOK' as const;

/**
 * Parse an arbitrary input value into a valid ContentCaptureMode.
 *
 * @experimental This function is experimental and subject to change.
 */
export function parseContentCaptureMode(
  value?: string | boolean | ContentCaptureMode
): ContentCaptureMode {
  if (value === undefined || value === null) {
    return 'none';
  }

  if (typeof value === 'boolean') {
    return value ? 'span_only' : 'none';
  }

  const strVal = String(value).trim().toLowerCase();
  switch (strVal) {
    case 'true':
    case '1':
    case 'span_only':
    case 'span':
      return 'span_only';
    case 'false':
    case '0':
    case 'none':
    case 'no_content':
    case '':
    default:
      return 'none';
  }
}

/**
 * Resolve effective ContentCaptureMode based on explicit config and environment variable.
 *
 * @experimental This function is experimental and subject to change.
 */
export function getContentCaptureMode(
  configVal?: boolean | ContentCaptureMode,
  envVarName: string = ENV_GENAI_CAPTURE_MESSAGE_CONTENT
): ContentCaptureMode {
  const envVal = process.env[envVarName];
  if (envVal !== undefined && envVal !== '') {
    return parseContentCaptureMode(envVal);
  }
  return parseContentCaptureMode(configVal);
}

/**
 * Returns true if content should be attached to span attributes.
 *
 * @experimental This function is experimental and subject to change.
 */
export function isSpanContentCaptureEnabled(mode: ContentCaptureMode): boolean {
  return mode === 'span_only';
}

/**
 * Returns true if content should be emitted via log events.
 *
 * NOTE: Currently returns false until the OpenTelemetry JS Logs & Events SDK stabilizes.
 *
 * @experimental This function is experimental and subject to change.
 */
export function isEventContentCaptureEnabled(
  _mode: ContentCaptureMode
): boolean {
  return false;
}
