/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  diag,
  metrics,
  trace,
  type Attributes,
  type Context,
  type Counter,
  type DiagLogger,
  type Histogram,
  type Meter,
  type MeterProvider,
  type Tracer,
  type TracerProvider,
} from '@opentelemetry/api';
import {
  getContentCaptureMode,
  parseContentCaptureMode,
} from './environment-variables';
import { EmbeddingInvocation } from './invocations/embedding';
import { InferenceInvocation } from './invocations/inference';
import { ToolInvocation } from './invocations/tool';
import {
  createCacheReadInputTokenUsageCounter,
  createCacheWriteInputTokenUsageCounter,
  createDurationHistogram,
  createExecuteToolDurationHistogram,
  createInputTokenOperationHistogram,
  createInputTokenUsageCounter,
  createOutputTokenOperationHistogram,
  createOutputTokenUsageCounter,
  createReasoningOutputTokenUsageCounter,
  createTimePerOutputChunkHistogram,
  createTimeToFirstChunkHistogram,
} from './metrics';
import {
  ATTR_GEN_AI_TOKEN_MODALITY,
  GEN_AI_SCHEMA_URL,
  GEN_AI_TOKEN_MODALITY_VALUE_AUDIO,
  GEN_AI_TOKEN_MODALITY_VALUE_IMAGE,
  GEN_AI_TOKEN_MODALITY_VALUE_TEXT,
  GEN_AI_TOKEN_MODALITY_VALUE_UNKNOWN,
} from './semconv';
import type {
  ContentCaptureMode,
  EmbeddingInvocationOptions,
  GenAIInstrumentationConfig,
  InferenceInvocationOptions,
  TokenModality,
  TokenUsage,
  ToolInvocationOptions,
} from './types';
import { sumTokenCountsAcrossModalities } from './utils';

/**
 * Options for initializing a TelemetryHandler.
 *
 * @experimental This interface is experimental and subject to change.
 */
export interface TelemetryHandlerOptions {
  /**
   * Name of the instrumentation emitting the telemetry, used as the OpenTelemetry
   * instrumentation scope name (e.g. `'@opentelemetry/instrumentation-openai'`).
   *
   * Required so that telemetry is always attributable to the instrumentation that
   * produced it rather than to this shared utility package.
   */
  instrumentationName: string;
  /**
   * Version of the instrumentation emitting the telemetry, used as the OpenTelemetry
   * instrumentation scope version.
   */
  instrumentationVersion: string;
  /** TracerProvider instance used to create the tracer. If not provided, standard global tracer provider is used. */
  tracerProvider?: TracerProvider;
  /** MeterProvider instance used to create the meter. If not provided, standard global meter provider is used. */
  meterProvider?: MeterProvider;
  /** Diagnostic logger. */
  diag?: DiagLogger;
  /** Instrumentation configuration. */
  config?: GenAIInstrumentationConfig;
  /** Explicit content capture mode override. */
  contentCaptureMode?: ContentCaptureMode;
}

/**
 * Central lifecycle handler and façade for GenAI telemetry collection.
 *
 * @experimental This class is experimental and subject to change.
 */
export class TelemetryHandler {
  private _tracer: Tracer;
  private _meter: Meter;
  private _diag: DiagLogger;
  private _contentCaptureMode: ContentCaptureMode;
  private readonly _operationDurationHistogram: Histogram;
  private readonly _inputTokenOperationHistogram: Histogram;
  private readonly _outputTokenOperationHistogram: Histogram;
  private readonly _inputTokenUsageCounter: Counter;
  private readonly _outputTokenUsageCounter: Counter;
  private readonly _cacheReadInputTokenUsageCounter: Counter;
  private readonly _cacheWriteInputTokenUsageCounter: Counter;
  private readonly _reasoningOutputTokenUsageCounter: Counter;
  private readonly _timeToFirstChunkHistogram: Histogram;
  private readonly _timePerOutputChunkHistogram: Histogram;
  private readonly _executeToolDurationHistogram: Histogram;

