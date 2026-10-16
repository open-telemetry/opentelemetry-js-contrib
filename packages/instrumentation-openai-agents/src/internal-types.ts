/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OpenAIAgentsTrace {
  traceId: string;
  name?: string;
}

export interface OpenAIAgentsSpanError {
  message: string;
  data?: Record<string, unknown>;
}

export interface OpenAIAgentsSpanData {
  type: string;
  name?: string;
  input?: unknown;
  output?: unknown;
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

export interface OpenAIAgentsTracingProcessor {
  onTraceStart(trace: OpenAIAgentsTrace): Promise<void>;
  onTraceEnd(trace: OpenAIAgentsTrace): Promise<void>;
  onSpanStart(span: OpenAIAgentsSpan): Promise<void>;
  onSpanEnd(span: OpenAIAgentsSpan): Promise<void>;
  shutdown(timeout?: number): Promise<void>;
  forceFlush(): Promise<void>;
}

export type OpenAIAgentsRun = (...args: unknown[]) => Promise<unknown>;

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
  addTraceProcessor(processor: OpenAIAgentsTracingProcessor): void;
  setTraceProcessors(processors: OpenAIAgentsTracingProcessor[]): void;
  setDefaultOpenAITracingExporter?(): void;
}
