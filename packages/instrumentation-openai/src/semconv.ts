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
 * Identifies the class / type of event.
 *
 * @example browser.mouse.click
 * @example device.app.lifecycle
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by EventName top-level field on the LogRecord.
 */
export const ATTR_EVENT_NAME = 'event.name' as const;

/**
 * Free-form description of the GenAI agent provided by the application.
 *
 * @example Helps with math problems
 * @example Generates fiction stories
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_AGENT_DESCRIPTION = 'gen_ai.agent.description' as const;

/**
 * The unique identifier of the GenAI agent.
 *
 * @example asst_5j66UpCpwteGg4YSxUnt7lPY
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_AGENT_ID = 'gen_ai.agent.id' as const;

/**
 * Human-readable name of the GenAI agent provided by the application.
 *
 * @example Math Tutor
 * @example Fiction Writer
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_AGENT_NAME = 'gen_ai.agent.name' as const;

/**
 * Deprecated, use Event API to report completions contents.
 *
 * @example [{'role': 'assistant', 'content': 'The capital of France is Paris.'}]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Removed, no replacement at this time.
 */
export const ATTR_GEN_AI_COMPLETION = 'gen_ai.completion' as const;

/**
 * The unique identifier for a conversation (session, thread), used to store and correlate messages within this conversation.
 *
 * @example conv_5j66UpCpwteGg4YSxUnt7lPY
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_CONVERSATION_ID = 'gen_ai.conversation.id' as const;

/**
 * The data source identifier.
 *
 * @example H7STPQYOND
 *
 * @note Data sources are used by AI agents and RAG applications to store grounding data. A data source may be an external database, object store, document collection, website, or any other storage system used by the GenAI agent or application. The `gen_ai.data_source.id` **SHOULD** match the identifier used by the GenAI system rather than a name specific to the external storage, such as a database or object store. Semantic conventions referencing `gen_ai.data_source.id` **MAY** also leverage additional attributes, such as `db.*`, to further identify and describe the data source.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_DATA_SOURCE_ID = 'gen_ai.data_source.id' as const;

/**
 * The chat history provided to the model as an input.
 *
 * @example [
 * {
 * "role": "user",
 * "parts": [
 * {
 * "type": "text",
 * "content": "Weather in Paris?"
 * }
 * ]
 * },
 * {
 * "role": "assistant",
 * "parts": [
 * {
 * "type": "tool_call",
 * "id": "call_VSPygqKTWdrhaFErNvMV18Yl",
 * "name": "get_weather",
 * "arguments": {
 * "location": "Paris"
 * }
 * }
 * ]
 * },
 * {
 * "role": "tool",
 * "parts": [
 * {
 * "type": "tool_call_response",
 * "id": " call_VSPygqKTWdrhaFErNvMV18Yl",
 * "result": "rainy, 57°F"
 * }
 * ]
 * }
 * ]
 *
 * @note Instrumentations **MUST** follow [Input messages JSON schema](/docs/gen-ai/gen-ai-input-messages.json).
 * When the attribute is recorded on events, it **MUST** be recorded in structured
 * form. When recorded on spans, it **MAY** be recorded as a JSON string if structured
 * format is not supported and **SHOULD** be recorded in structured form otherwise.
 *
 * Messages **MUST** be provided in the order they were sent to the model.
 * Instrumentations **MAY** provide a way for users to filter or truncate
 * input messages.
 *
 * > [!Warning]
 * > This attribute is likely to contain sensitive information including user/PII data.
 *
 * See [Recording content on attributes](/docs/gen-ai/gen-ai-spans.md#recording-content-on-attributes)
 * section for more details.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages' as const;

/**
 * Deprecated, use `gen_ai.output.type`.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `gen_ai.output.type`.
 */
export const ATTR_GEN_AI_OPENAI_REQUEST_RESPONSE_FORMAT = 'gen_ai.openai.request.response_format' as const;

/**
 * Enum value "json_object" for attribute {@link ATTR_GEN_AI_OPENAI_REQUEST_RESPONSE_FORMAT}.
 *
 * JSON object response format
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPENAI_REQUEST_RESPONSE_FORMAT_VALUE_JSON_OBJECT = 'json_object' as const;

/**
 * Enum value "json_schema" for attribute {@link ATTR_GEN_AI_OPENAI_REQUEST_RESPONSE_FORMAT}.
 *
 * JSON schema response format
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPENAI_REQUEST_RESPONSE_FORMAT_VALUE_JSON_SCHEMA = 'json_schema' as const;

/**
 * Enum value "text" for attribute {@link ATTR_GEN_AI_OPENAI_REQUEST_RESPONSE_FORMAT}.
 *
 * Text response format
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPENAI_REQUEST_RESPONSE_FORMAT_VALUE_TEXT = 'text' as const;

/**
 * Deprecated, use `gen_ai.request.seed`.
 *
 * @example 100
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `gen_ai.request.seed`.
 */