  constructor(options: TelemetryHandlerOptions) {
    const { instrumentationName, instrumentationVersion } = options;

    const tracerProvider = options.tracerProvider ?? trace.getTracerProvider();
    this._tracer = tracerProvider.getTracer(
      instrumentationName,
      instrumentationVersion,
      { schemaUrl: GEN_AI_SCHEMA_URL }
    );

    const meterProvider = options.meterProvider ?? metrics.getMeterProvider();
    this._meter = meterProvider.getMeter(
      instrumentationName,
      instrumentationVersion,
      { schemaUrl: GEN_AI_SCHEMA_URL }
    );

    this._diag = options.diag ?? diag;

    if (options.contentCaptureMode) {
      this._contentCaptureMode = parseContentCaptureMode(
        options.contentCaptureMode
      );
    } else {
      this._contentCaptureMode = getContentCaptureMode(
        options.config?.captureMessageContent
      );
    }

    this._operationDurationHistogram = createDurationHistogram(this._meter);
    this._inputTokenOperationHistogram = createInputTokenOperationHistogram(
      this._meter
    );
    this._outputTokenOperationHistogram = createOutputTokenOperationHistogram(
      this._meter
    );
    this._inputTokenUsageCounter = createInputTokenUsageCounter(this._meter);
    this._outputTokenUsageCounter = createOutputTokenUsageCounter(this._meter);
    this._cacheReadInputTokenUsageCounter =
      createCacheReadInputTokenUsageCounter(this._meter);
    this._cacheWriteInputTokenUsageCounter =
      createCacheWriteInputTokenUsageCounter(this._meter);
    this._reasoningOutputTokenUsageCounter =
      createReasoningOutputTokenUsageCounter(this._meter);
    this._timeToFirstChunkHistogram = createTimeToFirstChunkHistogram(
      this._meter
    );
    this._timePerOutputChunkHistogram = createTimePerOutputChunkHistogram(
      this._meter
    );
    this._executeToolDurationHistogram = createExecuteToolDurationHistogram(
      this._meter
    );
  }

  /**
   * Return the Tracer instance.
   */
  public getTracer(): Tracer {
    return this._tracer;
  }

  /**
   * Return the Meter instance.
   */
  public getMeter(): Meter {
    return this._meter;
  }

  /**
   * Return the DiagLogger instance.
   */
  public getDiag(): DiagLogger {
    return this._diag;
  }

  /**
   * Return the active ContentCaptureMode.
   */
  public getContentCaptureMode(): ContentCaptureMode {
    return this._contentCaptureMode;
  }

  /**
   * Return whether message content (prompts, completions, tool calls) should be captured.
   */
  public shouldCaptureContent(): boolean {
    return this._contentCaptureMode !== 'none';
  }

  /**
   * Start an LLM / GenAI inference invocation.
   *
   * The returned invocation owns its span: complete it with `stop()` or `fail()`.
   */
  public startInference(
    options: InferenceInvocationOptions
  ): InferenceInvocation {
    return new InferenceInvocation(this, options);
  }

  /**
   * Start an Embedding invocation.
   *
   * The returned invocation owns its span: complete it with `stop()` or `fail()`.
   */
  public startEmbedding(
    options: EmbeddingInvocationOptions
  ): EmbeddingInvocation {
    return new EmbeddingInvocation(this, options);
  }

  /**
   * Start a Tool execution invocation.
   *
   * The returned invocation owns its span: complete it with `stop()` or `fail()`.
   */
  public startTool(options: ToolInvocationOptions): ToolInvocation {
    return new ToolInvocation(this, options);
  }

  /**
   * Record operation duration metric.
   *
   * @param durationSeconds - The duration of the operation, in seconds.
   * @param attributes - Metric attributes.
   * @param context - Context used to associate an exemplar with the
   *   measurement. Pass the invocation's context explicitly, since the
   *   measurement is often recorded after the invocation's context is no
   *   longer active. Defaults to the currently active context.
   */
  public recordOperationDuration(
    durationSeconds: number,
    attributes?: Attributes,
    context?: Context
  ): void {
    this._operationDurationHistogram.record(
      durationSeconds,
      attributes,
      context
    );
  }

  /**
   * Record the token usage metrics of a single inference operation.
   *
   * Call once per operation with its final usage. Input and output tokens are
   * recorded on both metric families defined by the semantic conventions: once
   * on the `gen_ai.client.inference.operation.*` histograms, and on the
   * `gen_ai.client.inference.usage.*` counters split by `gen_ai.token.modality`
   * Missing, zero and negative counts are skipped.
   *
   * Intended to be called by {@link InferenceInvocation} when the invocation
   * ends, with usage whose missing `inputTokens` / `outputTokens` have already
   * been inferred (from cache and reasoning tokens respectively). This method
   * does not infer them itself: if they are missing, the input / output
   * histograms and counters are not recorded.
   *
   * @param usage - Token counts of the operation.
   * @param attributes - Metric attributes. Token metrics do not define
   *   `error.type`, so leave it out even when the operation failed.
   * @param context - Context used to associate an exemplar with the
   *   measurement. Defaults to the currently active context.
   */
  public recordInferenceTokenUsage(
    usage: TokenUsage,
    attributes?: Attributes,
    context?: Context
  ): void {
    if (!usage) {
      return;
    }
    const totalInputTokensAcrossModalities = sumTokenCountsAcrossModalities(
      usage.inputTokens
    );
    const totalOutputTokensAcrossModalities = sumTokenCountsAcrossModalities(
      usage.outputTokens
    );

    if (isPositiveCount(totalInputTokensAcrossModalities)) {
      this._inputTokenOperationHistogram.record(
        totalInputTokensAcrossModalities,
        attributes,
        context
      );
    }

    if (isPositiveCount(totalOutputTokensAcrossModalities)) {
      this._outputTokenOperationHistogram.record(
        totalOutputTokensAcrossModalities,
        attributes,
        context
      );
    }

    this.recordModalityUsage(
      GEN_AI_TOKEN_MODALITY_VALUE_TEXT,
      usage,
      attributes,
      context
    );

    this.recordModalityUsage(
      GEN_AI_TOKEN_MODALITY_VALUE_AUDIO,
      usage,
      attributes,
      context
    );

    this.recordModalityUsage(
      GEN_AI_TOKEN_MODALITY_VALUE_IMAGE,
      usage,
      attributes,
      context
    );

    this.recordModalityUsage(
      GEN_AI_TOKEN_MODALITY_VALUE_UNKNOWN,
      usage,
      attributes,
      context
    );
  }

