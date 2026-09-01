/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Copies of the unstable GenAI attributes used by this package, from
 * @opentelemetry/semantic-conventions 1.41.1.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */
export const ATTR_GEN_AI_RESPONSE_FINISH_REASONS =
  'gen_ai.response.finish_reasons' as const;
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name' as const;
export const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages' as const;
export const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages' as const;
export const ATTR_GEN_AI_PROVIDER_NAME = 'gen_ai.provider.name' as const;
export const ATTR_GEN_AI_REQUEST_MAX_TOKENS =
  'gen_ai.request.max_tokens' as const;
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model' as const;
export const ATTR_GEN_AI_REQUEST_STOP_SEQUENCES =
  'gen_ai.request.stop_sequences' as const;
export const ATTR_GEN_AI_REQUEST_TEMPERATURE =
  'gen_ai.request.temperature' as const;
export const ATTR_GEN_AI_REQUEST_TOP_K = 'gen_ai.request.top_k' as const;
export const ATTR_GEN_AI_REQUEST_TOP_P = 'gen_ai.request.top_p' as const;
export const ATTR_GEN_AI_RESPONSE_ID = 'gen_ai.response.id' as const;
export const ATTR_GEN_AI_RESPONSE_MODEL = 'gen_ai.response.model' as const;
export const ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS =
  'gen_ai.usage.cache_creation.input_tokens' as const;
export const ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS =
  'gen_ai.usage.cache_read.input_tokens' as const;
export const ATTR_GEN_AI_USAGE_INPUT_TOKENS =
  'gen_ai.usage.input_tokens' as const;
export const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS =
  'gen_ai.usage.output_tokens' as const;
export const ATTR_GEN_AI_SYSTEM_INSTRUCTIONS =
  'gen_ai.system_instructions' as const;
