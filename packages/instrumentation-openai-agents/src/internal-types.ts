/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OpenAIAgentsTrace {
  traceId: string;
  name?: string;
  groupId?: string | null;
}

export interface OpenAIAgentsSpanError {
  message: string;
  data?: Record<string, unknown>;
}

export interface OpenAIAgentsUsageData {
  input_tokens?: number;
  output_tokens?: number;
}

export interface OpenAIAgentsSpanData {
  type: string;
  name?: string;
  input?: unknown;
  output?: unknown;
  output_type?: string;
  usage?: OpenAIAgentsUsageData;
  model?: string;
  model_config?: Record<string, unknown>;
  from_agent?: string;
  to_agent?: string;
  _input?: unknown;
  _response?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenAIAgentsSpan {
  traceId: string;
  spanId: string;
  parentId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  error?: OpenAIAgentsSpanError | null;
  spanData: OpenAIAgentsSpanData;
}

export interface OpenAIAgentsToolLike {
  type?: string;
  name?: string;
  description?: string;
  parameters?: unknown;
}

export interface OpenAIAgentsAgentLike {
  name?: string;
  handoffDescription?: string;
  model?: unknown;
  tools?: unknown[];
}

export interface OpenAIAgentsToolCallDetails {
  toolCall?: {
    callId?: string;
    id?: string;
    name?: string;
  };
}

export type OpenAIAgentsWithTrace = (
  trace: string | OpenAIAgentsTrace,
  fn: (trace: OpenAIAgentsTrace) => Promise<unknown>,
  options?: unknown
) => Promise<unknown>;

export type OpenAIAgentsGetOrCreateTrace = (
  fn: () => Promise<unknown>,
  options?: unknown
) => Promise<unknown>;

export type OpenAIAgentsGetCurrentTrace = () => OpenAIAgentsTrace | null;
export type OpenAIAgentsGetCurrentSpan = () => { spanId?: string } | null;

export interface OpenAIAgentsTracingProcessor {
  onTraceStart(trace: OpenAIAgentsTrace): Promise<void>;
  onTraceEnd(trace: OpenAIAgentsTrace): Promise<void>;
  onSpanStart(span: OpenAIAgentsSpan): Promise<void>;
  onSpanEnd(span: OpenAIAgentsSpan): Promise<void>;
  shutdown(timeout?: number): Promise<void>;
  forceFlush(): Promise<void>;
}

export type OpenAIAgentsRun = (...args: unknown[]) => Promise<unknown>;

export interface OpenAIAgentsRunnerInstance {
  on?(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface OpenAIAgentsRunnerConstructor {
  new (...args: never[]): unknown;
  prototype: {
    run: OpenAIAgentsRun;
  };
}

export interface OpenAIAgentsModule {
  Runner: OpenAIAgentsRunnerConstructor;
  withTrace: OpenAIAgentsWithTrace;
  getOrCreateTrace: OpenAIAgentsGetOrCreateTrace;
  getCurrentTrace: OpenAIAgentsGetCurrentTrace;
  getCurrentSpan?: OpenAIAgentsGetCurrentSpan;
  addTraceProcessor(processor: OpenAIAgentsTracingProcessor): void;
  setTraceProcessors(processors: OpenAIAgentsTracingProcessor[]): void;
  setDefaultOpenAITracingExporter?(): void;
}