  /**
   * Record time to first chunk metric for streaming responses.
   *
   * @param durationSeconds - Time elapsed until the first chunk, in seconds.
   * @param attributes - Metric attributes.
   * @param context - Context used to associate an exemplar with the
   *   measurement. Defaults to the currently active context.
   */
  public recordTimeToFirstChunk(
    durationSeconds: number,
    attributes?: Attributes,
    context?: Context
  ): void {
    this._timeToFirstChunkHistogram.record(
      durationSeconds,
      attributes,
      context
    );
  }

  /**
   * Record time per output chunk metric for streaming responses.
   *
   * Called once per output chunk after the first, with the time elapsed since the
   * previous chunk.
   *
   * @param durationSeconds - Time elapsed between this chunk and the previous one, in
   *   seconds.
   * @param attributes - Metric attributes.
   * @param context - Context used to associate an exemplar with the
   *   measurement. Defaults to the currently active context.
   */
  public recordTimePerOutputChunk(
    durationSeconds: number,
    attributes?: Attributes,
    context?: Context
  ): void {
    this._timePerOutputChunkHistogram.record(
      durationSeconds,
      attributes,
      context
    );
  }

  /**
   * Record the `gen_ai.execute_tool.duration` metric for a single tool execution.
   *
   * @param durationSeconds - The duration of the tool execution, in seconds.
   * @param attributes - Metric attributes.
   * @param context - Context used to associate an exemplar with the
   *   measurement. Pass the invocation's context explicitly, since the
   *   measurement is often recorded after the invocation's context is no
   *   longer active. Defaults to the currently active context.
   */
  public recordExecuteToolDuration(
    durationSeconds: number,
    attributes?: Attributes,
    context?: Context
  ): void {
    this._executeToolDurationHistogram.record(
      durationSeconds,
      attributes,
      context
    );
  }

  /**
   * Record token counts across all usage counters for a specific modality.
   */
  private recordModalityUsage(
    modality: TokenModality,
    usage: TokenUsage,
    attributes?: Attributes,
    context?: Context
  ): void {
    this.recordTokenUsageForModality(
      this._inputTokenUsageCounter,
      modality,
      usage.inputTokens?.[modality],
      attributes,
      context
    );
    this.recordTokenUsageForModality(
      this._outputTokenUsageCounter,
      modality,
      usage.outputTokens?.[modality],
      attributes,
      context
    );
    this.recordTokenUsageForModality(
      this._cacheReadInputTokenUsageCounter,
      modality,
      usage.cacheReadTokens?.[modality],
      attributes,
      context
    );
    this.recordTokenUsageForModality(
      this._cacheWriteInputTokenUsageCounter,
      modality,
      usage.cacheWriteTokens?.[modality],
      attributes,
      context
    );
    this.recordTokenUsageForModality(
      this._reasoningOutputTokenUsageCounter,
      modality,
      usage.reasoningTokens?.[modality],
      attributes,
      context
    );
  }

  /**
   * Record token usage for a specific modality.
   */
  private recordTokenUsageForModality(
    tokenCounter: Counter,
    modality: TokenModality,
    count: number | undefined,
    attributes?: Attributes,
    context?: Context
  ): void {
    if (isPositiveCount(count)) {
      tokenCounter.add(
        count,
        {
          ...attributes,
          [ATTR_GEN_AI_TOKEN_MODALITY]: modality,
        },
        context
      );
    }
  }
}

/**
 * Return whether `value` is a token count to record: missing, zero and
 * negative counts are skipped.
 */
function isPositiveCount(value: number | undefined): value is number {
  return value !== undefined && value > 0;
}