export const ATTR_GEN_AI_OPENAI_REQUEST_SEED = 'gen_ai.openai.request.seed' as const;

/**
 * Deprecated, use `openai.request.service_tier`.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `openai.request.service_tier`.
 */
export const ATTR_GEN_AI_OPENAI_REQUEST_SERVICE_TIER = 'gen_ai.openai.request.service_tier' as const;

/**
 * Enum value "auto" for attribute {@link ATTR_GEN_AI_OPENAI_REQUEST_SERVICE_TIER}.
 *
 * The system will utilize scale tier credits until they are exhausted.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPENAI_REQUEST_SERVICE_TIER_VALUE_AUTO = 'auto' as const;

/**
 * Enum value "default" for attribute {@link ATTR_GEN_AI_OPENAI_REQUEST_SERVICE_TIER}.
 *
 * The system will utilize the default scale tier.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPENAI_REQUEST_SERVICE_TIER_VALUE_DEFAULT = 'default' as const;

/**
 * Deprecated, use `openai.response.service_tier`.
 *
 * @example scale
 * @example default
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `openai.response.service_tier`.
 */
export const ATTR_GEN_AI_OPENAI_RESPONSE_SERVICE_TIER = 'gen_ai.openai.response.service_tier' as const;

/**
 * Deprecated, use `openai.response.system_fingerprint`.
 *
 * @example fp_44709d6fcb
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `openai.response.system_fingerprint`.
 */
export const ATTR_GEN_AI_OPENAI_RESPONSE_SYSTEM_FINGERPRINT = 'gen_ai.openai.response.system_fingerprint' as const;

