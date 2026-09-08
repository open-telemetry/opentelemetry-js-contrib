/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  diag,
  trace,
  type Attributes,
  type DiagLogger,
  type Histogram,
  type Meter,
  type Tracer,
} from '@opentelemetry/api';
import { CompletionHookManager } from './completion-hook';
import {
  getContentCaptureMode,
  parseContentCaptureMode,
} from './environment-variables';
import {
  createDurationHistogram,
  createServerTimeToFirstTokenHistogram,
  createTimeToFirstChunkHistogram,
  createTokenUsageHistogram,
} from './metrics';
import {
  ATTR_GEN_AI_TOKEN_TYPE,
  GEN_AI_TOKEN_TYPE_VALUE_INPUT,
  GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
} from './semconv';
import type {
  CompletionHook,
  ContentCaptureMode,
  GenAIInstrumentationConfig,
  TokenUsage,
} from './types';

/**
 * Options for initializing a TelemetryHandler.
 *
 * @experimental This interface is experimental and subject to change.
 */
export interface TelemetryHandlerOptions {
  /** Tracer instance. If not provided, standard global tracer is used. */
  tracer?: Tracer;
  /** Meter instance for emitting metrics. */
  meter?: Meter;
  /** Diagnostic logger. */
  diag?: DiagLogger;
  /** Instrumentation configuration. */
  config?: GenAIInstrumentationConfig;
  /** Explicit content capture mode override. */
  contentCaptureMode?: ContentCaptureMode;
  /** Registered completion hooks. */
  completionHooks?: CompletionHook[];
}

/**
 * Central lifecycle handler and façade for GenAI telemetry collection.
 *
 * @experimental This class is experimental and subject to change.
 */
export class TelemetryHandler {
  private _tracer: Tracer;
  private _meter?: Meter;
  private _diag: DiagLogger;
  private _contentCaptureMode: ContentCaptureMode;
  private readonly _hookManager: CompletionHookManager;
  private _operationDurationHistogram?: Histogram;
  private _tokenUsageHistogram?: Histogram;
  private _timeToFirstChunkHistogram?: Histogram;
  private _timeToFirstTokenHistogram?: Histogram;

  constructor(options: TelemetryHandlerOptions = {}) {
    this._tracer =
      options.tracer ?? trace.getTracer('@opentelemetry/genai-util');
    this._meter = options.meter;
    this._diag = options.diag ?? diag;
    this._hookManager = new CompletionHookManager(
      options.completionHooks ?? options.config?.completionHooks ?? []
    );

    if (options.contentCaptureMode) {
      this._contentCaptureMode = parseContentCaptureMode(
        options.contentCaptureMode
      );
    } else {
      this._contentCaptureMode = getContentCaptureMode(
        options.config?.captureMessageContent
      );
    }

    if (this._meter) {
      this._initMetrics(this._meter);
    }
  }

  private _initMetrics(meter: Meter): void {
    this._operationDurationHistogram = createDurationHistogram(meter);
    this._tokenUsageHistogram = createTokenUsageHistogram(meter);
    this._timeToFirstChunkHistogram = createTimeToFirstChunkHistogram(meter);
    this._timeToFirstTokenHistogram =
      createServerTimeToFirstTokenHistogram(meter);
  }

  /**
   * Set or update the Tracer instance.
   */
  public setTracer(tracer: Tracer): this {
    this._tracer = tracer;
    return this;
  }

  /**
   * Return the Tracer instance.
   */
  public getTracer(): Tracer {
    return this._tracer;
  }

  /**
   * Set or update the Meter instance and initialize histograms.
   */
  public setMeter(meter: Meter): this {
    this._meter = meter;
    this._initMetrics(meter);
    return this;
  }

  /**
   * Return the Meter instance if set.
   */
  public getMeter(): Meter | undefined {
    return this._meter;
  }

  /**
   * Register a completion hook.
   */
  public addCompletionHook(hook: CompletionHook): this {
    this._hookManager.addHook(hook);
    return this;
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
   *
   * Content should be captured when the content capture mode is enabled (e.g. `'span_only'`)
   * or when at least one completion hook is registered.
   */
  public shouldCaptureContent(): boolean {
    return (
      this._contentCaptureMode !== 'none' ||
      this._hookManager.getHooks().length > 0
    );
  }

  /**
   * Return the CompletionHookManager.
   */
  public getCompletionHookManager(): CompletionHookManager {
    return this._hookManager;
  }

  /**
   * Record operation duration metric.
   */
  public recordOperationDuration(
    durationSeconds: number,
    attributes?: Attributes
  ): void {
    if (
      !this._operationDurationHistogram ||
      durationSeconds < 0 ||
      !isFinite(durationSeconds)
    ) {
      return;
    }
    this._operationDurationHistogram.record(durationSeconds, attributes);
  }

  /**
   * Record token usage metric.
   */
  public recordTokenUsage(usage: TokenUsage, attributes?: Attributes): void {
    if (!this._tokenUsageHistogram || !usage) {
      return;
    }

    if (
      typeof usage.inputTokens === 'number' &&
      Number.isFinite(usage.inputTokens) &&
      usage.inputTokens >= 0
    ) {
      this._tokenUsageHistogram.record(usage.inputTokens, {
        ...attributes,
        [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
      });
    }

    if (
      typeof usage.outputTokens === 'number' &&
      Number.isFinite(usage.outputTokens) &&
      usage.outputTokens >= 0
    ) {
      this._tokenUsageHistogram.record(usage.outputTokens, {
        ...attributes,
        [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
      });
    }
  }

  /**
   * Record time to first chunk metric for streaming responses.
   */
  public recordTimeToFirstChunk(
    durationSeconds: number,
    attributes?: Attributes
  ): void {
    if (
      !this._timeToFirstChunkHistogram ||
      durationSeconds < 0 ||
      !isFinite(durationSeconds)
    ) {
      return;
    }
    this._timeToFirstChunkHistogram.record(durationSeconds, attributes);
  }

  /**
   * Record server time to first token metric for streaming responses.
   */
  public recordServerTimeToFirstToken(
    durationSeconds: number,
    attributes?: Attributes
  ): void {
    if (
      !this._timeToFirstTokenHistogram ||
      durationSeconds < 0 ||
      !isFinite(durationSeconds)
    ) {
      return;
    }
    this._timeToFirstTokenHistogram.record(durationSeconds, attributes);
  }
}
