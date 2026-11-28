/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ATTR_GEN_AI_TOOL_CALL_ID,
  type TelemetryHandler,
} from '@opentelemetry/genai-util';

export { ATTR_GEN_AI_TOOL_CALL_ID };

// Derived from @opentelemetry/genai-util@0.5.0 until genai-util exports these
// types and semconv constants directly.
export type LocalAgentInvocation = ReturnType<
  TelemetryHandler['startLocalAgent']
>;
export type InvocationError = Parameters<LocalAgentInvocation['fail']>[0];
export type GenAIInstrumentationConfig = NonNullable<
  NonNullable<ConstructorParameters<typeof TelemetryHandler>[0]>['config']
>;
export type ContentCaptureMode = ReturnType<
  TelemetryHandler['getContentCaptureMode']
>;
export type InputMessages = Parameters<
  LocalAgentInvocation['addInputMessages']
>[0];
export type OutputMessages = Parameters<
  LocalAgentInvocation['addOutputMessages']
>[0];
export type SystemInstructions = Parameters<
  LocalAgentInvocation['setSystemInstructions']
>[0];
export type ToolDefinitions = Parameters<
  LocalAgentInvocation['setToolDefinitions']
>[0];
export type FinishReason = Parameters<
  LocalAgentInvocation['setFinishReasons']
>[0][number];
export type ChatMessage = InputMessages[number];
export type MessagePart = ChatMessage['parts'][number];

export interface LocalAgentRequestOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export const ATTR_GEN_AI_AGENT_DESCRIPTION = 'gen_ai.agent.description';
export const ATTR_GEN_AI_AGENT_NAME = 'gen_ai.agent.name';
export const ATTR_GEN_AI_CONVERSATION_ID = 'gen_ai.conversation.id';
export const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages';
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
export const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages';
export const ATTR_GEN_AI_OUTPUT_TYPE = 'gen_ai.output.type';
export const ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY =
  'gen_ai.request.frequency_penalty';
export const ATTR_GEN_AI_REQUEST_MAX_TOKENS = 'gen_ai.request.max_tokens';
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model';
export const ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY =
  'gen_ai.request.presence_penalty';
export const ATTR_GEN_AI_REQUEST_TEMPERATURE = 'gen_ai.request.temperature';
export const ATTR_GEN_AI_REQUEST_TOP_P = 'gen_ai.request.top_p';
export const ATTR_GEN_AI_RESPONSE_FINISH_REASONS =
  'gen_ai.response.finish_reasons';
export const ATTR_GEN_AI_RESPONSE_MODEL = 'gen_ai.response.model';
export const ATTR_GEN_AI_SYSTEM_INSTRUCTIONS = 'gen_ai.system_instructions';
export const ATTR_GEN_AI_TOOL_CALL_ARGUMENTS = 'gen_ai.tool.call.arguments';
export const ATTR_GEN_AI_TOOL_CALL_RESULT = 'gen_ai.tool.call.result';
export const ATTR_GEN_AI_TOOL_DEFINITIONS = 'gen_ai.tool.definitions';
export const ATTR_GEN_AI_TOOL_DESCRIPTION = 'gen_ai.tool.description';
export const ATTR_GEN_AI_TOOL_NAME = 'gen_ai.tool.name';
export const ATTR_GEN_AI_TOOL_TYPE = 'gen_ai.tool.type';
export const ATTR_GEN_AI_TRANSFER_MODE = 'gen_ai.transfer.mode';
export const ATTR_GEN_AI_TRANSFER_TARGET_NAME = 'gen_ai.transfer.target.name';
export const ATTR_GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens';
export const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens';

export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_RUNNER = 'invoke_runner';
export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW = 'invoke_workflow';
export const GEN_AI_OUTPUT_TYPE_VALUE_JSON = 'json';
export const GEN_AI_TOOL_TYPE_VALUE_FUNCTION = 'function';
export const GEN_AI_TRANSFER_MODE_VALUE_PASS_CONTROL = 'pass_control';
export const GEN_AI_TRANSFER_MODE_VALUE_RETURN_TO_CALLER = 'return_to_caller';

export const METRIC_GEN_AI_EXECUTE_TOOL_DURATION =
  'gen_ai.execute_tool.duration';
export const METRIC_GEN_AI_INVOKE_AGENT_DURATION =
  'gen_ai.invoke_agent.duration';
export const METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS =
  'gen_ai.invoke_agent.inference_calls';
export const METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS =
  'gen_ai.invoke_agent.tool_calls';
