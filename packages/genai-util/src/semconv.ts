/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Semantic conventions in this file are defined locally rather than imported from
 * `@opentelemetry/semantic-conventions/incubating`.
 *
 * Rationale:
 * 1. Per OpenTelemetry JavaScript Contrib repository guidelines (GUIDELINES.md),
 *    packages must not depend on `@opentelemetry/semantic-conventions/incubating`
 *    because incubating semantic conventions are experimental/unstable and subject
 *    to breaking changes across minor releases.
 * 2. Defining attributes, metric names, and event names as local `as const` string
 *    literals isolates this utility package and all downstream GenAI instrumentations
 *    from upstream breaking changes and prevents version-conflict / diamond-dependency
 *    issues across packages in the ecosystem.
 *
 * @see https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-spans.md
 */

// ============================================================================
// Span and Event Attributes
// ============================================================================

/**
 * The name of the operation being performed.
 *
 * @example chat
 * @example text_completion
 * @example embeddings
 * @example generate_content
 * @example execute_tool
 */
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name' as const;

/**
 * The Generative AI provider as identified by the client or server instrumentation.
 *
 * @example openai
 * @example anthropic
 * @example aws.bedrock
 * @example google_genai
 */
export const ATTR_GEN_AI_PROVIDER_NAME = 'gen_ai.provider.name' as const;

/**
 * The name of the GenAI model a request is being made to.
 *
 * @example gpt-4o
 * @example claude-3-5-sonnet-20241022
 * @example gemini-1.5-pro
 */
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model' as const;

/**
 * The temperature setting for the GenAI request.
 *
 * @example 0.7
 */
export const ATTR_GEN_AI_REQUEST_TEMPERATURE =
  'gen_ai.request.temperature' as const;

/**
 * The top_p sampling setting for the GenAI request.
 *
 * @example 0.95
 */
export const ATTR_GEN_AI_REQUEST_TOP_P = 'gen_ai.request.top_p' as const;

/**
 * The top_k sampling setting for the GenAI request.
 *
 * @example 40
 */
export const ATTR_GEN_AI_REQUEST_TOP_K = 'gen_ai.request.top_k' as const;

/**
 * The maximum number of tokens the model should generate in response.
 *
 * @example 4096
 */
export const ATTR_GEN_AI_REQUEST_MAX_TOKENS =
  'gen_ai.request.max_tokens' as const;

/**
 * List of sequences that will cause the model to stop generating tokens.
 *
 * @example ["\n\n", "STOP"]
 */
export const ATTR_GEN_AI_REQUEST_STOP_SEQUENCES =
  'gen_ai.request.stop_sequences' as const;

/**
 * The frequency penalty setting for the GenAI request.
 *
 * @example 0.5
 */
export const ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY =
  'gen_ai.request.frequency_penalty' as const;

/**
 * The presence penalty setting for the GenAI request.
 *
 * @example 0.5
 */
export const ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY =
  'gen_ai.request.presence_penalty' as const;

/**
 * The number of choices requested by the client.
 *
 * @example 1
 */
export const ATTR_GEN_AI_REQUEST_CHOICE_COUNT =
  'gen_ai.request.choice.count' as const;

/**
 * Requests with same seed value more likely to return same result.
 *
 * @example 42
 */
export const ATTR_GEN_AI_REQUEST_SEED = 'gen_ai.request.seed' as const;

/**
 * The target modalities/formats of the generated response.
 *
 * @example ["text"]
 */
export const ATTR_GEN_AI_REQUEST_ENCODING_FORMATS =
  'gen_ai.request.encoding_formats' as const;

/**
 * The unique identifier for a GenAI response.
 *
 * @example chatcmpl-123
 * @example msg_01XyZ...
 */
export const ATTR_GEN_AI_RESPONSE_ID = 'gen_ai.response.id' as const;

/**
 * The name of the model that generated the response.
 *
 * @example gpt-4o-2024-08-06
 */
export const ATTR_GEN_AI_RESPONSE_MODEL = 'gen_ai.response.model' as const;

/**
 * Array of reasons why the model stopped generating tokens for each response choice.
 *
 * @example ["stop"]
 * @example ["tool_calls"]
 */
export const ATTR_GEN_AI_RESPONSE_FINISH_REASONS =
  'gen_ai.response.finish_reasons' as const;

/**
 * The number of tokens contained in the request input / prompt.
 *
 * @example 128
 */
export const ATTR_GEN_AI_USAGE_INPUT_TOKENS =
  'gen_ai.usage.input_tokens' as const;

/**
 * The number of tokens contained in the response output / completion.
 *
 * @example 256
 */
export const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS =
  'gen_ai.usage.output_tokens' as const;

/**
 * The total number of tokens used in the request (input + output).
 *
 * @example 384
 */
export const ATTR_GEN_AI_USAGE_TOTAL_TOKENS =
  'gen_ai.usage.total_tokens' as const;

/**
 * The type of token being counted in metric instruments.
 *
 * @example input
 * @example output
 */
export const ATTR_GEN_AI_TOKEN_TYPE = 'gen_ai.token.type' as const;

/**
 * The chat history provided to the model as an input.
 */
export const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages' as const;

/**
 * Messages returned by the model where each message represents a specific response choice.
 */
export const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages' as const;

/**
 * System instructions provided to the model.
 */
export const ATTR_GEN_AI_SYSTEM_INSTRUCTIONS =
  'gen_ai.system_instructions' as const;

/**
 * Represents the content type requested by the client.
 */
export const ATTR_GEN_AI_OUTPUT_TYPE = 'gen_ai.output.type' as const;

