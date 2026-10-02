/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, type Attributes, type HrTime } from '@opentelemetry/api';
import { hrTime, hrTimeDuration, hrTimeToSeconds } from '@opentelemetry/core';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
} from '../semconv';
import type {
  ContentCaptureMode,
  FinishReason,
  InferenceInvocationOptions,
  InputMessages,
  OutputMessages,
  SystemInstructions,
  TokenCountsByModality,
  TokenModality,
  TokenUsage,
} from '../types';
import {
  formatInputMessages,
  formatOutputMessages,
  formatSystemInstructions,
  getRequestOptionsAttributes,
  mergeTokenUsage,
  sumTokenCountsAcrossModalities,
} from '../utils';
import type { TelemetryHandler } from '../handler';
import { BaseInvocation } from './base';

/**
 * Build the span attributes that are known when the inference span is started.
 *
 * These are passed to the span at creation time so that they are visible to samplers.
 * Content attributes (system instructions, input/output messages) are intentionally
 * excluded: they are serialized once when the invocation ends.
 */
function buildInitialAttributes(
  options: InferenceInvocationOptions,
  operationName: string
): Attributes {
  const attrs: Attributes = {
    ...options.attributes,
    ...getRequestOptionsAttributes(options.requestOptions),
    [ATTR_GEN_AI_PROVIDER_NAME]: options.providerName,
    [ATTR_GEN_AI_OPERATION_NAME]: operationName,
  };

  if (options.requestModel) {
    attrs[ATTR_GEN_AI_REQUEST_MODEL] = options.requestModel;
  }

  if (options.conversationId) {
    attrs[ATTR_GEN_AI_CONVERSATION_ID] = options.conversationId;
  }

  if (options.serverAddress) {
    attrs[ATTR_SERVER_ADDRESS] = options.serverAddress;
    if (options.serverPort !== undefined) {
      attrs[ATTR_SERVER_PORT] = options.serverPort;
    }
  }

  return attrs;
}

/**
 * Format a GenAI span name for an inference invocation adhering to
 * OpenTelemetry semantic conventions.
 *
 * Format: `{gen_ai.operation.name} {gen_ai.request.model}` when model is present,
 * or `{gen_ai.operation.name}` when model is omitted.
 *
 * @param operationName - The GenAI operation name.
 * @param requestModel - Optional model name requested.
 * @returns Standardized span name string.
 */
function getInferenceSpanName(
  operationName: string,
  requestModel?: string
): string {
  const model = requestModel?.trim();
  return model ? `${operationName} ${model}` : operationName;
}

/**
 * Manages the lifecycle and telemetry of an LLM / GenAI inference operation.
 *
 * @experimental This class is experimental and subject to change.
 */
export class InferenceInvocation extends BaseInvocation {
  private readonly _providerName: string;
  private readonly _operationName: string;
  private readonly _requestModel?: string;
  private readonly _serverAddress?: string;
  private readonly _serverPort?: number;
  private readonly _contentCaptureMode: ContentCaptureMode;
  private _responseModel?: string;
  private _usage?: TokenUsage;
  private _inputMessages?: InputMessages;
  private _outputMessages?: OutputMessages;
  private _systemInstructions?: SystemInstructions;
  private _lastChunkTime?: HrTime;

  /**
   * Start an inference invocation, creating and starting the underlying span.
   *
   * @param handler Handler providing the tracer, meter, and completion hooks.
   * @param options Request details, parent context, and initial attributes.
   */
  constructor(handler: TelemetryHandler, options: InferenceInvocationOptions) {
    const operationName =
      options.operationName ?? GEN_AI_OPERATION_NAME_VALUE_CHAT;

    super(getInferenceSpanName(operationName, options.requestModel), handler, {
      kind: SpanKind.CLIENT,
      attributes: buildInitialAttributes(options, operationName),
      metricAttributes: options.metricAttributes,
      context: options.parentContext,
      startTime: options.startTime,
    });

    this._providerName = options.providerName;
    this._operationName = operationName;
    this._requestModel = options.requestModel;
    this._serverAddress = options.serverAddress;
    this._serverPort = options.serverPort;
    this._contentCaptureMode = handler.getContentCaptureMode();
    this._inputMessages = options.inputMessages
      ? [...options.inputMessages]
      : undefined;
    this._systemInstructions = options.systemInstructions;
  }

