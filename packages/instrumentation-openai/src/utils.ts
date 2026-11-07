/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { diag } from '@opentelemetry/api';
import type { Attributes, DiagLogger } from '@opentelemetry/api';
import type { ChatCompletionCreateParams } from 'openai/resources/chat/completions';
import type { ResponseCreateParams } from 'openai/resources/responses/responses';
import {
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
} from '@opentelemetry/genai-util';
import type { InferenceRequestOptions, TokenUsageDetails } from '@opentelemetry/genai-util';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';

/**
 * Read a boolean from an environment variable.
 *
 * https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/#boolean
 *
 * @param {string} name
 * @returns {boolean | undefined}
 *    - Returns `undefined` if the envvar is not set on `process.env` or is
 *      the empty string. This indicates that no explicit value was given,
 *      which may be a useful distinction from an explicit `false` for callers.
 *    - Returns `true` iff the envvar value is the string "true" (case-insensitive).
 *    - Returns `false`, iff the envvar value is the string "false" (case-insensitive).
 *    - Otherwise, it `diag.warn()`s about the invalid value and returns
 *      `undefined` as a (falsey) fallback.
 * @throws if the envvar value is set and is not a string
 */
export function getEnvBool(
  name: string,
  diag_: DiagLogger = diag
): boolean | undefined {
  const val = process.env[name];
  if (val === undefined || val === '') {
    return undefined;
  } else if (typeof val !== 'string') {
    throw new Error(
      `invalid type for environment variable: ${typeof val} (${name}=${val})`
    );
  } else {
    const valLower = val.toLowerCase();
    if (valLower === 'true') {
      return true;
    } else if (valLower === 'false') {
      return false;
    } else {
      diag_.warn(
        `invalid boolean value for environment variable: ${name}=${val}; ignoring`
      );
      return undefined;
    }
  }
}

type PortFromProtocol = { [key: string]: number };
const SERVER_PORT_FROM_URL_PROTOCOL: PortFromProtocol = {
  'https:': 443,
  'http:': 80,
};

/**
 * `gen_ai.provider.name` for OpenAI SDK client operations.
 *
 * Per [OpenAI GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/openai.md#spans),
 * this instrumentation MUST use `"openai"` — including for OpenAI-compatible `baseURL`
 * proxies. Server address / port are captured separately via {@link getAttrsFromBaseURL}.
 */
export function getProviderNameFromBaseURL(
  _baseURL: string | undefined,
  _diag_: DiagLogger = diag
): string {
  return GEN_AI_PROVIDER_NAME_VALUE_OPENAI;
}

/**
 * Return span/metric attributes from the given OpenAI client baseURL.
 */
export function getAttrsFromBaseURL(
  baseURL: string | undefined,
  diag_: DiagLogger = diag
): Attributes | undefined {
  if (!baseURL) {
    return;
  }

  let u;
  try {
    u = new URL(baseURL);
  } catch (ex) {
    diag_.debug(
      `could not determine server.{address,port} from baseURL: ${ex}`
    );
    return;
  }

  return {
    [ATTR_SERVER_ADDRESS]: u.hostname,
    [ATTR_SERVER_PORT]: u.port
      ? Number(u.port)
      : SERVER_PORT_FROM_URL_PROTOCOL[u.protocol],
  };
}

export function getServerFromBaseURL(
  baseURL: string | undefined,
  diag_: DiagLogger = diag
): { serverAddress?: string; serverPort?: number } {
  const attrs = getAttrsFromBaseURL(baseURL, diag_);
  if (!attrs) {
    return {};
  }
  return {
    serverAddress: attrs[ATTR_SERVER_ADDRESS] as string,
    serverPort: attrs[ATTR_SERVER_PORT] as number,
  };
}

/**
 * Map OpenAI chat completion parameters to {@link InferenceRequestOptions}.
 */
export function chatCompletionParamsToInferenceRequestOptions(
  params: ChatCompletionCreateParams
): InferenceRequestOptions {
  const opts: InferenceRequestOptions = {
    temperature: params.temperature ?? undefined,
    topP: params.top_p ?? undefined,
    frequencyPenalty: params.frequency_penalty ?? undefined,
    presencePenalty: params.presence_penalty ?? undefined,
    stream: params.stream === true,
  };
  if (typeof params.max_completion_tokens === 'number') {
    opts.maxTokens = params.max_completion_tokens;
  } else if (typeof params.max_tokens === 'number') {
    opts.maxTokens = params.max_tokens;
  }
  if (params.stop != null) {
    opts.stopSequences = Array.isArray(params.stop) ? params.stop : [params.stop];
  }
  if (typeof params.seed === 'number') {
    opts.seed = params.seed;
  }
  if (params.reasoning_effort != null) {
    opts.reasoningLevel = String(params.reasoning_effort);
  }
  return opts;
}

/**
 * Map OpenAI Responses API create params to {@link InferenceRequestOptions}.
 */
export function responseCreateParamsToInferenceRequestOptions(
  params: ResponseCreateParams
): InferenceRequestOptions {
  const opts: InferenceRequestOptions = {
    temperature: params.temperature ?? undefined,
    topP: params.top_p ?? undefined,
    stream: params.stream === true,
  };
  if (typeof params.max_output_tokens === 'number') {
    opts.maxTokens = params.max_output_tokens;
  }
  if (params.reasoning != null && typeof params.reasoning === 'object') {
    const effort = (params.reasoning as { effort?: string }).effort;
    if (effort != null) {
      opts.reasoningLevel = String(effort);
    }
  }
  return opts;
}

/**
 * Chat Completions and legacy Completions usage shapes.
 */
