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
 * 3. Remove the temporary "packages/genai-util" entry override from the root `knip.jsonc` file.
 *
 * Invocations are created through the {@link TelemetryHandler} factory methods
 * (`startInference`, `startEmbedding`, `startTool`), so export the invocation classes with
 * `export type` when consumers need to name the returned type: that keeps the type usable
 * in annotations without exposing a constructor that would bypass the handler.
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
export type { TelemetryHandlerOptions } from './handler';

export type { InferenceInvocation } from './invocations/inference';
export type { EmbeddingInvocation } from './invocations/embedding';
export type { ToolInvocation } from './invocations/tool';

export type {
  ContentCaptureMode,
  EmbeddingInvocationOptions,
  GenAIInstrumentationConfig,
  InferenceInvocationOptions,
  InferenceRequestOptions,
  InputMessages,
  InvocationError,
  OutputMessages,
  TokenUsageDetails,
  ToolInvocationOptions,
} from './types';

export {
  ENV_GENAI_CAPTURE_MESSAGE_CONTENT,
  getContentCaptureMode,
  parseContentCaptureMode,
} from './environment-variables';

export { getErrorType } from './utils';

// `export *` covers ATTR_GEN_AI_TOOL_CALL_ID (used by instrumentation-langchain)
// and the rest of the GenAI semconv surface.
export * from './semconv';