  /**
   * Set the model name that produced the response.
   */
  public setResponseModel(model: string): this {
    this._responseModel = model;
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);
    return this;
  }

  /**
   * Set the response identifier.
   */
  public setResponseId(id: string): this {
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, id);
    return this;
  }

  /**
   * Set finish reasons for the response choices.
   */
  public setFinishReasons(reasons: readonly FinishReason[]): this {
    const arr = typeof reasons === 'string' ? [reasons] : [...reasons];
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, arr);
    return this;
  }

  /**
   * Record token usage.
   *
   * May be called multiple times (e.g. when a streaming provider reports input
   * and output tokens in separate events). Only fields that are defined in
   * `usage` are updated; previously recorded values for other fields are kept.
   * The span attributes and the token usage metrics are both derived from the
   * merged usage once, when the invocation ends, so they always agree.
   *
   * Note (applied to the merged usage when the invocation ends):
   * If `usage` TokenUsage does not contain inputTokens, it is inferred using the cache read tokens and cache write tokens.
   * If `usage` TokenUsage does not contain outputTokens, it is inferred using the reasoning tokens.
   * If `usage` TokenUsage already contains inputTokens and outputTokens, they are not modified.
   */
  public setUsage(usage: TokenUsage): this {
    this._usage = mergeTokenUsage(this._usage, usage);
    return this;
  }

  /**
   * Add input messages to the invocation.
   *
   * May be called multiple times; messages are accumulated and serialized once when
   * the invocation ends.
   */
  public addInputMessages(messages: InputMessages): this {
    (this._inputMessages ??= []).push(...messages);
    return this;
  }

  /**
   * Add output messages to the invocation.
   *
   * May be called multiple times; messages are accumulated and serialized once when
   * the invocation ends.
   */
  public addOutputMessages(messages: OutputMessages): this {
    (this._outputMessages ??= []).push(...messages);
    return this;
  }

  /**
   * Set system instructions, replacing any previously set value.
   *
   * Serialized once when the invocation ends.
   */
  public setSystemInstructions(instructions: SystemInstructions): this {
    this._systemInstructions = instructions;
    return this;
  }

  /**
   * Set time to first chunk in seconds for streaming responses.
   */
  public setTimeToFirstChunk(seconds: number): this {
    this._span.setAttribute(ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK, seconds);
    return this;
  }

  /**
   * Record one streamed output chunk arriving.
   *
   * The first call marks the request as streaming and records time-to-first-chunk
   * (measured from the invocation start); each later call records the gap since the
   * previous chunk as time-per-output-chunk. Calls after the invocation has ended are
   * ignored.
   */
  public recordStreamChunk(): this {
    if (this._isEnded) {
      return this;
    }

    const now = hrTime();
    const isFirstChunk = this._lastChunkTime === undefined;
    const gap = Math.max(
      0,
      hrTimeToSeconds(
        hrTimeDuration(this._lastChunkTime ?? this._startTime, now)
      )
    );
    this._lastChunkTime = now;
    const attrs = this._getMetricAttributes();

    if (isFirstChunk) {
      this._span.setAttribute(ATTR_GEN_AI_REQUEST_STREAM, true);
      this._span.setAttribute(ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK, gap);
      this._handler.recordTimeToFirstChunk(gap, attrs, this._context);
    } else {
      this._handler.recordTimePerOutputChunk(gap, attrs, this._context);
    }
    return this;
  }

  /**
   * Semantic convention dimensions shared by all metrics recorded for this invocation.
   *
   * Caller-supplied metric attributes override these; see
   * {@link BaseInvocation._getMetricAttributes}.
   */
  protected override _getSemconvMetricAttributes(): Attributes {
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_PROVIDER_NAME]: this._providerName,
      [ATTR_GEN_AI_OPERATION_NAME]: this._operationName,
    };
    if (this._requestModel) {
      metricAttrs[ATTR_GEN_AI_REQUEST_MODEL] = this._requestModel;
    }
    if (this._responseModel) {
      metricAttrs[ATTR_GEN_AI_RESPONSE_MODEL] = this._responseModel;
    }
    if (this._serverAddress) {
      metricAttrs[ATTR_SERVER_ADDRESS] = this._serverAddress;
    }
    if (this._serverPort !== undefined) {
      metricAttrs[ATTR_SERVER_PORT] = this._serverPort;
    }
    return metricAttrs;
  }

  protected override _recordMetrics(
    durationSec: number,
    errorType?: string
  ): void {
    // The invocation context is passed explicitly: metrics are recorded while the
    // invocation's context may no longer be active, and exemplars must still point
    // at the invocation span.
    this._handler.recordOperationDuration(
      durationSec,
      this._getMetricAttributes(errorType),
      this._context
    );
    if (this._usage) {
      // Token metrics do not define `error.type`, even for failed operations.
      this._handler.recordInferenceTokenUsage(
        this._usage,
        this._getMetricAttributes(),
        this._context
      );
    }
  }

  /**
   * Emit log-based event `gen_ai.client.inference.operation.details`.
   *
   * NOTE: Currently a no-op placeholder. Will be implemented using LoggerProvider / EventLogger
   * once the Logs & Events API is stable in OpenTelemetry JavaScript.
   */
  protected override _emitContentEvent(_endTime?: HrTime): void {
    // No-op until Logs/Events API is stable in JS.
  }

  /**
   * Finalize token usage and serialize the invocation's content onto the span.
   *
   * Token usage is finalized here (before `_recordMetrics` runs) so that the
   * span attributes and the token metrics are derived from the same merged and
   * inferred usage.
   *
   * All content, including content supplied at start, is serialized once here rather
   * than on every `add*` / `set*` call, since messages may be added repeatedly and
   * only the final value is exported.
   */
  protected override _onInvocationEnd(
    _endTime: HrTime,
    _errorType?: string
  ): void {
    if (this._usage) {
      this._usage = this.inferMissingTokenCounts(this._usage);
      this.setUsageAttributes(this._usage);
    }

    if (this._contentCaptureMode !== 'span_only') {
      return;
    }

    const systemInstructions = formatSystemInstructions(
      this._systemInstructions
    );
    if (systemInstructions) {
      this._span.setAttribute(
        ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
        systemInstructions
      );
    }

    const inputMessages = formatInputMessages(this._inputMessages);
    if (inputMessages) {
      this._span.setAttribute(ATTR_GEN_AI_INPUT_MESSAGES, inputMessages);
    }

    const outputMessages = formatOutputMessages(this._outputMessages);
    if (outputMessages) {
      this._span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, outputMessages);
    }
  }

  /**
   * Set the `gen_ai.usage.*` span attributes for every field defined in `usage`.
   *
   * An attribute is only set when the field contains at least one defined,
   * non-negative count. An explicitly reported `0` is recorded; `undefined` is
   * never treated as `0`.
   */
  private setUsageAttributes(usage: TokenUsage): void {
    this.setUsageAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, usage.inputTokens);
    this.setUsageAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, usage.outputTokens);
    this.setUsageAttribute(
      ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
      usage.reasoningTokens
    );
    this.setUsageAttribute(
      ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
      usage.cacheReadTokens
    );
    this.setUsageAttribute(
      ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
      usage.cacheWriteTokens
    );
  }

  private setUsageAttribute(
    key: string,
    tokenCounts: TokenCountsByModality | undefined
  ): void {
    const total = sumTokenCountsAcrossModalities(tokenCounts);
    if (total !== undefined) {
      this._span.setAttribute(key, total);
    }
  }

  /**
   * Add up the positive counts of each modality across `countsList`.
   *
   * Returns `undefined` when there is no positive count, so that an inferred
   * value never introduces a `0` that the caller did not report.
   */
  private combineTokenCounts(
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
   * Return a copy of `usage` with `inputTokens` and `outputTokens` inferred if
   * not already defined. The caller-supplied object is not modified.
   */
  private inferMissingTokenCounts(usage: TokenUsage): TokenUsage {
    const result: TokenUsage = { ...usage };
    if (result.inputTokens === undefined) {
      const combinedInput = this.combineTokenCounts(
        result.cacheReadTokens,
        result.cacheWriteTokens
      );
      if (combinedInput !== undefined) {
        result.inputTokens = combinedInput;
      }
    }
    if (result.outputTokens === undefined) {
      const inferredOutput = this.combineTokenCounts(result.reasoningTokens);
      if (inferredOutput !== undefined) {
        result.outputTokens = inferredOutput;
      }
    }
    return result;
  }
}