/**
 * The name of the operation being performed.
 *
 * @note If one of the predefined values applies, but specific system uses a different name it's **RECOMMENDED** to document it in the semantic conventions for specific GenAI system and use system-specific name in the instrumentation. If a different name is not documented, instrumentation libraries **SHOULD** use applicable predefined value.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name' as const;

/**
 * Enum value "chat" for attribute {@link ATTR_GEN_AI_OPERATION_NAME}.
 *
 * Chat completion operation such as [OpenAI Chat API](https://platform.openai.com/docs/api-reference/chat)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPERATION_NAME_VALUE_CHAT = 'chat' as const;

/**
 * Enum value "create_agent" for attribute {@link ATTR_GEN_AI_OPERATION_NAME}.
 *
 * Create GenAI agent
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPERATION_NAME_VALUE_CREATE_AGENT = 'create_agent' as const;

/**
 * Enum value "embeddings" for attribute {@link ATTR_GEN_AI_OPERATION_NAME}.
 *
 * Embeddings operation such as [OpenAI Create embeddings API](https://platform.openai.com/docs/api-reference/embeddings/create)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS = 'embeddings' as const;

/**
 * Enum value "execute_tool" for attribute {@link ATTR_GEN_AI_OPERATION_NAME}.
 *
 * Execute a tool
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL = 'execute_tool' as const;

/**
 * Enum value "generate_content" for attribute {@link ATTR_GEN_AI_OPERATION_NAME}.
 *
 * Multimodal content generation operation such as [Gemini Generate Content](https://ai.google.dev/api/generate-content)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT = 'generate_content' as const;

/**
 * Enum value "invoke_agent" for attribute {@link ATTR_GEN_AI_OPERATION_NAME}.
 *
 * Invoke GenAI agent
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT = 'invoke_agent' as const;

/**
 * Enum value "text_completion" for attribute {@link ATTR_GEN_AI_OPERATION_NAME}.
 *
 * Text completions operation such as [OpenAI Completions API (Legacy)](https://platform.openai.com/docs/api-reference/completions)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION = 'text_completion' as const;

/**
 * Messages returned by the model where each message represents a specific model response (choice, candidate).
 *
 * @example [
 * {
 * "role": "assistant",
 * "parts": [
 * {
 * "type": "text",
 * "content": "The weather in Paris is currently rainy with a temperature of 57°F."
 * }
 * ],
 * "finish_reason": "stop"
 * }
 * ]
 *
 * @note Instrumentations **MUST** follow [Output messages JSON schema](/docs/gen-ai/gen-ai-output-messages.json)
 *
 * Each message represents a single output choice/candidate generated by
 * the model. Each message corresponds to exactly one generation
 * (choice/candidate) and vice versa - one choice cannot be split across
 * multiple messages or one message cannot contain parts from multiple choices.
 *
 * When the attribute is recorded on events, it **MUST** be recorded in structured
 * form. When recorded on spans, it **MAY** be recorded as a JSON string if structured
 * format is not supported and **SHOULD** be recorded in structured form otherwise.
 *
 * Instrumentations **MAY** provide a way for users to filter or truncate
 * output messages.
 *
 * > [!Warning]
 * > This attribute is likely to contain sensitive information including user/PII data.
 *
 * See [Recording content on attributes](/docs/gen-ai/gen-ai-spans.md#recording-content-on-attributes)
 * section for more details.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages' as const;

/**
 * Represents the content type requested by the client.
 *
 * @note This attribute **SHOULD** be used when the client requests output of a specific type. The model may return zero or more outputs of this type.
 * This attribute specifies the output modality and not the actual output format. For example, if an image is requested, the actual output could be a URL pointing to an image file.
 * Additional output format details may be recorded in the future in the `gen_ai.output.{type}.*` attributes.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_OUTPUT_TYPE = 'gen_ai.output.type' as const;

/**
 * Enum value "image" for attribute {@link ATTR_GEN_AI_OUTPUT_TYPE}.
 *
 * Image
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OUTPUT_TYPE_VALUE_IMAGE = 'image' as const;

/**
 * Enum value "json" for attribute {@link ATTR_GEN_AI_OUTPUT_TYPE}.
 *
 * JSON object with known or unknown schema
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OUTPUT_TYPE_VALUE_JSON = 'json' as const;

/**
 * Enum value "speech" for attribute {@link ATTR_GEN_AI_OUTPUT_TYPE}.
 *
 * Speech
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OUTPUT_TYPE_VALUE_SPEECH = 'speech' as const;

/**
 * Enum value "text" for attribute {@link ATTR_GEN_AI_OUTPUT_TYPE}.
 *
 * Plain text
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OUTPUT_TYPE_VALUE_TEXT = 'text' as const;

/**
 * Deprecated, use Event API to report prompt contents.
 *
 * @example [{'role': 'user', 'content': 'What is the capital of France?'}]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Removed, no replacement at this time.
 */
export const ATTR_GEN_AI_PROMPT = 'gen_ai.prompt' as const;

