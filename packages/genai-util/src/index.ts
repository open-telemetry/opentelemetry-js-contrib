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
export type { ToolInvocation } from './invocations/tool';
export type {
  ChatMessage,
  ContentCaptureMode,
  FinishReason,
  GenAIInstrumentationConfig,
  InputMessages,
  InvocationError,
  LocalAgentRequestOptions,
  MessagePart,
  OutputMessage,
  OutputMessages,
  SystemInstructions,
  ToolDefinition,
  ToolDefinitions,
  TransferMode,
} from './types';
export {
  ATTR_GEN_AI_AGENT_DESCRIPTION,
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_DEFINITIONS,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_TRANSFER_MODE,
  ATTR_GEN_AI_TRANSFER_TARGET_NAME,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_RUNNER,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
  GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
  GEN_AI_TRANSFER_MODE_VALUE_PASS_CONTROL,
  GEN_AI_TRANSFER_MODE_VALUE_RETURN_TO_CALLER,
  METRIC_GEN_AI_EXECUTE_TOOL_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS,
  METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS,
} from './semconv';
