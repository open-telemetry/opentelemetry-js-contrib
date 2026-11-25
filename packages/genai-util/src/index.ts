/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * NOTE FOR CONTRIBUTORS:
 * This package follows an incremental export policy during its incubation phase.
 * We deliberately keep internal helpers, utilities, and experimental abstractions private.
 *
 * If your instrumentation requires an unexported function, type, or class from this library:
 * 1. Add the specific named export to this file in your instrumentation PR.
 * 2. Ensure the API is generic across GenAI libraries, not tailored to a single SDK.
 *
 * Invocations are created through the {@link TelemetryHandler} factory methods
 * (`startInference`, `startEmbedding`, `startTool`, `startLocalAgent`, `startRemoteAgent`),
 * so export the invocation classes with `export type` when consumers need to name the
 * returned type: that keeps the type usable in annotations without exposing a constructor
 * that would bypass the handler.
 *
 * @example
 * ```typescript
 * // In this file: index.ts
 * export { TelemetryHandler } from './handler';
 * export type { InferenceInvocation } from './invocations/inference';
 * export type { InferenceInvocationOptions } from './types';
 * export * from './semconv';
 * ```
 */
export { TelemetryHandler } from './handler';
export type { LocalAgentInvocation } from './invocations/agent';
export type { EmbeddingInvocation } from './invocations/embedding';
export type { InferenceInvocation } from './invocations/inference';
export type { ToolInvocation } from './invocations/tool';
export type {
  ChatMessage,
  FinishReason,
  GenAIInstrumentationConfig,
  InferenceRequestOptions,
  InputMessages,
  LocalAgentRequestOptions,
  MessagePart,
  Modality,
  OutputMessage,
  OutputMessages,
  SystemInstructions,
  TokenUsageDetails,
} from './types';
export {
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_TOOL_CALL_ID,
  GEN_AI_FINISH_REASON_VALUE_CONTENT_FILTER,
  GEN_AI_FINISH_REASON_VALUE_ERROR,
  GEN_AI_FINISH_REASON_VALUE_LENGTH,
  GEN_AI_FINISH_REASON_VALUE_STOP,
  GEN_AI_FINISH_REASON_VALUE_TOOL_CALL,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
  GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
  GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_INFERENCE,
  GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_COHERE,
  GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI,
  GEN_AI_PROVIDER_NAME_VALUE_GROQ,
  GEN_AI_PROVIDER_NAME_VALUE_IBM_WATSONX_AI,
  GEN_AI_PROVIDER_NAME_VALUE_MISTRAL,
  GEN_AI_PROVIDER_NAME_VALUE_MOONSHOT_AI,
  GEN_AI_PROVIDER_NAME_VALUE_OLLAMA,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_PERPLEXITY,
  GEN_AI_PROVIDER_NAME_VALUE_X_AI,
  GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
} from './semconv';
