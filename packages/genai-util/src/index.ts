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
 * @example
 * ```typescript
 * // In this file: index.ts
 * export { TelemetryHandler } from './handler';
 * export { InferenceInvocation } from './invocations';
 * export type { InferenceInvocationOptions } from './types';
 * export * from './semconv';
 * ```
 */

export type {
  BlobPart,
  ChatMessage,
  InputMessages,
  MessagePart,
  OutputMessages,
  SystemInstructions,
} from './types';
export {
  formatInputMessages,
  formatOutputMessages,
  formatSystemInstructions,
} from './utils';
export { BaseInvocation } from './invocations/base';
export { TelemetryHandler } from './handler';
export {
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
} from './semconv';
