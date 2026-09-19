/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Unstable definitions from semantic-conventions-genai at
// c88d504ab3d9879f8e50d3cc87e69775e11db234:
// docs/gen-ai/gen-ai-agent-spans.md and docs/gen-ai/gen-ai-spans.md.
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
export const ATTR_GEN_AI_AGENT_NAME = 'gen_ai.agent.name';
export const ATTR_GEN_AI_AGENT_DESCRIPTION = 'gen_ai.agent.description';
export const ATTR_GEN_AI_WORKFLOW_NAME = 'gen_ai.workflow.name';
export const ATTR_GEN_AI_CONVERSATION_ID = 'gen_ai.conversation.id';
export const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages';
export const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages';
export const ATTR_GEN_AI_OUTPUT_TYPE = 'gen_ai.output.type';
export const ATTR_GEN_AI_SYSTEM_INSTRUCTIONS = 'gen_ai.system_instructions';
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model';
export const ATTR_GEN_AI_RESPONSE_FINISH_REASONS =
  'gen_ai.response.finish_reasons';
export const ATTR_GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens';
export const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens';
export const ATTR_GEN_AI_TOOL_NAME = 'gen_ai.tool.name';
export const ATTR_GEN_AI_TOOL_DESCRIPTION = 'gen_ai.tool.description';
export const ATTR_GEN_AI_TOOL_TYPE = 'gen_ai.tool.type';
export const ATTR_GEN_AI_TOOL_CALL_ID = 'gen_ai.tool.call.id';
export const ATTR_GEN_AI_TOOL_CALL_ARGUMENTS = 'gen_ai.tool.call.arguments';
export const ATTR_GEN_AI_TOOL_CALL_RESULT = 'gen_ai.tool.call.result';
export const ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT = 'gen_ai.retrieval.query.text';
export const ATTR_GEN_AI_RETRIEVAL_TOP_K = 'gen_ai.retrieval.top_k';
export const ATTR_GEN_AI_RETRIEVAL_DOCUMENTS = 'gen_ai.retrieval.documents';
export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW = 'invoke_workflow';
export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT = 'invoke_agent';
export const GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL = 'execute_tool';
export const GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL = 'retrieval';