/**
 * The unique identifier for a conversation (session, thread).
 *
 * @example conv_5j66UpCpwteGg4YSxUnt7lPY
 */
export const ATTR_GEN_AI_CONVERSATION_ID = 'gen_ai.conversation.id' as const;

/**
 * The data source identifier used by RAG/agent applications.
 *
 * @example H7STPQYOND
 */
export const ATTR_GEN_AI_DATA_SOURCE_ID = 'gen_ai.data_source.id' as const;

/**
 * The unique identifier of the GenAI agent.
 *
 * @example asst_5j66UpCpwteGg4YSxUnt7lPY
 */
export const ATTR_GEN_AI_AGENT_ID = 'gen_ai.agent.id' as const;

/**
 * Human-readable name of the GenAI agent.
 *
 * @example Math Tutor
 */
export const ATTR_GEN_AI_AGENT_NAME = 'gen_ai.agent.name' as const;

/**
 * Free-form description of the GenAI agent.
 *
 * @example Helps with math problems
 */
export const ATTR_GEN_AI_AGENT_DESCRIPTION =
  'gen_ai.agent.description' as const;

/**
 * The name of the tool called.
 *
 * @example get_weather
 */
export const ATTR_GEN_AI_TOOL_NAME = 'gen_ai.tool.name' as const;

/**
 * The description of the tool called.
 */
export const ATTR_GEN_AI_TOOL_DESCRIPTION = 'gen_ai.tool.description' as const;

/**
 * The unique identifier of the tool call.
 *
 * @example call_VSPygqKTWdrhaFErNvMV18Yl
 */
export const ATTR_GEN_AI_TOOL_CALL_ID = 'gen_ai.tool.call.id' as const;

/**
 * Event name attribute for LogRecord events.
 */
export const ATTR_EVENT_NAME = 'event.name' as const;

/**
 * OpenInference span kind attribute (for compatibility).
 */
export const ATTR_OPENINFERENCE_SPAN_KIND = 'openinference.span.kind' as const;

// ============================================================================
// Predefined Constant Values
// ============================================================================

// Operations
export const GEN_AI_OPERATION_NAME_VALUE_CHAT = 'chat' as const;
export const GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION =
  'text_completion' as const;
export const GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS = 'embeddings' as const;
export const GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT =
  'generate_content' as const;
export const GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL = 'execute_tool' as const;
export const GEN_AI_OPERATION_NAME_VALUE_CREATE_AGENT = 'create_agent' as const;
export const GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT = 'invoke_agent' as const;

// Providers
export const GEN_AI_PROVIDER_NAME_VALUE_OPENAI = 'openai' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC = 'anthropic' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK = 'aws.bedrock' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_GOOGLE_GENAI = 'google_genai' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI =
  'azure.ai.openai' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_INFERENCE =
  'azure.ai.inference' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_COHERE = 'cohere' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK = 'deepseek' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_GROQ = 'groq' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_MISTRAL_AI = 'mistral_ai' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_OLLAMA = 'ollama' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_LANGCHAIN = 'langchain' as const;
export const GEN_AI_PROVIDER_NAME_VALUE_WATSONX_AI = 'watsonx.ai' as const;

// Token Types
export const GEN_AI_TOKEN_TYPE_VALUE_INPUT = 'input' as const;
export const GEN_AI_TOKEN_TYPE_VALUE_OUTPUT = 'output' as const;

// Finish Reasons
export const GEN_AI_FINISH_REASON_VALUE_STOP = 'stop' as const;
export const GEN_AI_FINISH_REASON_VALUE_LENGTH = 'length' as const;
export const GEN_AI_FINISH_REASON_VALUE_CONTENT_FILTER =
  'content_filter' as const;
export const GEN_AI_FINISH_REASON_VALUE_TOOL_CALL = 'tool_call' as const;
export const GEN_AI_FINISH_REASON_VALUE_ERROR = 'error' as const;

// Output Types
export const GEN_AI_OUTPUT_TYPE_VALUE_TEXT = 'text' as const;
export const GEN_AI_OUTPUT_TYPE_VALUE_JSON = 'json' as const;
export const GEN_AI_OUTPUT_TYPE_VALUE_IMAGE = 'image' as const;
export const GEN_AI_OUTPUT_TYPE_VALUE_SPEECH = 'speech' as const;

// ============================================================================
// Metrics
// ============================================================================

export const METRIC_GEN_AI_CLIENT_OPERATION_DURATION =
  'gen_ai.client.operation.duration' as const;
export const METRIC_GEN_AI_CLIENT_TOKEN_USAGE =
  'gen_ai.client.token.usage' as const;
export const METRIC_GEN_AI_SERVER_REQUEST_DURATION =
  'gen_ai.server.request.duration' as const;
export const METRIC_GEN_AI_SERVER_TIME_TO_FIRST_TOKEN =
  'gen_ai.server.time_to_first_token' as const;
export const METRIC_GEN_AI_SERVER_TIME_PER_OUTPUT_TOKEN =
  'gen_ai.server.time_per_output_token' as const;

// ============================================================================
// Events
// ============================================================================

export const EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS =
  'gen_ai.client.inference.operation.details' as const;
export const EVENT_GEN_AI_SYSTEM_MESSAGE = 'gen_ai.system.message' as const;
export const EVENT_GEN_AI_USER_MESSAGE = 'gen_ai.user.message' as const;
export const EVENT_GEN_AI_ASSISTANT_MESSAGE =
  'gen_ai.assistant.message' as const;
export const EVENT_GEN_AI_TOOL_MESSAGE = 'gen_ai.tool.message' as const;
export const EVENT_GEN_AI_CHOICE = 'gen_ai.choice' as const;
