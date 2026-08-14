/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api';
import type { DiagLogger } from '@opentelemetry/api';
import type { ContentCaptureMode } from './types';

/**
 * Environment variable controlling capture of message content (prompt/completion).
 */
export const ENV_GENAI_CAPTURE_MESSAGE_CONTENT =
  'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT' as const;

/**
 * Environment variable controlling whether to emit detailed events.
 */
export const ENV_GENAI_EMIT_EVENT =
  'OTEL_INSTRUMENTATION_GENAI_EMIT_EVENT' as const;

/**
 * Environment variable specifying custom completion hook module.
 */
export const ENV_GENAI_COMPLETION_HOOK =
  'OTEL_INSTRUMENTATION_GENAI_COMPLETION_HOOK' as const;

/**
 * Read and parse a boolean value from an environment variable.
 */
export function getEnvBool(
  name: string,
  diag_: DiagLogger = diag
): boolean | undefined {
  const val = process.env[name];
  if (val === undefined || val === '') {
    return undefined;
  }
  if (typeof val !== 'string') {
    throw new Error(
      `invalid type for environment variable: ${typeof val} (${name}=${val})`
    );
  }
  const valLower = val.trim().toLowerCase();
  if (valLower === 'true' || valLower === '1') {
    return true;
  }
  if (valLower === 'false' || valLower === '0') {
    return false;
  }
  diag_.warn(
    `invalid boolean value for environment variable: ${name}=${val}; ignoring`
  );
  return undefined;
}

/**
 * Parse an arbitrary input value into a valid ContentCaptureMode.
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
    case 'event_only':
    case 'event':
      return 'event_only';
    case 'span_and_event':
    case 'all':
    case 'both':
      return 'span_and_event';
    case 'false':
    case '0':
    case 'none':
    case 'no_content':
    case '':
      return 'none';
    default:
      return 'none';
  }
}

/**
 * Resolve effective ContentCaptureMode based on explicit config and environment variable.
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
 * Returns true if message content capturing is enabled in any mode.
 */
export function isCaptureMessageContentEnabled(
  mode: ContentCaptureMode
): boolean {
  return mode !== 'none';
}

/**
 * Returns true if content should be attached to span attributes.
 */
export function isSpanContentCaptureEnabled(mode: ContentCaptureMode): boolean {
  return mode === 'span_only' || mode === 'span_and_event';
}

/**
 * Returns true if content should be emitted via span events / logs.
 */
export function isEventContentCaptureEnabled(
  mode: ContentCaptureMode
): boolean {
  return mode === 'event_only' || mode === 'span_and_event';
}
