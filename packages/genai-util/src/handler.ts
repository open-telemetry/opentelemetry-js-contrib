/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  diag,
  SpanKind,
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
  AgentInvocation,
  EmbeddingInvocation,
  InferenceInvocation,
  ToolInvocation,
  WorkflowInvocation,
} from './invocations';
import {
  createDurationHistogram,
  createTokenUsageHistogram,
  recordOperationDuration,
  recordTokenUsage,
} from './metrics';
import type {
  AgentInvocationOptions,
  CompletionHook,
  ContentCaptureMode,
  EmbeddingInvocationOptions,
  GenAIInstrumentationConfig,
  InferenceInvocationOptions,
  TokenUsage,
  ToolInvocationOptions,
  WorkflowInvocationOptions,
} from './types';
import { getSpanName } from './utils';

/**
 * Options for initializing a TelemetryHandler.
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
 */
export class TelemetryHandler {
  private _tracer: Tracer;
  private _meter?: Meter;
  private _diag: DiagLogger;
  private _contentCaptureMode: ContentCaptureMode;
  private readonly _hookManager: CompletionHookManager;
  private _operationDurationHistogram?: Histogram;
  private _tokenUsageHistogram?: Histogram;

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
  }

  /**
   * Set or update the Tracer instance.
   */
  setTracer(tracer: Tracer): this {
    this._tracer = tracer;
    return this;
  }

  /**
   * Set or update the Meter instance and initialize histograms.
   */
  setMeter(meter: Meter): this {
    this._meter = meter;
    this._initMetrics(meter);
    return this;
  }

  /**
   * Register a completion hook.
   */
  addCompletionHook(hook: CompletionHook): this {
    this._hookManager.addHook(hook);
    return this;
  }

  /**
   * Return the DiagLogger instance.
   */
  getDiag(): DiagLogger {
    return this._diag;
  }

  /**
   * Return the active ContentCaptureMode.
   */
  getContentCaptureMode(): ContentCaptureMode {
    return this._contentCaptureMode;
  }

  /**
   * Return the CompletionHookManager.
   */
  getCompletionHookManager(): CompletionHookManager {
    return this._hookManager;
  }

  /**
   * Start an LLM / GenAI inference invocation.
   */
  startInference(options: InferenceInvocationOptions): InferenceInvocation {
    const spanName = getSpanName(
      options.operationName ?? 'chat',
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
  startEmbedding(options: EmbeddingInvocationOptions): EmbeddingInvocation {
    const spanName = getSpanName('embeddings', options.requestModel);

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
  startTool(options: ToolInvocationOptions): ToolInvocation {
    const spanName = `execute_tool ${options.toolName}`;

    const span = this._tracer.startSpan(
      spanName,
      {
        kind: SpanKind.INTERNAL,
      },
      options.parentContext
    );

    return new ToolInvocation(span, options);
  }

  /**
   * Start an Agent invocation.
   */
  startAgent(options: AgentInvocationOptions): AgentInvocation {
    const name = options.agentName ?? options.agentId;
    const spanName = name ? `invoke_agent ${name}` : 'invoke_agent';

    const span = this._tracer.startSpan(
      spanName,
      {
        kind: SpanKind.INTERNAL,
      },
      options.parentContext
    );

    return new AgentInvocation(span, options);
  }

  /**
   * Start a Workflow invocation.
   */
  startWorkflow(options: WorkflowInvocationOptions): WorkflowInvocation {
    const spanName = options.workflowName
      ? `invoke_workflow ${options.workflowName}`
      : 'invoke_workflow';

    const span = this._tracer.startSpan(
      spanName,
      {
        kind: SpanKind.INTERNAL,
      },
      options.parentContext
    );

    return new WorkflowInvocation(span, options);
  }

  /**
   * Record operation duration metric.
   */
  recordOperationDuration(
    durationSeconds: number,
    attributes?: Attributes
  ): void {
    recordOperationDuration(
      this._operationDurationHistogram,
      durationSeconds,
      attributes
    );
  }

  /**
   * Record token usage metric.
   */
  recordTokenUsage(usage: TokenUsage, attributes?: Attributes): void {
    recordTokenUsage(this._tokenUsageHistogram, usage, attributes);
  }
}
