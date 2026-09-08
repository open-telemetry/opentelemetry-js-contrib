/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SpanKind,
  diag,
  metrics,
  trace,
  type Attributes,
  type Context,
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
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
} from './semconv';
import type {
  ContentCaptureMode,
  EmbeddingInvocationOptions,
  GenAIInstrumentationConfig,
  InferenceInvocationOptions,
  TokenUsage,
  ToolInvocationOptions,
} from './types';
import { getSpanName } from './utils';

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
  private readonly _tokenUsageHistogram: Histogram;
  private readonly _timeToFirstChunkHistogram: Histogram;
  private readonly _timePerOutputChunkHistogram: Histogram;

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
    this._tokenUsageHistogram = createTokenUsageHistogram(this._meter);
    this._timeToFirstChunkHistogram = createTimeToFirstChunkHistogram(
      this._meter
    );
    this._timePerOutputChunkHistogram = createTimePerOutputChunkHistogram(
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
   */
  public startInference(
    options: InferenceInvocationOptions
  ): InferenceInvocation {
    const spanName = getSpanName(
      options.operationName ?? GEN_AI_OPERATION_NAME_VALUE_CHAT,
      options.requestModel
    );

    const span = this._tracer.startSpan(
      spanName,
      {
        kind: SpanKind.CLIENT,
      },
      options.parentContext
    );

    return new InferenceInvocation(span, this, options);
  }

  /**
   * Start an Embedding invocation.
   */
  public startEmbedding(
    options: EmbeddingInvocationOptions
  ): EmbeddingInvocation {
    const spanName = getSpanName(
      GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
      options.requestModel
    );

    const span = this._tracer.startSpan(
      spanName,
      {
        kind: SpanKind.CLIENT,
      },
      options.parentContext
    );

    return new EmbeddingInvocation(span, this, options);
  }

  /**
   * Start a Tool execution invocation.
   */
  public startTool(options: ToolInvocationOptions): ToolInvocation {
    const spanName = `${GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL} ${options.toolName}`;

    const span = this._tracer.startSpan(
      spanName,
      {
        kind: SpanKind.INTERNAL,
      },
      options.parentContext
    );

    return new ToolInvocation(span, options, this);
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
    if (durationSeconds < 0 || !isFinite(durationSeconds)) {
      return;
    }
    this._operationDurationHistogram.record(
      durationSeconds,
      attributes,
      context
    );
  }

  /**
   * Record token usage metric.
   *
   * @param usage - Input and output token counts.
   * @param attributes - Metric attributes.
   * @param context - Context used to associate an exemplar with the
   *   measurement. Defaults to the currently active context.
   */
  public recordTokenUsage(
    usage: TokenUsage,
    attributes?: Attributes,
    context?: Context
  ): void {
    if (!usage) {
      return;
    }

    if (usage.inputTokens !== undefined && usage.inputTokens > 0) {
      this._tokenUsageHistogram.record(
        usage.inputTokens,
        {
          ...attributes,
          [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
        },
        context
      );
    }

    if (usage.outputTokens !== undefined && usage.outputTokens > 0) {
      this._tokenUsageHistogram.record(
        usage.outputTokens,
        {
          ...attributes,
          [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
        },
        context
      );
    }
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
   * @param durationSeconds - Average time between output chunks, in seconds.
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
}