/**
 * The Generative AI provider as identified by the client or server instrumentation.
 *
 * @note The attribute **SHOULD** be set based on the instrumentation's best
 * knowledge and may differ from the actual model provider.
 *
 * Multiple providers, including Azure OpenAI, Gemini, and AI hosting platforms
 * are accessible using the OpenAI REST API and corresponding client libraries,
 * but may proxy or host models from different providers.
 *
 * The `gen_ai.request.model`, `gen_ai.response.model`, and `server.address`
 * attributes may help identify the actual system in use.
 *
 * The `gen_ai.provider.name` attribute acts as a discriminator that
 * identifies the GenAI telemetry format flavor specific to that provider
 * within GenAI semantic conventions.
 * It **SHOULD** be set consistently with provider-specific attributes and signals.
 * For example, GenAI spans, metrics, and events related to AWS Bedrock
 * should have the `gen_ai.provider.name` set to `aws.bedrock` and include
 * applicable `aws.bedrock.*` attributes and are not expected to include
 * `openai.*` attributes.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_PROVIDER_NAME = 'gen_ai.provider.name' as const;

/**
 * Enum value "anthropic" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [Anthropic](https://www.anthropic.com/)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC = 'anthropic' as const;

/**
 * Enum value "aws.bedrock" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [AWS Bedrock](https://aws.amazon.com/bedrock)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK = 'aws.bedrock' as const;

/**
 * Enum value "azure.ai.inference" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * Azure AI Inference
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_INFERENCE = 'azure.ai.inference' as const;

/**
 * Enum value "azure.ai.openai" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [Azure OpenAI](https://azure.microsoft.com/products/ai-services/openai-service/)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI = 'azure.ai.openai' as const;

/**
 * Enum value "cohere" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [Cohere](https://cohere.com/)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_COHERE = 'cohere' as const;

/**
 * Enum value "deepseek" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [DeepSeek](https://www.deepseek.com/)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK = 'deepseek' as const;

/**
 * Enum value "gcp.gemini" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [Gemini](https://cloud.google.com/products/gemini)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI = 'gcp.gemini' as const;

/**
 * Enum value "gcp.gen_ai" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * Any Google generative AI endpoint
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI = 'gcp.gen_ai' as const;

/**
 * Enum value "gcp.vertex_ai" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [Vertex AI](https://cloud.google.com/vertex-ai)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI = 'gcp.vertex_ai' as const;

/**
 * Enum value "groq" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [Groq](https://groq.com/)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_GROQ = 'groq' as const;

/**
 * Enum value "ibm.watsonx.ai" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [IBM Watsonx AI](https://www.ibm.com/products/watsonx-ai)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_IBM_WATSONX_AI = 'ibm.watsonx.ai' as const;

/**
 * Enum value "mistral_ai" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [Mistral AI](https://mistral.ai/)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_MISTRAL_AI = 'mistral_ai' as const;

/**
 * Enum value "openai" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [OpenAI](https://openai.com/)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_OPENAI = 'openai' as const;

/**
 * Enum value "perplexity" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [Perplexity](https://www.perplexity.ai/)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_PERPLEXITY = 'perplexity' as const;

/**
 * Enum value "x_ai" for attribute {@link ATTR_GEN_AI_PROVIDER_NAME}.
 *
 * [xAI](https://x.ai/)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_PROVIDER_NAME_VALUE_X_AI = 'x_ai' as const;

/**
 * The target number of candidate completions to return.
 *
 * @example 3
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_CHOICE_COUNT = 'gen_ai.request.choice.count' as const;

/**
 * The encoding formats requested in an embeddings operation, if specified.
 *
 * @example ["base64"]
 * @example ["float", "binary"]
 *
 * @note In some GenAI systems the encoding formats are called embedding types. Also, some GenAI systems only accept a single format per request.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_ENCODING_FORMATS = 'gen_ai.request.encoding_formats' as const;

/**
 * The frequency penalty setting for the GenAI request.
 *
 * @example 0.1
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY = 'gen_ai.request.frequency_penalty' as const;

/**
 * The maximum number of tokens the model generates for a request.
 *
 * @example 100
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_MAX_TOKENS = 'gen_ai.request.max_tokens' as const;

/**
 * The name of the GenAI model a request is being made to.
 *
 * @example "gpt-4"
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model' as const;

/**
 * The presence penalty setting for the GenAI request.
 *
 * @example 0.1
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY = 'gen_ai.request.presence_penalty' as const;

/**
 * Requests with same seed value more likely to return same result.
 *
 * @example 100
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_SEED = 'gen_ai.request.seed' as const;

/**
 * List of sequences that the model will use to stop generating further tokens.
 *
 * @example ["forest", "lived"]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_STOP_SEQUENCES = 'gen_ai.request.stop_sequences' as const;

/**
 * The temperature setting for the GenAI request.
 *
 * @example 0.0
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_TEMPERATURE = 'gen_ai.request.temperature' as const;

/**
 * The top_k sampling setting for the GenAI request.
 *
 * @example 1.0
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_TOP_K = 'gen_ai.request.top_k' as const;

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
export const ATTR_GEN_AI_RESPONSE_FINISH_REASONS = 'gen_ai.response.finish_reasons' as const;

/**
 * The unique identifier for the completion.
 *
 * @example chatcmpl-123
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_RESPONSE_ID = 'gen_ai.response.id' as const;

/**
 * The name of the model that generated the response.
 *
 * @example gpt-4-0613
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_RESPONSE_MODEL = 'gen_ai.response.model' as const;

/**
 * Deprecated, use `gen_ai.provider.name` instead.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `gen_ai.provider.name`.
 */
export const ATTR_GEN_AI_SYSTEM = 'gen_ai.system' as const;

