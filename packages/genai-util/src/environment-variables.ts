/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag, type DiagLogger } from '@opentelemetry/api';
import { getStringFromEnv } from '@opentelemetry/core';
import type { ContentCaptureMode } from './types';

/**
 * Environment variable controlling capture of message content (prompt/completion).
 *
 * Accepted values (case-insensitive):
 * - `'span_only'`, `'span'`, `'span_and_event'`, `'true'` → `'span_only'`
 * - `'none'`, `'no_content'`, `'false'`, `''` (or any other value) → `'none'`
 */
export const ENV_GENAI_CAPTURE_MESSAGE_CONTENT =
  'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT' as const;

/**
 * Parse an arbitrary input value into a valid ContentCaptureMode.
 *
 * Maps `'span_only'`, `'span'`, `'span_and_event'`, and `'true'` (case-insensitive)
 * to `'span_only'`, and `'none'`, `'no_content'`, `'false'`, or any other value to `'none'`.
 * Logs a warning via `diagLogger` when a value is downgraded (`'span_and_event'`, `'event_only'`)
 * or unrecognized.
 *
 * @experimental This function is experimental and subject to change.
 */
export function parseContentCaptureMode(
  value: string | undefined | null,
  diagLogger: DiagLogger = diag
): ContentCaptureMode {
  if (value === undefined || value === null) {
    return 'none';
  }

  const strVal = String(value).trim().toLowerCase();
  switch (strVal) {
    case 'span_only':
    case 'span':
    case 'true':
      return 'span_only';
    case 'span_and_event':
      diagLogger.warn(
        "Content capture mode 'span_and_event' is not fully supported yet; downgrading to 'span_only' (events are not emitted)"
      );
      return 'span_only';
    case 'none':
    case 'no_content':
    case 'false':
    case '':
      return 'none';
    case 'event_only':
      diagLogger.warn(
        "Content capture mode 'event_only' is not supported yet; falling back to 'none'"
      );
      return 'none';
    default:
      diagLogger.warn(
        `Unrecognized content capture mode '${value}'; falling back to 'none'`
      );
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
  envVarName: string = ENV_GENAI_CAPTURE_MESSAGE_CONTENT,
  diagLogger: DiagLogger = diag
): ContentCaptureMode {
  const envVal = getStringFromEnv(envVarName);
  if (envVal !== undefined) {
    return parseContentCaptureMode(envVal, diagLogger);
  }
  return parseContentCaptureMode(configVal, diagLogger);
}
