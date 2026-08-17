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
  FetchResponseInvocation,
  InferenceInvocation,
  RetrievalInvocation,
  ToolInvocation,
  WorkflowInvocation,
} from './invocations';
import {
  createDurationHistogram,
  createServerTimeToFirstTokenHistogram,
  createTokenUsageHistogram,
  recordOperationDuration,
  recordServerTimeToFirstToken,
  recordTokenUsage,
} from './metrics';
import {
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
  GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
} from './semconv';
import { wrapAsyncStream, type AsyncStreamWrapperOptions } from './stream';
import type {
  AgentInvocationOptions,
  CompletionHook,
  ContentCaptureMode,
  EmbeddingInvocationOptions,
  FetchResponseInvocationOptions,
  GenAIInstrumentationConfig,
  InferenceInvocationOptions,
  RemoteAgentInvocationOptions,
  RetrievalInvocationOptions,
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
   * Set or update the Meter instance and initialize histograms.
   */
  public setMeter(meter: Meter): this {
    this._meter = meter;
    this._initMetrics(meter);
    return this;
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
   * Return the CompletionHookManager.
   */
  public getCompletionHookManager(): CompletionHookManager {
    return this._hookManager;
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

    return new ToolInvocation(span, options);
  }

  /**
   * Start an Agent invocation (defaults to local in-process agent with SpanKind.INTERNAL).
   */
  public startAgent(options: AgentInvocationOptions = {}): AgentInvocation {
    const name = options.agentName ?? options.agentId;
    const spanName = name
      ? `${GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT} ${name}`
      : GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT;

    const span = this._tracer.startSpan(
      spanName,
      {
        kind: SpanKind.INTERNAL,
      },
      options.parentContext
    );

    return new AgentInvocation(span, this, options);
  }

  /**
   * Start a local in-process Agent invocation (INTERNAL span kind).
   */
  public startLocalAgent(
    options: AgentInvocationOptions = {}
  ): AgentInvocation {
    return this.startAgent(options);
  }

  /**
   * Start a remote Agent invocation (CLIENT span kind).
   */
  public startRemoteAgent(
    options: RemoteAgentInvocationOptions
  ): AgentInvocation {
    const name = options.agentName ?? options.agentId;
    const spanName = name
      ? `${GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT} ${name}`
      : GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT;

    const span = this._tracer.startSpan(
      spanName,
      {
        kind: SpanKind.CLIENT,
      },
      options.parentContext
    );

    return new AgentInvocation(span, this, options);
  }

  /**
   * Start a Workflow invocation.
   */
  public startWorkflow(options: WorkflowInvocationOptions): WorkflowInvocation {
    const spanName = options.workflowName
      ? `${GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW} ${options.workflowName}`
      : GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW;

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
   * Start a Retrieval invocation (for RAG / vector database lookups).
   */
  public startRetrieval(
    options: RetrievalInvocationOptions
  ): RetrievalInvocation {
    const spanName = options.dataSourceId
      ? `${GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL} ${options.dataSourceId}`
      : GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL;

    const span = this._tracer.startSpan(
      spanName,
      {
        kind: SpanKind.CLIENT,
      },
      options.parentContext
    );

    return new RetrievalInvocation(span, this, options);
  }

  /**
   * Start a Fetch Response invocation (for polling or retrieving earlier generated responses).
   */
  public startFetchResponse(
    options: FetchResponseInvocationOptions
  ): FetchResponseInvocation {
    const span = this._tracer.startSpan(
      GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE,
      {
        kind: SpanKind.CLIENT,
      },
      options.parentContext
    );

    return new FetchResponseInvocation(span, this, options);
  }

  /**
   * Record operation duration metric.
   */
  public recordOperationDuration(
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
  public recordTokenUsage(usage: TokenUsage, attributes?: Attributes): void {
    recordTokenUsage(this._tokenUsageHistogram, usage, attributes);
  }

  /**
   * Record server time to first token metric for streaming responses.
   */
  public recordServerTimeToFirstToken(
    durationSeconds: number,
    attributes?: Attributes
  ): void {
    recordServerTimeToFirstToken(
      this._timeToFirstTokenHistogram,
      durationSeconds,
      attributes
    );
  }

  /**
   * Wrap an async stream / iterable with telemetry collection.
   */
  public wrapAsyncStream<TStream extends AsyncIterable<any>>(
    stream: TStream,
    optionsOrInvocation?:
      | AsyncStreamWrapperOptions<
          TStream extends AsyncIterable<infer TChunk> ? TChunk : any
        >
      | InferenceInvocation
      | AgentInvocation
  ): TStream {
    return wrapAsyncStream(stream, optionsOrInvocation);
  }
}
