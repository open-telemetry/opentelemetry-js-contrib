/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Span, Tracer, TracerProvider } from '@opentelemetry/api';
import type { StreamChunk } from '@tanstack/ai';
import type {
  InferenceInvocation,
  ToolInvocation,
} from '@opentelemetry/genai-util';

/**
 * Options for the TanStack AI OpenTelemetry middleware.
 */
export interface OpenTelemetryTanStackAIMiddlewareOptions {
  /**
   * Tracer to use for creating root spans.
   */
  tracer?: Tracer;
  /**
   * TracerProvider instance.
   */
  tracerProvider?: TracerProvider;
  /**
   * Name of the agent to record on agent and tool spans (`gen_ai.agent.name`).
   * Defaults to `'TanStackAI'`.
   */
  agentName?: string;
  /**
   * Whether to capture message content, tool arguments, and tool results.
   * When set, overrides `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`.
   * When unset, the environment variable decides (defaults to false / none).
   */
  captureContent?: boolean;
}

export type UsageInfo = NonNullable<
  Extract<StreamChunk, { type: 'RUN_FINISHED' }>['usage']
>;

export interface OutputToolCallInfo {
  id: string;
  name: string;
  arguments: string;
}

export interface CurrentLLMSpanState {
  invocation: InferenceInvocation;
  outputText: string;
  outputToolCalls: Map<string, OutputToolCallInfo>;
}

export interface RequestState {
  chatSpan: Span;
  toolInvocations: Map<string, ToolInvocation>;
  toolsByCallId: Map<string, object>;
  currentLLM?: CurrentLLMSpanState;
}