/**
 * Enum value "anthropic" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Anthropic
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_ANTHROPIC = 'anthropic' as const;

/**
 * Enum value "aws.bedrock" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * AWS Bedrock
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_AWS_BEDROCK = 'aws.bedrock' as const;

/**
 * Enum value "az.ai.inference" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Azure AI Inference
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_AZ_AI_INFERENCE = 'az.ai.inference' as const;

/**
 * Enum value "az.ai.openai" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Azure OpenAI
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_AZ_AI_OPENAI = 'az.ai.openai' as const;

/**
 * Enum value "azure.ai.inference" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Azure AI Inference
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_AZURE_AI_INFERENCE = 'azure.ai.inference' as const;

/**
 * Enum value "azure.ai.openai" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Azure OpenAI
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_AZURE_AI_OPENAI = 'azure.ai.openai' as const;

/**
 * Enum value "cohere" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Cohere
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_COHERE = 'cohere' as const;

/**
 * Enum value "deepseek" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * DeepSeek
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_DEEPSEEK = 'deepseek' as const;

/**
 * Enum value "gcp.gemini" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Gemini
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_GCP_GEMINI = 'gcp.gemini' as const;

/**
 * Enum value "gcp.gen_ai" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Any Google generative AI endpoint
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_GCP_GEN_AI = 'gcp.gen_ai' as const;

/**
 * Enum value "gcp.vertex_ai" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Vertex AI
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_GCP_VERTEX_AI = 'gcp.vertex_ai' as const;

/**
 * Enum value "gemini" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Gemini
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `gcp.gemini`.
 */
export const GEN_AI_SYSTEM_VALUE_GEMINI = 'gemini' as const;

/**
 * Enum value "groq" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Groq
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_GROQ = 'groq' as const;

/**
 * Enum value "ibm.watsonx.ai" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * IBM Watsonx AI
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_IBM_WATSONX_AI = 'ibm.watsonx.ai' as const;

/**
 * Enum value "mistral_ai" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Mistral AI
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_MISTRAL_AI = 'mistral_ai' as const;

/**
 * Enum value "openai" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * OpenAI
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_OPENAI = 'openai' as const;

/**
 * Enum value "perplexity" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Perplexity
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_PERPLEXITY = 'perplexity' as const;

/**
 * Enum value "vertex_ai" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * Vertex AI
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `gcp.vertex_ai`.
 */
export const GEN_AI_SYSTEM_VALUE_VERTEX_AI = 'vertex_ai' as const;

/**
 * Enum value "xai" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * xAI
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `x_ai`.
 */
export const GEN_AI_SYSTEM_VALUE_XAI = 'xai' as const;

/**
 * The system message or instructions provided to the GenAI model separately from the chat history.
 *
 * @example [
 * {
 * "type": "text",
 * "content": "You are an Agent that greet users, always use greetings tool to respond"
 * }
 * ]
 *
 * @example [
 * {
 * "type": "text",
 * "content": "You are a language translator."
 * },
 * {
 * "type": "text",
 * "content": "Your mission is to translate text in English to French."
 * }
 * ]
 *
 * @note This attribute **SHOULD** be used when the corresponding provider or API
 * allows to provide system instructions or messages separately from the
 * chat history.
 *
 * Instructions that are part of the chat history **SHOULD** be recorded in
 * `gen_ai.input.messages` attribute instead.
 *
 * Instrumentations **MUST** follow [System instructions JSON schema](/docs/gen-ai/gen-ai-system-instructions.json).
 *
 * When recorded on spans, it **MAY** be recorded as a JSON string if structured
 * format is not supported and **SHOULD** be recorded in structured form otherwise.
 *
 * Instrumentations **MAY** provide a way for users to filter or truncate
 * system instructions.
 *
 * > [!Warning]
 * > This attribute may contain sensitive information.
 *
 * See [Recording content on attributes](/docs/gen-ai/gen-ai-spans.md#recording-content-on-attributes)
 * section for more details.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_SYSTEM_INSTRUCTIONS = 'gen_ai.system_instructions' as const;

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
 *
 * @deprecated Replaced by `output`.
 */
export const GEN_AI_TOKEN_TYPE_VALUE_COMPLETION = 'output' as const;

