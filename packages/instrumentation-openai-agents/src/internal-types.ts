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

export interface OpenAIAgentsTracingProcessor {
  onTraceStart(trace: OpenAIAgentsTrace): Promise<void>;
  onTraceEnd(trace: OpenAIAgentsTrace): Promise<void>;
  onSpanStart(span: OpenAIAgentsSpan): Promise<void>;
  onSpanEnd(span: OpenAIAgentsSpan): Promise<void>;
  shutdown(timeout?: number): Promise<void>;
  forceFlush(): Promise<void>;
}

export interface OpenAIAgentsModule {
  addTraceProcessor(processor: OpenAIAgentsTracingProcessor): void;
  setTraceProcessors(processors: OpenAIAgentsTracingProcessor[]): void;
  setDefaultOpenAITracingExporter?(): void;
}