export type ChatCompletionsUsageLike = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
    audio_tokens?: number | null;
  } | null;
  completion_tokens_details?: {
    reasoning_tokens?: number | null;
    audio_tokens?: number | null;
  } | null;
};

/**
 * Responses API usage shape.
 */
export type ResponsesUsageLike = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
  output_tokens_details?: {
    reasoning_tokens?: number | null;
  } | null;
};

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Build {@link TokenUsageDetails} from OpenAI Chat Completions usage.
 */
export function tokenUsageDetailsFromChatCompletionUsage(
  usage: ChatCompletionsUsageLike | null | undefined
): TokenUsageDetails | undefined {
  if (!usage) {
    return undefined;
  }
  const input = usage.prompt_tokens;
  const output = usage.completion_tokens;
  const cacheRead = usage.prompt_tokens_details?.cached_tokens;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;

  const details: TokenUsageDetails = {};
  if (input !== undefined && input >= 0) {
    details.inputTokenCount = input;
  }
  if (output !== undefined && output >= 0) {
    details.outputTokenCount = output;
  }
  if (isPositiveFiniteNumber(cacheRead)) {
    details.cacheReadTokenCount = cacheRead;
  }
  if (isPositiveFiniteNumber(reasoning)) {
    details.reasoningTokenCount = reasoning;
  }

  if (
    details.inputTokenCount !== undefined ||
    details.outputTokenCount !== undefined
  ) {
    details.tokenUsageByModality = {
      inputTokens:
        details.inputTokenCount !== undefined
          ? { text: details.inputTokenCount }
          : undefined,
      outputTokens:
        details.outputTokenCount !== undefined
          ? { text: details.outputTokenCount }
          : undefined,
      cacheReadTokens: isPositiveFiniteNumber(cacheRead)
        ? { text: cacheRead }
        : undefined,
    };
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * Build {@link TokenUsageDetails} from OpenAI Responses API usage.
 */
export function tokenUsageDetailsFromResponsesUsage(
  usage: ResponsesUsageLike | null | undefined
): TokenUsageDetails | undefined {
  if (!usage) {
    return undefined;
  }
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  const cacheRead = usage.input_tokens_details?.cached_tokens;
  const reasoning = usage.output_tokens_details?.reasoning_tokens;

  const details: TokenUsageDetails = {};
  if (input !== undefined && input >= 0) {
    details.inputTokenCount = input;
  }
  if (output !== undefined && output >= 0) {
    details.outputTokenCount = output;
  }
  if (isPositiveFiniteNumber(cacheRead)) {
    details.cacheReadTokenCount = cacheRead;
  }
  if (isPositiveFiniteNumber(reasoning)) {
    details.reasoningTokenCount = reasoning;
  }

  if (
    details.inputTokenCount !== undefined ||
    details.outputTokenCount !== undefined
  ) {
    details.tokenUsageByModality = {
      inputTokens:
        details.inputTokenCount !== undefined
          ? { text: details.inputTokenCount }
          : undefined,
      outputTokens:
        details.outputTokenCount !== undefined
          ? { text: details.outputTokenCount }
          : undefined,
      cacheReadTokens: isPositiveFiniteNumber(cacheRead)
        ? { text: cacheRead }
        : undefined,
    };
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * @deprecated Use {@link tokenUsageDetailsFromChatCompletionUsage} with {@link InferenceInvocation.setUsage}.
 * Kept for unit tests that assert attribute keys on a mock span.
 */
export function setUsageDetailAttributes(
  span: { setAttribute(key: string, value: unknown): void },
  usage: ChatCompletionsUsageLike | ResponsesUsageLike | null | undefined
): void {
  if (!usage) {
    return;
  }

  const isChatShape =
    'prompt_tokens' in usage || 'completion_tokens' in usage;
  const details = isChatShape
    ? tokenUsageDetailsFromChatCompletionUsage(
        usage as ChatCompletionsUsageLike
      )
    : tokenUsageDetailsFromResponsesUsage(usage as ResponsesUsageLike);

  if (details?.cacheReadTokenCount != null && details.cacheReadTokenCount > 0) {
    span.setAttribute(
      ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
      details.cacheReadTokenCount
    );
  }
  if (
    details?.reasoningTokenCount != null &&
    details.reasoningTokenCount > 0
  ) {
    span.setAttribute(
      ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
      details.reasoningTokenCount
    );
  }
}

/**
 * Placeholder used instead of raw image URLs / data URIs during opt-in content
 * capture. Avoids exporting signed URLs, query tokens, or base64 payloads into
 * telemetry backends.
 */
export const IMAGE_CONTENT_PLACEHOLDER = '[image]' as const;

type ChatContentPartLike = {
  type?: string;
  text?: string;
  refusal?: string;
  image_url?: string | { url?: unknown } | null;
};

/**
 * Serialize chat message content parts for opt-in content capture.
 *
 * - Text / refusal parts are included as-is when present.
 * - Image parts are recorded only as {@link IMAGE_CONTENT_PLACEHOLDER}; raw
 *   `http(s)` URLs, signed URLs, and `data:` URIs are never exported.
 * - Malformed / unknown parts are skipped.
 */
export function formatChatMessageContent(
  parts: ReadonlyArray<ChatContentPartLike> | null | undefined
): string {
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map(part => {
      if (part == null || typeof part !== 'object') {
        return '';
      }
      if (part.type === 'text' && typeof part.text === 'string') {
        return part.text;
      }
      if (part.type === 'refusal' && typeof part.refusal === 'string') {
        return part.refusal;
      }
      if (part.type === 'image_url') {
        return IMAGE_CONTENT_PLACEHOLDER;
      }
      return '';
    })
    .filter(part => part.length > 0)
    .join('\n');
}