/**
 * Enum value "output" for attribute {@link ATTR_GEN_AI_TOKEN_TYPE}.
 *
 * Output tokens (completion, response, etc.)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_TOKEN_TYPE_VALUE_OUTPUT = 'output' as const;

/**
 * The tool call identifier.
 *
 * @example call_mszuSIzqtI65i1wAUOE8w5H4
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_TOOL_CALL_ID = 'gen_ai.tool.call.id' as const;

/**
 * The tool description.
 *
 * @example Multiply two numbers
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_TOOL_DESCRIPTION = 'gen_ai.tool.description' as const;

/**
 * Name of the tool utilized by the agent.
 *
 * @example Flights
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_TOOL_NAME = 'gen_ai.tool.name' as const;

/**
 * Type of the tool utilized by the agent
 *
 * @example function
 * @example extension
 * @example datastore
 *
 * @note Extension: A tool executed on the agent-side to directly call external APIs, bridging the gap between the agent and real-world systems.
 * Agent-side operations involve actions that are performed by the agent on the server or within the agent's controlled environment.
 * Function: A tool executed on the client-side, where the agent generates parameters for a predefined function, and the client executes the logic.
 * Client-side operations are actions taken on the user's end or within the client application.
 * Datastore: A tool used by the agent to access and query structured or unstructured external data for retrieval-augmented tasks or knowledge updates.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_TOOL_TYPE = 'gen_ai.tool.type' as const;

/**
 * Deprecated, use `gen_ai.usage.output_tokens` instead.
 *
 * @example 42
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `gen_ai.usage.output_tokens`.
 */
export const ATTR_GEN_AI_USAGE_COMPLETION_TOKENS = 'gen_ai.usage.completion_tokens' as const;

/**
 * The number of tokens used in the GenAI input (prompt).
 *
 * @example 100
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens' as const;

/**
 * The number of tokens used in the GenAI response (completion).
 *
 * @example 180
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens' as const;

/**
 * Deprecated, use `gen_ai.usage.input_tokens` instead.
 *
 * @example 42
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `gen_ai.usage.input_tokens`.
 */
export const ATTR_GEN_AI_USAGE_PROMPT_TOKENS = 'gen_ai.usage.prompt_tokens' as const;

/**
 * This event describes the assistant message passed to GenAI system.
 *
 * @experimental This event is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Chat history is reported on `gen_ai.input.messages` attribute on spans or `gen_ai.client.inference.operation.details` event.
 */
export const EVENT_GEN_AI_ASSISTANT_MESSAGE = 'gen_ai.assistant.message' as const;

/**
 * This event describes the Gen AI response message.
 *
 * @experimental This event is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Chat history is reported on `gen_ai.output.messages` attribute on spans or `gen_ai.client.inference.operation.details` event.
 */
export const EVENT_GEN_AI_CHOICE = 'gen_ai.choice' as const;

/**
 * Describes the details of a GenAI completion request including chat history and parameters.
 *
 * @note This event is opt-in and could be used to store input and output details independently from traces.
 *
 * @experimental This event is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS = 'gen_ai.client.inference.operation.details' as const;

/**
 * This event describes the system instructions passed to the GenAI model.
 *
 * @experimental This event is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Chat history is reported on `gen_ai.system_instructions` attribute on spans or `gen_ai.client.inference.operation.details` event.
 */
export const EVENT_GEN_AI_SYSTEM_MESSAGE = 'gen_ai.system.message' as const;

/**
 * This event describes the response from a tool or function call passed to the GenAI model.
 *
 * @experimental This event is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Chat history is reported on `gen_ai.input.messages` attribute on spans or `gen_ai.client.inference.operation.details` event.
 */
export const EVENT_GEN_AI_TOOL_MESSAGE = 'gen_ai.tool.message' as const;

/**
 * This event describes the user message passed to the GenAI model.
 *
 * @experimental This event is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Chat history is reported on `gen_ai.input.messages` attribute on spans or `gen_ai.client.inference.operation.details` event.
 */
export const EVENT_GEN_AI_USER_MESSAGE = 'gen_ai.user.message' as const;

/**
 * GenAI operation duration.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_GEN_AI_CLIENT_OPERATION_DURATION = 'gen_ai.client.operation.duration' as const;

/**
 * Number of input and output tokens used.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_GEN_AI_CLIENT_TOKEN_USAGE = 'gen_ai.client.token.usage' as const;

/**
 * Generative AI server request duration such as time-to-last byte or last output token.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_GEN_AI_SERVER_REQUEST_DURATION = 'gen_ai.server.request.duration' as const;

/**
 * Time per output token generated after the first token for successful responses.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_GEN_AI_SERVER_TIME_PER_OUTPUT_TOKEN = 'gen_ai.server.time_per_output_token' as const;

/**
 * Time to generate first token for successful responses.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_GEN_AI_SERVER_TIME_TO_FIRST_TOKEN = 'gen_ai.server.time_to_first_token' as const;
