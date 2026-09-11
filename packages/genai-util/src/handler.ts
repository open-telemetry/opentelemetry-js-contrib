/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  diag,
  metrics,
  trace,
  type Attributes,
  type DiagLogger,
  type Histogram,
  type Meter,
  type MeterProvider,
  type Tracer,
  type TracerProvider,
} from '@opentelemetry/api';
import { CompletionHookManager } from './completion-hook';
import {
  getContentCaptureMode,
  parseContentCaptureMode,
} from './environment-variables';
import {
  createDurationHistogram,
  createTimePerOutputChunkHistogram,
  createTimeToFirstChunkHistogram,
  createTokenUsageHistogram,
} from './metrics';
import {
  ATTR_GEN_AI_TOKEN_TYPE,
  GEN_AI_SCHEMA_URL,
  GEN_AI_TOKEN_TYPE_VALUE_INPUT,
  GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
} from './semconv';
import type {
  CompletionHook,
  ContentCaptureMode,
  GenAIInstrumentationConfig,
  TokenUsage,
} from './types';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

/**
 * Options for initializing a TelemetryHandler.
 *
 * @experimental This interface is experimental and subject to change.
 */
export interface TelemetryHandlerOptions {
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
  private _meter: Meter;
  private _diag: DiagLogger;
  private _contentCaptureMode: ContentCaptureMode;
  private readonly _hookManager: CompletionHookManager;
  private _operationDurationHistogram?: Histogram;
  private _tokenUsageHistogram?: Histogram;
  private _timeToFirstChunkHistogram?: Histogram;
  private _timePerOutputChunkHistogram?: Histogram;

  constructor(options: TelemetryHandlerOptions = {}) {
    const tracerProvider = options.tracerProvider ?? trace.getTracerProvider();
    this._tracer = tracerProvider.getTracer(PACKAGE_NAME, PACKAGE_VERSION, {
      schemaUrl: GEN_AI_SCHEMA_URL,
    });

    const meterProvider = options.meterProvider ?? metrics.getMeterProvider();
    this._meter = meterProvider.getMeter(PACKAGE_NAME, PACKAGE_VERSION, {
      schemaUrl: GEN_AI_SCHEMA_URL,
    });

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

    this._initMetrics(this._meter);
  }

  private _initMetrics(meter: Meter): void {
    this._operationDurationHistogram = createDurationHistogram(meter);
    this._tokenUsageHistogram = createTokenUsageHistogram(meter);
    this._timeToFirstChunkHistogram = createTimeToFirstChunkHistogram(meter);
    this._timePerOutputChunkHistogram =
      createTimePerOutputChunkHistogram(meter);
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
   * Record time per output chunk metric for streaming responses.
   */
  public recordTimePerOutputChunk(
    durationSeconds: number,
    attributes?: Attributes
  ): void {
    if (
      !this._timePerOutputChunkHistogram ||
      durationSeconds < 0 ||
      !isFinite(durationSeconds)
    ) {
      return;
    }
    this._timePerOutputChunkHistogram.record(durationSeconds, attributes);
  }
}
