/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Functions declared in this file are only meant to be used within the genai-util package.
 */
import type { Attributes } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_REQUEST_CHOICE_COUNT,
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
  InferenceRequestOptions,
  InputMessages,
  OutputMessages,
  SystemInstructionPart,
  SystemInstructions,
  TokenCountsByModality,
  TokenModality,
  TokenUsageByModality,
  TokenUsageDetails,
} from './types';

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
  if (content == null) {
    return '';
  }

  // Functions should not be serialized as they can be very large.
  if (typeof content === 'function') {
    return '[Unserializable Content]';
  }

  try {
    const jsonResult = JSON.stringify(content);
    if (jsonResult !== undefined) {
      return jsonResult;
    }
  } catch {
    // Ignored, fall through to fallback below (e.g., circular references, BigInt)
  }

  // Fallback for circular references, BigInts, Symbols, or custom undefined toJSON()
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
 * JSON.stringify replacer function for message serialization.
 *
 * Ensures binary content (Uint8Array and Node.js Buffer instances) is serialized
 * as base64-encoded strings per OpenTelemetry GenAI semantic conventions.
 * Reads `this[key]` to intercept raw `Buffer` instances before Node.js's built-in
 * `Buffer.prototype.toJSON()` converts them into plain objects.
 *
 * @param this - The parent object/array holding the property currently being serialized.
 * @param key - The property key or array index being stringified.
 * @param value - The value after any `toJSON()` conversion, or raw value.
 * @returns The base64 string for binary data, or the original/transformed value.
 */
function serializeMessageReplacer(
  this: Record<string, unknown>,
  key: string,
  value: unknown
): unknown {
  const rawValue = this[key];

  if (rawValue instanceof Uint8Array) {
    return uint8ArrayToBase64(rawValue);
  }

  return value;
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
  if (!messages || messages.length === 0) {
    return undefined;
  }
  try {
    return JSON.stringify(messages, serializeMessageReplacer);
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
export function formatOutputMessages(
  messages?: OutputMessages
): string | undefined {
  if (!messages || messages.length === 0) {
    return undefined;
  }
  try {
    return JSON.stringify(messages, serializeMessageReplacer);
  } catch {
    return undefined;
  }
}

/**
 * Type guard checking if a candidate object conforms to SystemInstructionPart.
 */
function isSystemInstructionPart(part: unknown): part is SystemInstructionPart {
  if (typeof part !== 'object' || part === null || Array.isArray(part)) {
    return false;
  }
  if (
    !('type' in part) ||
    typeof part.type !== 'string' ||
    part.type.trim().length === 0
  ) {
    return false;
  }
  if (
    part.type === 'text' &&
    (!('content' in part) || typeof part.content !== 'string')
  ) {
    return false;
  }
  return true;
}

/**
 * Normalizes system instructions into a standard SystemInstructions array.
 *
 * Handles:
 * - Plain string instructions: wrapped in a single TextPart.
 * - Serialized JSON string of SystemInstructions parts: validated and preserved.
 * - SystemInstructions array: passed through if non-empty.
 * - Empty strings, whitespace, or empty arrays: returns undefined.
 */
function normalizeSystemInstructions(
  instructions?: SystemInstructions | string
): SystemInstructions | undefined {
  if (!instructions) {
    return undefined;
  }

  if (typeof instructions === 'string') {
    const trimmed = instructions.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) {
            return undefined;
          }
          if (parsed.every(isSystemInstructionPart)) {
            return parsed as SystemInstructions;
          }
        }
      } catch {
        // Fall through to wrap as plain text
      }
    }
    return [{ type: 'text', content: instructions }];
  }

  if (Array.isArray(instructions)) {
    if (instructions.length === 0) {
      return undefined;
    }
    return instructions;
  }

  return undefined;
}

/**
 * Format system instructions into a JSON string conforming to
 * OpenTelemetry GenAI semantic conventions.
 *
 * Note: Serialization to a JSON string is done because OpenTelemetry JS
 * does not currently support complex/structured attribute values on spans.
 * Per semantic conventions, structured attributes should be serialized to a
 * JSON string on spans until complex attributes are supported.
 *
 * @see https://github.com/open-telemetry/opentelemetry-js/issues/7071
 *
 * @param instructions - System instructions payload to format.
 * @returns JSON string representation of system instructions, or `undefined` if empty/invalid.
 */
