/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { TelemetryHandler } from '@opentelemetry/genai-util';

type InferenceInvocationOptions = Parameters<
  TelemetryHandler['startInference']
>[0];
export type InferenceInvocation = ReturnType<
  TelemetryHandler['startInference']
>;
type InferenceRequestOptions = NonNullable<
  InferenceInvocationOptions['requestOptions']
>;
type TokenUsageDetails = Parameters<InferenceInvocation['setUsage']>[0];

/** The token counts of `Anthropic.Messages.Usage` that map to GenAI usage. */
interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

const USAGE_KEYS = [
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * `AnthropicBedrock` and `AnthropicVertex` extend `BaseAnthropic` and reuse the
 * core `Messages` resource, so the same patch serves all three. Derive the
 * provider from the client's base URL rather than assuming the first-party API.
 */
export function getProviderName(client: unknown): string {
  const baseURL = (client as { baseURL?: unknown })?.baseURL;
  if (typeof baseURL === 'string') {
    let host: string;
    try {
      host = new URL(baseURL).host;
    } catch {
      return 'anthropic';
    }
    if (/\.amazonaws\.com$/.test(host) && host.includes('bedrock')) {
      return 'aws.bedrock';
    }
    // `AnthropicBedrockMantle` uses `bedrock-mantle.<region>.api.aws`.
    if (/^bedrock-mantle\.[a-z0-9-]+\.api\.aws$/.test(host)) {
      return 'aws.bedrock';
    }
    // Regional endpoints are `<region>-aiplatform.googleapis.com`, the global
    // endpoint has no region prefix, and the `us` and `eu` multi-region
    // endpoints are `aiplatform.<name>.rep.googleapis.com`.
    if (/(^|[.-])aiplatform\.([a-z0-9-]+\.rep\.)?googleapis\.com$/.test(host)) {
      return 'gcp.vertex_ai';
    }
  }
  return 'anthropic';
}

/** Map the request parameters onto the invocation's `gen_ai.request.*` options. */
export function getRequestOptions(
  params: Anthropic.Messages.MessageCreateParams
): InferenceRequestOptions {
  const stopSequences = Array.isArray(params.stop_sequences)
    ? params.stop_sequences.filter(
        (value): value is string => typeof value === 'string'
      )
    : undefined;
  return {
    maxTokens: asNumber(params.max_tokens),
    temperature: asNumber(params.temperature),
    topP: asNumber(params.top_p),
    topK: asNumber(params.top_k),
    stopSequences,
    stream: params.stream === true,
  };
}

/**
 * Anthropic reports `input_tokens` excluding the prompt cache, while
 * `gen_ai.usage.input_tokens` includes cache reads and writes.
 */
function toTokenUsage(usage: AnthropicUsage): TokenUsageDetails {
  const cacheRead = usage.cache_read_input_tokens;
  const cacheWrite = usage.cache_creation_input_tokens;
  return {
    inputTokenCount:
      usage.input_tokens === undefined
        ? undefined
        : usage.input_tokens + (cacheRead ?? 0) + (cacheWrite ?? 0),
    outputTokenCount: usage.output_tokens,
    cacheReadTokenCount: cacheRead,
    cacheWriteTokenCount: cacheWrite,
  };
}

/**
 * Records response metadata and token usage onto an inference invocation, from
 * either a complete `Message` or the events of a streamed one.
 */
export class ResponseRecorder {
  private readonly _usage: AnthropicUsage = {};

  constructor(private readonly _invocation: InferenceInvocation) {}

  /** Record a complete `Message`, or the partial one in `message_start`. */
  recordMessage(message: unknown): void {
    // An abort can end the invocation while a buffered event is still being
    // delivered; the span no longer accepts attributes by then.
    if (!isRecord(message) || this._invocation.isEnded()) return;
    const id = asString(message.id);
    if (id) this._invocation.setResponseId(id);
    const model = asString(message.model);
    if (model) this._invocation.setResponseModel(model);
    this._recordStopReason(message.stop_reason);
    this._recordUsage(message.usage);
  }

  /** Record one raw stream event. */
  recordStreamEvent(event: unknown): void {
    if (!isRecord(event) || this._invocation.isEnded()) return;
    if (event.type === 'message_start') {
      this.recordMessage(event.message);
    } else if (event.type === 'message_delta') {
      if (isRecord(event.delta)) {
        this._recordStopReason(event.delta.stop_reason);
      }
      this._recordUsage(event.usage);
    }
  }

  private _recordStopReason(value: unknown): void {
    const stopReason = asString(value);
    if (stopReason) this._invocation.setFinishReasons([stopReason]);
  }

  /**
   * Streams report usage across `message_start` and `message_delta`, where
   * later counts are cumulative, so merge them and report the combined total.
   */
  private _recordUsage(usage: unknown): void {
    if (!isRecord(usage)) return;
    let changed = false;
    for (const key of USAGE_KEYS) {
      const count = asNumber(usage[key]);
      if (count !== undefined) {
        this._usage[key] = count;
        changed = true;
      }
    }
    if (changed) this._invocation.setUsage(toTokenUsage(this._usage));
  }
}
