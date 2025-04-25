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

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * The name of the operation being performed.
 *
 * @note If one of the predefined values applies, but specific system uses a different name it's **RECOMMENDED** to document it in the semantic conventions for specific GenAI system and use system-specific name in the instrumentation. If a different name is not documented, instrumentation libraries **SHOULD** use applicable predefined value.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name' as const;

/**
 * The maximum number of tokens the model generates for a request.
 *
 * @example 100
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_MAX_TOKENS =
  'gen_ai.request.max_tokens' as const;

/**
 * The name of the GenAI model a request is being made to.
 *
 * @example "gpt-4"
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model' as const;

/**
 * List of sequences that the model will use to stop generating further tokens.
 *
 * @example ["forest", "lived"]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_STOP_SEQUENCES =
  'gen_ai.request.stop_sequences' as const;

/**
 * The temperature setting for the GenAI request.
 *
 * @example 0.0
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_TEMPERATURE =
  'gen_ai.request.temperature' as const;

/**
 * The top_p sampling setting for the GenAI request.
 *
 * @example 1.0
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_TOP_P = 'gen_ai.request.top_p' as const;

/**
 * Array of reasons the model stopped generating tokens, corresponding to each generation received.
 *
 * @example ["stop"]
 * @example ["stop", "length"]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_RESPONSE_FINISH_REASONS =
  'gen_ai.response.finish_reasons' as const;

/**
 * The Generative AI product as identified by the client or server instrumentation.
 *
 * @example "openai"
 *
 * @note The `gen_ai.system` describes a family of GenAI models with specific model identified
 * by `gen_ai.request.model` and `gen_ai.response.model` attributes.
 *
 * The actual GenAI product may differ from the one identified by the client.
 * Multiple systems, including Azure OpenAI and Gemini, are accessible by OpenAI client
 * libraries. In such cases, the `gen_ai.system` is set to `openai` based on the
 * instrumentation's best knowledge, instead of the actual system. The `server.address`
 * attribute may help identify the actual system in use for `openai`.
 *
 * For custom model, a custom friendly name **SHOULD** be used.
 * If none of these options apply, the `gen_ai.system` **SHOULD** be set to `_OTHER`.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_SYSTEM = 'gen_ai.system' as const;

/**
 * The number of tokens used in the GenAI input (prompt).
 *
 * @example 100
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_USAGE_INPUT_TOKENS =
  'gen_ai.usage.input_tokens' as const;

/**
 * The number of tokens used in the GenAI response (completion).
 *
 * @example 180
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS =
  'gen_ai.usage.output_tokens' as const;

/**
 * Enum value "chat" for attribute {@link ATTR_GEN_AI_OPERATION_NAME}.
 */
export const GEN_AI_OPERATION_NAME_VALUE_CHAT = 'chat' as const;

/**
 * Enum value "aws.bedrock" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 */
export const GEN_AI_SYSTEM_VALUE_AWS_BEDROCK = 'aws.bedrock' as const;
