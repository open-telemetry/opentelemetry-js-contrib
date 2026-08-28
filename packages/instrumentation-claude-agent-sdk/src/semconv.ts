/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * This file contains the unstable semantic convention definitions used by
 * this package, reviewed against open-telemetry/semantic-conventions-genai at
 * 67dff024110be5bd9f318006e733f4078e0f4c97.
 *
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

export const ATTR_GEN_AI_AGENT_DESCRIPTION =
  'gen_ai.agent.description' as const;
export const ATTR_GEN_AI_AGENT_NAME = 'gen_ai.agent.name' as const;
export const ATTR_GEN_AI_CONVERSATION_ID = 'gen_ai.conversation.id' as const;
export const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages' as const;
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name' as const;
export const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages' as const;
export const ATTR_GEN_AI_OUTPUT_TYPE = 'gen_ai.output.type' as const;
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model' as const;
export const ATTR_GEN_AI_RESPONSE_FINISH_REASONS =
  'gen_ai.response.finish_reasons' as const;
export const ATTR_GEN_AI_SYSTEM_INSTRUCTIONS =
  'gen_ai.system_instructions' as const;
export const ATTR_GEN_AI_TOOL_CALL_ARGUMENTS =
  'gen_ai.tool.call.arguments' as const;
export const ATTR_GEN_AI_TOOL_CALL_ID = 'gen_ai.tool.call.id' as const;
export const ATTR_GEN_AI_TOOL_CALL_RESULT = 'gen_ai.tool.call.result' as const;
export const ATTR_GEN_AI_TOOL_NAME = 'gen_ai.tool.name' as const;
export const ATTR_GEN_AI_TOOL_TYPE = 'gen_ai.tool.type' as const;
export const ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS =
  'gen_ai.usage.cache_read.input_tokens' as const;
export const ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS =
  'gen_ai.usage.cache_write.input_tokens' as const;
export const ATTR_GEN_AI_USAGE_INPUT_TOKENS =
  'gen_ai.usage.input_tokens' as const;
export const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS =
  'gen_ai.usage.output_tokens' as const;

export const GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL = 'execute_tool' as const;
export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT = 'invoke_agent' as const;
export const GEN_AI_OUTPUT_TYPE_VALUE_JSON = 'json' as const;
export const GEN_AI_TOOL_TYPE_VALUE_EXTENSION = 'extension' as const;

export const METRIC_GEN_AI_EXECUTE_TOOL_DURATION =
  'gen_ai.execute_tool.duration' as const;
export const METRIC_GEN_AI_INVOKE_AGENT_DURATION =
  'gen_ai.invoke_agent.duration' as const;
export const METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS =
  'gen_ai.invoke_agent.tool_calls' as const;
