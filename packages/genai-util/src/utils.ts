/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Functions declared in this file are only meant to be used within the genai-util package.
 */
import { diag } from '@opentelemetry/api';
import type {
  Attributes,
  DiagLogger,
  HrTime,
  TimeInput,
} from '@opentelemetry/api';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { hrTime, timeInputToHrTime } from '@opentelemetry/core';
import { GEN_AI_OPERATION_NAME_VALUE_CHAT } from './semconv';
import type { InputMessages } from './types';

const SERVER_PORT_FROM_URL_PROTOCOL: Record<string, number> = {
  'https:': 443,
  'http:': 80,
};

/**
 * Extract `server.address` and `server.port` attributes from a client baseURL.
 *
 * @param baseURL - Base URL of the API client (e.g. `'https://api.openai.com/v1'`).
 * @param diag_ - Optional diagnostic logger for debug logging.
 * @returns Attributes object containing `server.address` and `server.port`, or `undefined` if baseURL is not provided or invalid.
 */
export function getAttrsFromBaseURL(
  baseURL: string | undefined,
  diag_: DiagLogger = diag
): Attributes | undefined {
  if (!baseURL) {
    return undefined;
  }

  let u: URL;
  try {
    u = new URL(baseURL);
  } catch (ex) {
    diag_.debug(
      `could not determine server.address/server.port from baseURL: ${ex}`
    );
    return undefined;
  }

  const port = u.port
    ? Number(u.port)
    : SERVER_PORT_FROM_URL_PROTOCOL[u.protocol];

  const attrs: Attributes = {
    [ATTR_SERVER_ADDRESS]: u.hostname,
  };

  if (typeof port === 'number' && !isNaN(port)) {
    attrs[ATTR_SERVER_PORT] = port;
  }

  return attrs;
}

/**
 * Serialize arbitrary data to a JSON string or string representation safely.
 *
 * @param content - Content to serialize (object, primitive, or nullish).
 * @returns JSON string for objects, empty string for null/undefined, or plain string.
 */
export function serializeContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (content === null || content === undefined) {
    return '';
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

/**
 * Format input messages into a JSON string for span attribute storage.
 *
 * @param messages - Input messages payload to format.
 * @returns JSON string representation of input messages, or `undefined` if empty/invalid.
 */
export function formatInputMessages(
  messages?: InputMessages | string
): string | undefined {
  if (!messages) {
    return undefined;
  }
  if (typeof messages === 'string') {
    return messages;
  }
  try {
    return JSON.stringify(messages);
  } catch {
    return undefined;
  }
}

/**
 * Format output messages into a JSON string for span attribute storage.
 *
 * @param messages - Output messages payload to format.
 * @returns JSON string representation of output messages, or `undefined` if empty/invalid.
 */
export function formatOutputMessages(messages: unknown): string | undefined {
  if (!messages) {
    return undefined;
  }
  if (typeof messages === 'string') {
    return messages;
  }
  try {
    return JSON.stringify(messages);
  } catch {
    return undefined;
  }
}

/**
 * Format system instructions into a JSON string or plain string.
 *
 * @param instructions - System instructions payload to format.
 * @returns JSON or plain string representation of system instructions, or `undefined` if empty/invalid.
 */
export function formatSystemInstructions(
  instructions: unknown
): string | undefined {
  if (!instructions) {
    return undefined;
  }
  if (typeof instructions === 'string') {
    return instructions;
  }
  try {
    return JSON.stringify(instructions);
  } catch {
    return undefined;
  }
}

/**
 * Convert an OpenTelemetry HrTime tuple ([seconds, nanoseconds]) to floating seconds.
 *
 * @param hrTime - OpenTelemetry high-resolution time tuple `[seconds, nanoseconds]`.
 * @returns Time duration in fractional seconds.
 */
export function hrTimeToSeconds(hrTime: HrTime): number {
  return hrTime[0] + hrTime[1] / 1e9;
}

/**
 * Calculate duration in seconds between startTime and endTime.
 * Accepts any OpenTelemetry TimeInput (HrTime tuple, millisecond epoch timestamp, or Date).
 *
 * @param startTime - Start timestamp as `HrTime`, millisecond timestamp, or `Date`.
 * @param endTime - Optional end timestamp as `HrTime`, millisecond timestamp, or `Date` (defaults to current time).
 * @returns Non-negative duration in fractional seconds.
 */
export function calculateDurationSeconds(
  startTime: TimeInput,
  endTime?: TimeInput
): number {
  const startHr = timeInputToHrTime(startTime);
  const endHr = endTime != null ? timeInputToHrTime(endTime) : hrTime();
  const startSec = hrTimeToSeconds(startHr);
  const endSec = hrTimeToSeconds(endHr);
  return Math.max(0, endSec - startSec);
}

/**
 * Construct standardized span name following GenAI semantic conventions.
 * E.g. "chat gpt-4o", "embeddings text-embedding-3-small", "generate_content gemini-1.5-pro".
 *
 * @param operationName - GenAI operation name (e.g. `'chat'`, `'embeddings'`).
 * @param model - Optional model name or identifier.
 * @returns Standardized span name in the format `"{operation} {model}"` or `"{operation}"`.
 */
export function getSpanName(operationName: string, model?: string): string {
  const op = operationName || GEN_AI_OPERATION_NAME_VALUE_CHAT;
  return model ? `${op} ${model}` : op;
}

/**
 * Extract a standard `error.type` attribute value from an error or exception
 * following OpenTelemetry GenAI semantic conventions.
 *
 * Resolution order:
 * 1. Error `code` if present and non-empty (e.g., `'ECONNREFUSED'`, `404`, `'429'`)
 * 2. Explicit `error.name` if set and not the default `'Error'` (e.g., `'RateLimitError'`)
 * 3. Class / constructor name for subclasses (e.g., `class CustomAPIError extends Error`)
 * 4. Non-empty string if `error` is a string
 * 5. Fallback `'Error'`
 *
 * @param error - The caught error, exception, or value.
 * @returns The standardized error type string.
 */
export function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: string | number }).code;
    if (code !== undefined && code !== null && String(code).trim().length > 0) {
      return String(code);
    }
    if (error.name && error.name !== 'Error') {
      return error.name;
    }
    const constructorName = error.constructor?.name;
    if (
      constructorName &&
      constructorName !== 'Error' &&
      constructorName !== 'Object'
    ) {
      return constructorName;
    }
    return error.name || 'Error';
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return 'Error';
}
