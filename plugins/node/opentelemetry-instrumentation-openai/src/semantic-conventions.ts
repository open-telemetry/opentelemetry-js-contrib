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

export default class SemanticConvention {
  // GenAI General
  static GEN_AI_ENDPOINT = 'gen_ai.endpoint';
  static GEN_AI_SYSTEM = 'gen_ai.system';
  static GEN_AI_ENVIRONMENT = 'gen_ai.environment';
  static GEN_AI_APPLICATION_NAME = 'gen_ai.application_name';
  static GEN_AI_TYPE = 'gen_ai.type';

  // GenAI Request
  static GEN_AI_REQUEST_MODEL = 'gen_ai.request.model';
  static GEN_AI_REQUEST_TEMPERATURE = 'gen_ai.request.temperature';
  static GEN_AI_REQUEST_TOP_P = 'gen_ai.request.top_p';
  static GEN_AI_REQUEST_TOP_K = 'gen_ai.request.top_k';
  static GEN_AI_REQUEST_MAX_TOKENS = 'gen_ai.request.max_tokens';
  static GEN_AI_REQUEST_IS_STREAM = 'gen_ai.request.is_stream';
  static GEN_AI_REQUEST_USER = 'gen_ai.request.user';
  static GEN_AI_REQUEST_SEED = 'gen_ai.request.seed';
  static GEN_AI_REQUEST_FREQUENCY_PENALTY = 'gen_ai.request.frequency_penalty';
  static GEN_AI_REQUEST_PRESENCE_PENALTY = 'gen_ai.request.presence_penalty';

  // GenAI Usage
  static GEN_AI_USAGE_PROMPT_TOKENS = 'gen_ai.usage.input_tokens';
  static GEN_AI_USAGE_COMPLETION_TOKENS = 'gen_ai.usage.output_tokens';
  static GEN_AI_USAGE_TOTAL_TOKENS = 'gen_ai.usage.total_tokens';
  static GEN_AI_USAGE_COST = 'gen_ai.usage.cost';

  // GenAI Response
  static GEN_AI_RESPONSE_ID = 'gen_ai.response.id';
  static GEN_AI_RESPONSE_FINISH_REASON = 'gen_ai.response.finish_reason';

  // GenAI Content
  static GEN_AI_CONTENT_PROMPT = 'gen_ai.content.prompt';
  static GEN_AI_CONTENT_COMPLETION = 'gen_ai.completion';

  // GenAI functionality
  static GEN_AI_TYPE_CHAT = 'chat';

  // GenAI system provider
  static GEN_AI_SYSTEM_OPENAI = 'openai';
}