export function formatSystemInstructions(
  instructions?: SystemInstructions | string
): string | undefined {
  const normalized = normalizeSystemInstructions(instructions);
  if (!normalized) {
    return undefined;
  }
  try {
    return JSON.stringify(normalized);
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
 * Extract OpenTelemetry span attributes from GenAI inference request options.
 *
 * All returned attributes are defined by the GenAI semantic conventions on the
 * inference span only, so this helper is not applicable to other invocation
 * types.
 *
 * @param requestOptions - Optional inference request options to extract attributes from.
 * @returns Attributes object populated with GenAI request semantic conventions.
 */
export function getRequestOptionsAttributes(
  requestOptions?: InferenceRequestOptions
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
  if (requestOptions.stream) {
    attrs[ATTR_GEN_AI_REQUEST_STREAM] = requestOptions.stream;
  }
  if (requestOptions.reasoningLevel !== undefined) {
    attrs[ATTR_GEN_AI_REQUEST_REASONING_LEVEL] = requestOptions.reasoningLevel;
  }

  return attrs;
}

/**
 * Merge a partial token usage details update into the previously recorded usage.
 *
 * Only fields that are defined in `update` overwrite existing values. The nested
 * `tokenUsageByModality` is recursively merged using {@link mergeTokenUsage}.
 *
 * @param existing - Previously recorded usage details, if any.
 * @param update - New (possibly partial) usage details.
 * @returns A new merged {@link TokenUsageDetails} object.
 */
export function mergeTokenUsageDetails(
  existing: TokenUsageDetails | undefined,
  update: TokenUsageDetails
): TokenUsageDetails {
  const merged: TokenUsageDetails = { ...existing };
  for (const key of Object.keys(update) as (keyof TokenUsageDetails)[]) {
    if (key === 'tokenUsageByModality') {
      if (update.tokenUsageByModality !== undefined) {
        merged.tokenUsageByModality = mergeTokenUsage(
          existing?.tokenUsageByModality,
          update.tokenUsageByModality
        );
      }
    } else {
      const val = update[key];
      if (val !== undefined) {
        (merged as Record<string, unknown>)[key] = val;
      }
    }
  }
  return merged;
}

/**
 * Merge a partial token usage update into the previously recorded usage.
 *
 * Only fields that are defined in `update` overwrite the existing values, so
 * usage reported incrementally (e.g. input tokens at stream start and output
 * tokens at stream end) accumulates instead of being replaced. This mirrors the
 * behavior of span attributes, which are only set for defined values and can
 * never be removed once set.
 *
 * @param existing - Previously recorded usage, if any.
 * @param update - New (possibly partial) usage values.
 * @returns A new merged {@link TokenUsageByModality} object.
 */
export function mergeTokenUsage(
  existing: TokenUsageByModality | undefined,
  update: TokenUsageByModality
): TokenUsageByModality {
  const merged: TokenUsageByModality = { ...existing };
  for (const key of Object.keys(update) as (keyof TokenUsageByModality)[]) {
    setIfDefined(merged, key, update[key]);
  }
  return merged;
}

/**
 * Assign `value` to `target[key]` unless it is `undefined`.
 *
 * The generic key keeps the assignment type-safe across fields of different types.
 */
function setIfDefined<K extends keyof TokenUsageByModality>(
  target: TokenUsageByModality,
  key: K,
  value: TokenUsageByModality[K]
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/**
 * Sum the defined, non-negative counts across modalities.
 *
 * Returns `undefined` when no such count exists, so that a missing value is
 * never treated as `0`. Negative counts are ignored; an explicit `0` is kept.
 *
 * @param tokenCounts - Token counts keyed by modality, if any.
 * @returns The total, or `undefined` if there is nothing to sum.
 */
export function sumTokenCountsAcrossModalities(
  tokenCounts: TokenCountsByModality | undefined
): number | undefined {
  if (!tokenCounts) {
    return undefined;
  }
  let sum: number | undefined;
  for (const count of Object.values(tokenCounts)) {
    if (count !== undefined && count >= 0) {
      sum = (sum ?? 0) + count;
    }
  }
  return sum;
}

/**
 * Return a copy of `usage` with `inputTokenCount` and `outputTokenCount` inferred
 * from cache and reasoning token counts if not already defined. If `tokenUsageByModality`
 * is present, also infers modality breakdowns for input and output tokens.
 * The caller-supplied object is not modified.
 *
 * @param usage - Token usage details to infer counts for.
 * @returns A new {@link TokenUsageDetails} object with missing token counts inferred.
 */
export function inferMissingTokenCounts(
  usage: TokenUsageDetails
): TokenUsageDetails {
  const result: TokenUsageDetails = { ...usage };
  if (result.inputTokenCount === undefined) {
    const combinedTokenCount: number | undefined = combineTotals(
      result.cacheReadTokenCount,
      result.cacheWriteTokenCount
    );
    if (combinedTokenCount !== undefined) {
      result.inputTokenCount = combinedTokenCount;
    }
  }
  if (result.outputTokenCount === undefined) {
    const combinedTokenCount: number | undefined = combineTotals(
      result.reasoningTokenCount
    );
    if (combinedTokenCount !== undefined) {
      result.outputTokenCount = combinedTokenCount;
    }
  }
  if (
    result.tokenUsageByModality ||
    (result.reasoningTokenCount !== undefined && result.reasoningTokenCount > 0)
  ) {
    const modality = { ...result.tokenUsageByModality };
    let modified = false;
    if (modality.inputTokens === undefined) {
      const combinedInput = combineTokenCounts(
        modality.cacheReadTokens,
        modality.cacheWriteTokens
      );
      if (combinedInput !== undefined) {
        modality.inputTokens = combinedInput;
        modified = true;
      }
    }
    if (modality.outputTokens === undefined) {
      if (
        result.reasoningTokenCount !== undefined &&
        result.reasoningTokenCount > 0
      ) {
        modality.outputTokens = { text: result.reasoningTokenCount };
        modified = true;
      }
    }
    if (modified) {
      result.tokenUsageByModality = modality;
    }
  }
  return result;
}

/**
 * Add up positive total counts.
 *
 * Returns `undefined` when there is no positive count, so that an inferred
 * value never introduces a `0` that the caller did not report.
 */
function combineTotals(...totals: (number | undefined)[]): number | undefined {
  let combined: number | undefined;
  for (const total of totals) {
    if (total !== undefined && total > 0) {
      combined = (combined ?? 0) + total;
    }
  }
  return combined;
}

/**
 * Add up the positive counts of each modality across `countsList`.
 *
 * Returns `undefined` when there is no positive count, so that an inferred
 * value never introduces a `0` that the caller did not report.
 */
function combineTokenCounts(
  ...countsList: (TokenCountsByModality | undefined)[]
): TokenCountsByModality | undefined {
  let combined: TokenCountsByModality | undefined;
  for (const counts of countsList) {
    if (!counts) continue;
    for (const [modality, val] of Object.entries(counts)) {
      if (val !== undefined && val > 0) {
        combined = combined ?? {};
        const key = modality as TokenModality;
        combined[key] = (combined[key] ?? 0) + val;
      }
    }
  }
  return combined;
}

/**
 * Infer missing modality token counts as the 'unknown' modality.
 *
 * For each token category (input, output, cache read, cache write):
 * - If the total count is present and the corresponding {@link TokenUsageByModality}
 *   field is not explicitly provided, the entire count is attributed to the 'unknown' modality.
 * - If the corresponding {@link TokenUsageByModality} field is provided, but the sum of counts
 *   across all defined modalities is less than the total count, the missing difference is
 *   inferred as the 'unknown' modality.
 *
 * The caller-supplied object is not modified.
 *
 * @param usage - Token usage details with total counts and optional modality breakdown.
 * @returns A new {@link TokenUsageDetails} object with missing modality counts inferred.
 */
export function inferMissingModalityCounts(
  usage: TokenUsageDetails
): TokenUsageDetails {
  const inputTokens = inferModalityCount(
    usage.inputTokenCount,
    usage.tokenUsageByModality?.inputTokens
  );
  const outputTokens = inferModalityCount(
    usage.outputTokenCount,
    usage.tokenUsageByModality?.outputTokens
  );
  const cacheReadTokens = inferModalityCount(
    usage.cacheReadTokenCount,
    usage.tokenUsageByModality?.cacheReadTokens
  );
  const cacheWriteTokens = inferModalityCount(
    usage.cacheWriteTokenCount,
    usage.tokenUsageByModality?.cacheWriteTokens
  );

  const hasModalityUsage =
    inputTokens !== undefined ||
    outputTokens !== undefined ||
    cacheReadTokens !== undefined ||
    cacheWriteTokens !== undefined;

  if (!hasModalityUsage) {
    return { ...usage };
  }

  const tokenUsageByModality: TokenUsageByModality = {
    ...usage.tokenUsageByModality,
  };
  if (inputTokens !== undefined) {
    tokenUsageByModality.inputTokens = inputTokens;
  }
  if (outputTokens !== undefined) {
    tokenUsageByModality.outputTokens = outputTokens;
  }
  if (cacheReadTokens !== undefined) {
    tokenUsageByModality.cacheReadTokens = cacheReadTokens;
  }
  if (cacheWriteTokens !== undefined) {
    tokenUsageByModality.cacheWriteTokens = cacheWriteTokens;
  }

  return {
    ...usage,
    tokenUsageByModality,
  };
}

/**
 * Infer missing modality token counts for a single category.
 *
 * @param count - The total count for this category, if reported.
 * @param existing - The existing modality breakdown, if reported.
 * @returns The updated modality breakdown with missing counts attributed to 'unknown',
 *   or `existing` if no count was reported or the existing sum already covers the count.
 */
function inferModalityCount(
  count: number | undefined,
  existing: TokenCountsByModality | undefined
): TokenCountsByModality | undefined {
  if (count === undefined || count < 0) {
    return existing;
  }
  if (!existing) {
    return { unknown: count };
  }
  const sum = sumTokenCountsAcrossModalities(existing) ?? 0;
  if (sum < count) {
    const missing = count - sum;
    return {
      ...existing,
      unknown: (existing.unknown ?? 0) + missing,
    };
  }
  return existing;
}
