/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api';
import type { Attributes, DiagLogger, HrTime } from '@opentelemetry/api';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { hrTimeToMilliseconds } from '@opentelemetry/core';

const SERVER_PORT_FROM_URL_PROTOCOL: Record<string, number> = {
  'https:': 443,
  'http:': 80,
};

/**
 * Extract `server.address` and `server.port` attributes from a client baseURL.
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
 */
export function formatInputMessages(messages: unknown): string | undefined {
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
 */
export function hrTimeToSeconds(hrTime: HrTime): number {
  return hrTime[0] + hrTime[1] / 1e9;
}

/**
 * Calculate duration in seconds between startTime and endTime.
 * Accepts either HrTime tuple ([seconds, nanoseconds]) or millisecond epoch timestamp.
 */
export function calculateDurationSeconds(
  startTime: HrTime | number,
  endTime?: HrTime | number
): number {
  if (Array.isArray(startTime)) {
    const endHr = Array.isArray(endTime) ? endTime : process.hrtime();
    const startSec = hrTimeToSeconds(startTime);
    const endSec = hrTimeToSeconds(endHr);
    return Math.max(0, endSec - startSec);
  }

  const endMs =
    typeof endTime === 'number'
      ? endTime
      : Array.isArray(endTime)
        ? hrTimeToMilliseconds(endTime)
        : Date.now();

  return Math.max(0, (endMs - startTime) / 1000);
}

/**
 * Construct standardized span name following GenAI semantic conventions.
 * E.g. "chat gpt-4o", "embeddings text-embedding-3-small", "generate_content gemini-1.5-pro".
 */
export function getSpanName(operationName: string, model?: string): string {
  const op = operationName || 'chat';
  return model ? `${op} ${model}` : op;
}
