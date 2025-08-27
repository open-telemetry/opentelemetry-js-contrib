/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export enum GenAIOperationValues {
  CHAT = 'chat',
  CREATE_AGENT = 'create_agent',
  EMBEDDINGS = 'embeddings',
  GENERATE_CONTENT = 'generate_content',
  INVOKE_AGENT = 'invoke_agent',
  TEXT_COMPLETION = 'text_completion',
  UNKNOWN = 'unknown',
  EXECUTE_TOOL = 'execute_tool',
}

export const Span_Attributes = {
  GEN_AI_REQUEST_MODEL: 'gen_ai.request.model',
  GEN_AI_RESPONSE_MODEL: 'gen_ai.response.model',
  GEN_AI_REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  GEN_AI_REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  GEN_AI_REQUEST_TOP_P: 'gen_ai.request.top_p',
  GEN_AI_REQUEST_STOP_SEQUENCES: 'gen_ai.request.stop_sequences',
  GEN_AI_SYSTEM: 'gen_ai.system',
  GEN_AI_OPERATION_NAME: 'gen_ai.operation.name',
  GEN_AI_RESPONSE_ID: 'gen_ai.response.id',
  GEN_AI_USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  GEN_AI_USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  GEN_AI_AGENT_NAME: 'gen_ai.agent.name',
  GEN_AI_TOOL_CALL_ID: 'gen_ai.tool.call_id',
  GEN_AI_TOOL_DESCRIPTION: 'gen_ai.tool.description',
  GEN_AI_TOOL_NAME: 'gen_ai.tool.name',
};
