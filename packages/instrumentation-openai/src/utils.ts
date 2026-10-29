/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { diag } from '@opentelemetry/api';
import type { Attributes, DiagLogger, Span } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
  GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_INFERENCE,
  GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_COHERE,
  GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI,
  GEN_AI_PROVIDER_NAME_VALUE_GROQ,
  GEN_AI_PROVIDER_NAME_VALUE_MISTRAL_AI,
  GEN_AI_PROVIDER_NAME_VALUE_MOONSHOT_AI,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_PERPLEXITY,
  GEN_AI_PROVIDER_NAME_VALUE_X_AI,
} from '@opentelemetry/genai-util';
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
 * Hostname suffix → GenAI provider name mappings derived from the donated
 * OpenInference instrumentation, remapped to official GenAI provider enums.
 *
 * Hosts without a GenAI enum equivalent (for example Fireworks or Together)
 * are intentionally omitted rather than inventing non-standard provider names.
 *
 * AWS Bedrock is handled separately via {@link isAwsBedrockHostname} so that
 * unrelated `*.amazonaws.com` hosts are not mis-attributed.
 */
const HOST_SUFFIX_TO_PROVIDER: ReadonlyArray<readonly [string, string]> = [
  ['openai.azure.com', GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI],
  ['services.ai.azure.com', GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_INFERENCE],
  ['cognitiveservices.azure.com', GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI],
  ['api.openai.com', GEN_AI_PROVIDER_NAME_VALUE_OPENAI],
  ['api.anthropic.com', GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC],
  ['api.cohere.com', GEN_AI_PROVIDER_NAME_VALUE_COHERE],
  ['api.cohere.ai', GEN_AI_PROVIDER_NAME_VALUE_COHERE],
  ['api.mistral.ai', GEN_AI_PROVIDER_NAME_VALUE_MISTRAL_AI],
  ['generativelanguage.googleapis.com', GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI],
  ['aiplatform.googleapis.com', GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI],
  ['api.x.ai', GEN_AI_PROVIDER_NAME_VALUE_X_AI],
  ['api.deepseek.com', GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK],
  ['api.groq.com', GEN_AI_PROVIDER_NAME_VALUE_GROQ],
  ['api.moonshot.cn', GEN_AI_PROVIDER_NAME_VALUE_MOONSHOT_AI],
  ['api.perplexity.ai', GEN_AI_PROVIDER_NAME_VALUE_PERPLEXITY],
];

function isAwsBedrockHostname(hostname: string): boolean {
  // Require both amazonaws.com and a bedrock marker to avoid attributing
  // S3/other AWS endpoints as Bedrock when an OpenAI-compatible baseURL is set.
  return (
    (hostname === 'amazonaws.com' || hostname.endsWith('.amazonaws.com')) &&
    hostname.includes('bedrock')
  );
}

/**
 * Resolve `gen_ai.provider.name` from an OpenAI-compatible client base URL.
 *
 * Defaults to `openai` when the host is unrecognized, missing, or malformed.
 * That default matches the OpenAI SDK surface (OpenAI-compatible protocol) and
 * is not a claim that an unknown custom proxy is operated by OpenAI.
 */
export function getProviderNameFromBaseURL(
  baseURL: string | undefined,
  diag_: DiagLogger = diag
): string {
  if (!baseURL) {
    return GEN_AI_PROVIDER_NAME_VALUE_OPENAI;
  }

  let hostname: string;
  try {
    hostname = new URL(baseURL).hostname.toLowerCase();
  } catch (ex) {
    diag_.debug(`could not determine gen_ai.provider.name from baseURL: ${ex}`);
    return GEN_AI_PROVIDER_NAME_VALUE_OPENAI;
  }

  if (isAwsBedrockHostname(hostname)) {
    return GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK;
  }

  for (const [suffix, provider] of HOST_SUFFIX_TO_PROVIDER) {
    if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
      return provider;
    }
  }
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

  // TODO: would be nice to LRU cache this, but probably not significant perf
  let u;
  try {
    u = new URL(baseURL);
  } catch (ex) {
    // Note: We should never get to this point as openai should crash prior to this.
    // Even if it did, instrumentation will still work except lacking these attributes.
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
 * Set GenAI usage detail attributes (cache read / reasoning) when present.
 * Ported from donated OpenInference coverage, remapped to GenAI semconv names
 * shared via `@opentelemetry/genai-util`.
 *
 * Only positive finite numbers are recorded. Zero, negative, NaN, and
 * non-numeric values are omitted.
 */
export function setUsageDetailAttributes(
  span: Span,
  usage: ChatCompletionsUsageLike | ResponsesUsageLike | null | undefined
): void {
  if (!usage) {
    return;
  }

  const cacheRead =
    'prompt_tokens_details' in usage
      ? usage.prompt_tokens_details?.cached_tokens
      : usage.input_tokens_details?.cached_tokens;
  if (isPositiveFiniteNumber(cacheRead)) {
    span.setAttribute(ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS, cacheRead);
  }

  const reasoning =
    'completion_tokens_details' in usage
      ? usage.completion_tokens_details?.reasoning_tokens
      : usage.output_tokens_details?.reasoning_tokens;
  if (isPositiveFiniteNumber(reasoning)) {
    span.setAttribute(ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS, reasoning);
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
        // Intentionally do not read image_url.url / string payloads.
        return IMAGE_CONTENT_PLACEHOLDER;
      }
      return '';
    })
    .filter(part => part.length > 0)
    .join('\n');
}
