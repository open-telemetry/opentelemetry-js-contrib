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
 * The ARN of the Secret stored in the Secrets Mangger
 *
 * @example arn:aws:secretsmanager:us-east-1:123456789012:secret:SecretName-6RandomCharacters
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_SECRETSMANAGER_SECRET_ARN =
  'aws.secretsmanager.secret.arn' as const;

/**
 * The ARN of the AWS SNS Topic. An Amazon SNS [topic](https://docs.aws.amazon.com/sns/latest/dg/sns-create-topic.html) is a logical access point that acts as a communication channel.
 *
 * @example arn:aws:sns:us-east-1:123456789012:mystack-mytopic-NZJ5JSMVGFIE
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_SNS_TOPIC_ARN = 'aws.sns.topic.arn' as const;

/**
 * The ARN of the AWS Step Functions Activity.
 *
 * @example arn:aws:states:us-east-1:123456789012:activity:get-greeting
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN =
  'aws.step_functions.activity.arn' as const;

/**
 * The ARN of the AWS Step Functions State Machine.
 *
 * @example arn:aws:states:us-east-1:123456789012:stateMachine:myStateMachine:1
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN =
  'aws.step_functions.state_machine.arn' as const;

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
 * The type of token being counted.
 *
 * @example input
 * @example output
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_TOKEN_TYPE = 'gen_ai.token.type' as const;

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
 * The number of messages sent, received, or processed in the scope of the batching operation.
 *
 * @example 0
 * @example 1
 * @example 2
 *
 * @note Instrumentations **SHOULD NOT** set `messaging.batch.message_count` on spans that operate with a single message. When a messaging client library supports both batch and single-message API for the same operation, instrumentations **SHOULD** use `messaging.batch.message_count` for batching APIs and **SHOULD NOT** use it for single-message APIs.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_BATCH_MESSAGE_COUNT =
  'messaging.batch.message_count' as const;

/**
 * The message destination name
 *
 * @example MyQueue
 * @example MyTopic
 *
 * @note Destination name **SHOULD** uniquely identify a specific queue, topic or other entity within the broker. If
 * the broker doesn't have such notion, the destination name **SHOULD** uniquely identify the broker.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_DESTINATION_NAME =
  'messaging.destination.name' as const;

/**
 * A value used by the messaging system as an identifier for the message, represented as a string.
 *
 * @example "452a7c7c7c7048c2f887f61572b18fc2"
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_MESSAGE_ID = 'messaging.message.id' as const;

/**
 * A string identifying the type of the messaging operation.
 *
 * @note If a custom value is used, it **MUST** be of low cardinality.
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_OPERATION_TYPE =
  'messaging.operation.type' as const;

/**
 * Enum value "chat" for attribute {@link ATTR_GEN_AI_OPERATION_NAME}.
 *
 * Chat completion operation such as [OpenAI Chat API](https://platform.openai.com/docs/api-reference/chat)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPERATION_NAME_VALUE_CHAT = 'chat' as const;

/**
 * Enum value "aws.bedrock" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * AWS Bedrock
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_AWS_BEDROCK = 'aws.bedrock' as const;

/**
 * Enum value "input" for attribute {@link ATTR_GEN_AI_TOKEN_TYPE}.
 *
 * Input tokens (prompt, input, etc.)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_TOKEN_TYPE_VALUE_INPUT = 'input' as const;

/**
 * Enum value "output" for attribute {@link ATTR_GEN_AI_TOKEN_TYPE}.
 *
 * Output tokens (completion, response, etc.)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_TOKEN_TYPE_VALUE_OUTPUT = 'output' as const;
