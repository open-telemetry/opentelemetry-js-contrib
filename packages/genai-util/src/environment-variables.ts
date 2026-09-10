/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getStringFromEnv } from '@opentelemetry/core';
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
 * Resolve effective ContentCaptureMode based on explicit config and environment variable.
 *
 * The environment variable takes precedence over the explicit configuration value if set.
 * If the environment variable is unset, empty, or contains only whitespace, `configVal` is used.
 * Defaults to `'none'` if neither provides a valid capture mode.
 *
 * @experimental This function is experimental and subject to change.
 */
export function getContentCaptureMode(
  configVal?: ContentCaptureMode,
  envVarName: string = ENV_GENAI_CAPTURE_MESSAGE_CONTENT
): ContentCaptureMode {
  const envVal = getStringFromEnv(envVarName);
  if (envVal !== undefined) {
    return parseContentCaptureMode(envVal);
  }
  return parseContentCaptureMode(configVal);
}
