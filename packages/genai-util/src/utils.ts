/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Functions declared in this file are only meant to be used within the genai-util package.
 */
import { diag } from '@opentelemetry/api';
import type { Attributes, DiagLogger } from '@opentelemetry/api';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_REQUEST_CHOICE_COUNT,
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_REASONING_LEVEL,
  ATTR_GEN_AI_REQUEST_SEED,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
} from './semconv';
import type {
  GenAIRequestOptions,
  InputMessages,
  SystemInstructions,
} from './types';

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

  // Handle types we know JSON.stringify drops (returns undefined for)
  if (typeof content === 'function' || typeof content === 'symbol') {
    return String(content);
  }

  try {
    const jsonResult = JSON.stringify(content);
    if (jsonResult !== undefined) {
      return jsonResult;
    }
  } catch {
    // Ignored, fall through to fallback below (e.g., circular references, BigInt)
  }

  // Fallback for circular references, BigInts, or custom undefined toJSON()
  try {
    return String(content);
  } catch {
    return '[Unserializable Content]';
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength
    ).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Format input messages into a JSON string for span attribute storage.
 *
 * @param messages - Input messages payload to format.
 * @returns JSON string representation of input messages, or `undefined` if empty/invalid.
 */
export function formatInputMessages(
  messages?: InputMessages
): string | undefined {
  if (!messages) {
    return undefined;
  }
  try {
    return JSON.stringify(messages, (_key, value) => {
      if (value instanceof Uint8Array) {
        return uint8ArrayToBase64(value);
      }
      return value;
    });
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
    return JSON.stringify(messages, (_key, value) => {
      if (value instanceof Uint8Array) {
        return uint8ArrayToBase64(value);
      }
      return value;
    });
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
  instructions?: SystemInstructions | string
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
 * Extract a standard `error.type` attribute value from an error or exception
 * following OpenTelemetry GenAI semantic conventions.
 *
 * Resolution order:
 * 1. Error `code` if present and non-empty (e.g., `'ECONNREFUSED'`, `404`, `'429'`)
 * 2. Explicit `error.name` if set and not the default `'Error'` (e.g., `'RateLimitError'`)
 * 3. Class / constructor name for subclasses (e.g., `class CustomAPIError extends Error`)
 * 4. Fallback `'_OTHER'`
 *
 * @param error - The caught error, exception, or value.
 * @returns The standardized error type string.
 */
export function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    if (
      'code' in error &&
      error.code != null &&
      String(error.code).trim().length > 0
    ) {
      return String(error.code);
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
  return '_OTHER';
}

/**
 * Extract OpenTelemetry span attributes from GenAI request options.
 *
 * @param requestOptions - Optional GenAI request options to extract attributes from.
 * @returns Attributes object populated with GenAI request semantic conventions.
 */
export function getRequestOptionsAttributes(
  requestOptions?: GenAIRequestOptions
): Attributes {
  const attrs: Attributes = {};
  if (!requestOptions) {
    return attrs;
  }

  if (requestOptions.temperature !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_TEMPERATURE] = requestOptions.temperature;
  }
  if (requestOptions.topP !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_TOP_P] = requestOptions.topP;
  }
  if (requestOptions.topK !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_TOP_K] = requestOptions.topK;
  }
  if (requestOptions.maxTokens !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = requestOptions.maxTokens;
  }
  if (requestOptions.stopSequences && requestOptions.stopSequences.length > 0) {
    attrs[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = requestOptions.stopSequences;
  }
  if (requestOptions.frequencyPenalty !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY] =
      requestOptions.frequencyPenalty;
  }
  if (requestOptions.presencePenalty !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY] =
      requestOptions.presencePenalty;
  }
  if (requestOptions.choiceCount !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_CHOICE_COUNT] = requestOptions.choiceCount;
  }
  if (requestOptions.seed !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_SEED] = requestOptions.seed;
  }
  if (
    requestOptions.encodingFormats &&
    requestOptions.encodingFormats.length > 0
  ) {
    attrs[ATTR_GEN_AI_REQUEST_ENCODING_FORMATS] =
      requestOptions.encodingFormats;
  }
  if (requestOptions.stream !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_STREAM] = requestOptions.stream;
  }
  if (requestOptions.reasoningLevel !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_REASONING_LEVEL] = requestOptions.reasoningLevel;
  }

  return attrs;
}
