/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// These GenAI agent attributes are experimental and are kept local until the
// semantic-conventions package exports the complete agent span convention.
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name' as const;
export const ATTR_GEN_AI_WORKFLOW_NAME = 'gen_ai.workflow.name' as const;
export const ATTR_GEN_AI_AGENT_NAME = 'gen_ai.agent.name' as const;
export const ATTR_GEN_AI_TOOL_NAME = 'gen_ai.tool.name' as const;
export const ATTR_GEN_AI_TOOL_TYPE = 'gen_ai.tool.type' as const;
export const ATTR_GEN_AI_TOOL_CALL_ARGUMENTS =
  'gen_ai.tool.call.arguments' as const;
export const ATTR_GEN_AI_TOOL_CALL_RESULT = 'gen_ai.tool.call.result' as const;

export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW =
  'invoke_workflow' as const;
export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT = 'invoke_agent' as const;
export const GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL = 'execute_tool' as const;
export const GEN_AI_TOOL_TYPE_VALUE_FUNCTION = 'function' as const;
