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

// avoids a dependency on @opentelemetry/core for hrTime utilities
import { performance } from 'perf_hooks';

import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Attributes, Context, Histogram, Span } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import { type AnyValue, SeverityNumber } from '@opentelemetry/api-logs';
import type {
  ChatCompletion,
  ChatCompletionMessageToolCall,
  ChatCompletionContentPart,
  ChatCompletionContentPartRefusal,
  ChatCompletionContentPartText,
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionChunk,
  Completions as ChatCompletions,
} from 'openai/resources/chat/completions';
import type {
  CreateEmbeddingResponse,
  Embeddings,
  EmbeddingCreateParams,
} from 'openai/resources/embeddings';
import type {
  Responses,
  Response,
  EasyInputMessage,
  ResponseCodeInterpreterToolCall,
  ResponseComputerToolCall,
  ResponseCreateParams,
  ResponseCustomToolCall,
  ResponseCustomToolCallOutput,
  ResponseFileSearchToolCall,
  ResponseFunctionToolCall,
  ResponseFunctionWebSearch,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseReasoningItem,
  ResponseStreamEvent,
  ResponseInputItem,
} from 'openai/resources/responses/responses';
import type { Stream } from 'openai/streaming';
import {
  ATTR_EVENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_TOKEN_TYPE,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
  EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
  EVENT_GEN_AI_CHOICE,
  EVENT_GEN_AI_SYSTEM_MESSAGE,
  EVENT_GEN_AI_USER_MESSAGE,
  EVENT_GEN_AI_ASSISTANT_MESSAGE,
  EVENT_GEN_AI_TOOL_MESSAGE,
  GEN_AI_TOKEN_TYPE_VALUE_INPUT,
  GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS
} from './semconv';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { getEnvBool, getAttrsFromBaseURL } from './utils';
import type { OpenAIInstrumentationConfig } from './types';
import type {
  APIPromise,
  GenAIMessage,
  GenAIChoiceEventBody,
  GenAISystemMessageEventBody,
  GenAIUserMessageEventBody,
  GenAIAssistantMessageEventBody,
  GenAIToolMessageEventBody,
  GenAIToolCall,
  GenericPart,
  MessagePart,
  OutputMessages,
  TextPart,
  ToolCallRequestPart,
  ToolCallResponsePart,
  ChatMessage,
  InputMessages,
} from './internal-types';

export class OpenAIInstrumentation extends InstrumentationBase<OpenAIInstrumentationConfig> {
  private _genaiClientOperationDuration!: Histogram;
  private _genaiClientTokenUsage!: Histogram;

  constructor(config: OpenAIInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);

    // Possible environment variable overrides for config.
    const cfg = this.getConfig();
    const envCC = getEnvBool(
      'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT',
      this._diag
    );
    if (envCC !== undefined) {
      cfg.captureMessageContent = envCC;
    }
  }

  // Override InstrumentationAbtract.setConfig so we can normalize config.
  override setConfig(config: OpenAIInstrumentationConfig = {}) {
    const { captureMessageContent, ...validConfig } = config;
    (validConfig as OpenAIInstrumentationConfig).captureMessageContent =
      !!captureMessageContent;
    super.setConfig(validConfig);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        'openai',
        ['>=4.19.0 <7'],
        module => {
          const modExports =
            module[Symbol.toStringTag] === 'Module'
              ? module.default // ESM
              : module; // CommonJS
          this._wrap(
            modExports.OpenAI.Chat.Completions.prototype,
            'create',
            this._getPatchedChatCompletionsCreate()
          );
          this._wrap(
            modExports.OpenAI.Embeddings.prototype,
            'create',
            this._getPatchedEmbeddingsCreate()
          );
          this._wrap(
            modExports.OpenAI.Responses.prototype,
            'create',
            this._getPatchedResponsesCreate()
          );

          return modExports;
        },
        module => {
          const modExports =
            module[Symbol.toStringTag] === 'Module'
              ? module.default // ESM
              : module; // CommonJS
          this._unwrap(modExports.OpenAI.Chat.Completions.prototype, 'create');
          this._unwrap(modExports.OpenAI.Embeddings.prototype, 'create');
          this._unwrap(modExports.OpenAI.Responses.prototype, 'create');
        }
      ),
    ];
  }

  // This is a 'protected' method on class `InstrumentationAbstract`.
  override _updateMetricInstruments() {
    this._genaiClientOperationDuration = this.meter.createHistogram(
      METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
      {
        description: 'GenAI operation duration',
        unit: 's',
        advice: {
          explicitBucketBoundaries: [
            0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24,
            20.48, 40.96, 81.92,
          ],
        },
      }
    );
    this._genaiClientTokenUsage = this.meter.createHistogram(
      METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
      {
        description: 'Measures number of input and output tokens used',
        unit: '{token}',
        advice: {
          explicitBucketBoundaries: [
            1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576,
            4194304, 16777216, 67108864,
          ],
        },
      }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _getPatchedChatCompletionsCreate(): any {
    const self = this;
    return (original: ChatCompletions['create']) => {
      // https://platform.openai.com/docs/api-reference/chat/create
      return function patchedCreate(
        this: ChatCompletions,
        ...args: Parameters<ChatCompletions['create']>
      ) {
        if (!self.isEnabled()) {
          return original.apply(this, args);
        }

        self._diag.debug('OpenAI.Chat.Completions.create args: %O', args);
        const params = args[0];
        const config = self.getConfig();
        const startNow = performance.now();

        let startInfo: ReturnType<OpenAIInstrumentation['_startChatCompletionsSpan']>;
        try {
          startInfo = self._startChatCompletionsSpan(
            params,
            config,
            this?._client?.baseURL
          );
        } catch (err) {
          self._diag.error('unexpected error starting span:', err);
          return original.apply(this, args);
        }
        const { span, ctx, commonAttrs } = startInfo;

        const apiPromise = context.with(ctx, () => original.apply(this, args));

        // Streaming.
        if (isStreamPromise(params, apiPromise)) {
          // When streaming, `apiPromise` resolves to `Stream`,
          // an async iterable (i.e. has a `Symbol.asyncIterator` method). We
          // want to wrap that iteration to gather telemetry. Instead of wrapping
          // `Symbol.asyncIterator`, which would be nice, we wrap the `iterator`
          // method because it is used internally by `Stream#tee()`.
          return apiPromise.then(stream => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            self._wrap(stream as any, 'iterator', origIterator => {
              return () => {
                return self._onChatCompletionsStreamIterator(
                  origIterator(),
                  span,
                  startNow,
                  config,
                  commonAttrs,
                  ctx
                );
              };
            });
            return stream;
          });
        }

        // Non-streaming.
        apiPromise
          .then(result => {
            self._onChatCompletionsCreateResult(
              span,
              startNow,
              commonAttrs,
              result as ChatCompletion,
              config,
              ctx
            );
          })
          .catch(
            self._createAPIPromiseRejectionHandler(startNow, span, commonAttrs)
          );

        return apiPromise;
      };
    };
  }

  /**
   * Start a span for this chat-completion API call. This also emits log events
   * as appropriate for the request params.
   */
  _startChatCompletionsSpan(
    params: ChatCompletionCreateParams,
    config: OpenAIInstrumentationConfig,
    baseURL: string | undefined
  ) {
    // Attributes common to span, metrics, log events.
    const commonAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
      [ATTR_GEN_AI_REQUEST_MODEL]: params.model,
      [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
    };
    Object.assign(commonAttrs, getAttrsFromBaseURL(baseURL, this._diag));

    // Span attributes.
    const attrs: Attributes = {
      ...commonAttrs,
    };
    if (params.frequency_penalty != null) {
      attrs[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY] = params.frequency_penalty;
    }
    if (typeof params.max_completion_tokens === 'number') {
      attrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS] =
        params.max_completion_tokens;
    } else if (typeof params.max_tokens === 'number') {
      // `max_tokens` is deprecated in favour of `max_completion_tokens`.
      attrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = params.max_tokens;
    }
    if (typeof params.presence_penalty === 'number') {
      attrs[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY] = params.presence_penalty;
    }
    if (params.stop != null) {
      if (Array.isArray(params.stop)) {
        attrs[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = params.stop;
      } else {
        attrs[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = [params.stop];
      }
    }
    if (params.temperature != null) {
      attrs[ATTR_GEN_AI_REQUEST_TEMPERATURE] = params.temperature;
    }
    if (params.top_p != null) {
      attrs[ATTR_GEN_AI_REQUEST_TOP_P] = params.top_p;
    }

    const span: Span = this.tracer.startSpan(
      `${attrs[ATTR_GEN_AI_OPERATION_NAME]} ${attrs[ATTR_GEN_AI_REQUEST_MODEL]}`,
      {
        kind: SpanKind.CLIENT,
        attributes: attrs,
      }
    );
    const ctx: Context = trace.setSpan(context.active(), span);

    // Capture prompts as log events.
    const timestamp = Date.now();
    params.messages.forEach((msg: ChatCompletionMessageParam) => {
      switch (msg.role) {
        case 'system': {
          const body: GenAISystemMessageEventBody = {};
          if (config.captureMessageContent) {
            if (Array.isArray(msg.content)) {
              body.content = msg.content.map(p => p.text).join('');
            } else {
              body.content = msg.content;
            }
          }
          this.logger.emit({
            timestamp,
            context: ctx,
            severityNumber: SeverityNumber.INFO,
            attributes: {
              [ATTR_EVENT_NAME]: EVENT_GEN_AI_SYSTEM_MESSAGE,
              [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            },
            body,
          });
          break;
        }
        case 'user': {
          const body: GenAIUserMessageEventBody = {};
          if (config.captureMessageContent) {
            if (Array.isArray(msg.content)) {
              body.content = msg.content
                .filter(isTextContent)
                .map(p => p.text)
                .join('');
            } else {
              body.content = msg.content;
            }
          }
          this.logger.emit({
            timestamp,
            context: ctx,
            severityNumber: SeverityNumber.INFO,
            attributes: {
              [ATTR_EVENT_NAME]: EVENT_GEN_AI_USER_MESSAGE,
              [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            },
            body,
          });
          break;
        }
        case 'assistant': {
          const body: GenAIAssistantMessageEventBody = {};
          if (config.captureMessageContent) {
            if (msg.content) {
              if (Array.isArray(msg.content)) {
                body.content = msg.content
                  .filter(isTextContent)
                  .map(p => p.text)
                  .join('');
              } else {
                body.content = msg.content;
              }
            }
            // As of openai@5.12.1, type ChatCompletionMessageToolCall can
            // have type="custom" which has no `function` property. As well,
            // GenAI semconv has since changed how it captures tool calls.
            // For now we just cope: we could capture
            // `ChatCompletionMessageCustomToolCall.Custom` properties, but we
            // don't for now.
            body.tool_calls = msg.tool_calls?.map(tc => {
              const repr: GenAIToolCall = {
                id: tc.id,
                type: tc.type,
              };
              if (tc.type === 'function') {
                repr.function = {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                };
              }
              return repr;
            });
          } else {
            body.tool_calls = msg.tool_calls?.map(tc => {
              const repr: GenAIToolCall = {
                id: tc.id,
                type: tc.type,
              };
              if (tc.type === 'function') {
                repr.function = { name: tc.function.name };
              }
              return repr;
            });
          }
          this.logger.emit({
            timestamp,
            context: ctx,
            severityNumber: SeverityNumber.INFO,
            attributes: {
              [ATTR_EVENT_NAME]: EVENT_GEN_AI_ASSISTANT_MESSAGE,
              [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            },
            body,
          });
          break;
        }
        case 'tool': {
          const body: GenAIToolMessageEventBody = {
            id: msg.tool_call_id,
          };
          if (config.captureMessageContent) {
            if (Array.isArray(msg.content)) {
              body.content = msg.content.map(p => p.text).join('');
            } else {
              body.content = msg.content;
            }
          }
          this.logger.emit({
            timestamp,
            context: ctx,
            severityNumber: SeverityNumber.INFO,
            attributes: {
              [ATTR_EVENT_NAME]: EVENT_GEN_AI_TOOL_MESSAGE,
              [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
            },
            body,
          });
          break;
        }
        default:
          this._diag.debug(
            `unknown message role in OpenAI.Chat.Completions.create: ${msg.role}`
          );
      }
    });

    return { span, ctx, commonAttrs };
  }

  /**
   * This wraps an instance of a `openai/streaming.Stream.iterator()`, an
   * async iterator. It should yield the chunks unchanged, and gather telemetry
   * data from those chunks, then end the span.
   */
  async *_onChatCompletionsStreamIterator(
    iterator: AsyncIterator<ChatCompletionChunk>,
    span: Span,
    startNow: number,
    config: OpenAIInstrumentationConfig,
    commonAttrs: Attributes,
    ctx: Context
  ) {
    const iterable = { [Symbol.asyncIterator]: () => iterator };
    let id: string | undefined;
    let model: string | undefined;
    const finishReasons: string[] = [];
    const choices = [];
    for await (const chunk of iterable) {
      yield chunk;

      // Gather telemetry from this chunk.
      this._diag.debug(
        'OpenAI.Chat.Completions.create stream chunk: %O',
        chunk
      );
      const idx = chunk.choices[0]?.index ?? 0;
      if (!choices[idx]) {
        choices[idx] = {} as {
          content: string;
          toolCalls: ChatCompletionMessageToolCall[];
        };
      }
      if (config.captureMessageContent) {
        const contentPart = chunk.choices[0]?.delta?.content;
        if (contentPart) {
          if (!choices[idx].content) {
            choices[idx].content = '';
          }
          choices[idx].content += contentPart;
        }
      }
      // Assume delta.tool_calls, if exists, is an array of length 1.
      const toolCallPart = chunk.choices[0]?.delta?.tool_calls?.[0];
      if (toolCallPart) {
        if (!choices[idx].toolCalls) {
          choices[idx].toolCalls = [];
        }
        const toolCalls: GenAIToolCall[] = choices[idx].toolCalls;
        if (toolCallPart.id) {
          // First chunk in a tool call.
          const repr: GenAIToolCall = {
            id: toolCallPart.id,
            type: toolCallPart.type,
          };
          if (toolCallPart.type === 'function') {
            repr.function = {
              name: toolCallPart.function?.name,
              arguments: toolCallPart.function?.arguments ?? '',
            };
          }
          toolCalls.push(repr);
        } else if (toolCalls.length > 0) {
          // A tool call chunk with more of the `function.arguments`.
          const lastPart = toolCalls[toolCalls.length - 1];
          if (lastPart.function !== undefined) {
            lastPart.function.arguments +=
              toolCallPart.function?.arguments ?? '';
          }
        }
      }
      if (!id && chunk.id) {
        id = chunk.id;
        span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, id);
      }
      if (!model && chunk.model) {
        model = chunk.model;
        span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);
      }
      if (!finishReasons[idx]) {
        const finishReason = chunk.choices[0]?.finish_reason;
        if (finishReason) {
          finishReasons[idx] = finishReason;
        }
      }
      if (chunk.usage) {
        // A final usage chunk if `stream_options.include_usage: true`.
        span.setAttribute(
          ATTR_GEN_AI_USAGE_INPUT_TOKENS,
          chunk.usage.prompt_tokens
        );
        span.setAttribute(
          ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
          chunk.usage.completion_tokens
        );
        this._genaiClientTokenUsage.record(chunk.usage.prompt_tokens, {
          ...commonAttrs,
          [ATTR_GEN_AI_RESPONSE_MODEL]: model,
          [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
        });
        this._genaiClientTokenUsage.record(chunk.usage.completion_tokens, {
          ...commonAttrs,
          [ATTR_GEN_AI_RESPONSE_MODEL]: model,
          [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
        });
      }
    }
    span.setAttribute(
      ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
      finishReasons.filter(f => f !== undefined)
    );

    // Capture choices as log events.
    for (const [idx, choice] of choices.entries()) {
      if (!choice) {
        continue;
      }
      const message: Partial<GenAIMessage> = {};
      if (
        config.captureMessageContent &&
        choice.content &&
        choice.content.length > 0
      ) {
        message.content = choice.content;
      }
      if (choice.toolCalls && choice.toolCalls.length > 0) {
        message.tool_calls = choice.toolCalls;
        if (!config.captureMessageContent) {
          message.tool_calls.forEach(tc => {
            delete tc.function?.arguments;
          });
        }
      }
      this.logger.emit({
        timestamp: Date.now(),
        context: ctx,
        severityNumber: SeverityNumber.INFO,
        attributes: {
          [ATTR_EVENT_NAME]: EVENT_GEN_AI_CHOICE,
          [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        },
        body: {
          finish_reason: finishReasons[idx],
          index: idx,
          message,
        } as GenAIChoiceEventBody,
      });
    }

    this._genaiClientOperationDuration.record(
      (performance.now() - startNow) / 1000,
      {
        ...commonAttrs,
        [ATTR_GEN_AI_RESPONSE_MODEL]: model,
      }
    );

    span.end();
  }

  _onChatCompletionsCreateResult(
    span: Span,
    startNow: number,
    commonAttrs: Attributes,
    result: ChatCompletion,
    config: OpenAIInstrumentationConfig,
    ctx: Context
  ) {
    this._diag.debug('OpenAI.Chat.Completions.create result: %O', result);
    try {
      span.setAttribute(
        ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
        result.choices.map(c => c.finish_reason)
      );
      span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, result.id);
      span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, result.model);
      if (result.usage) {
        span.setAttribute(
          ATTR_GEN_AI_USAGE_INPUT_TOKENS,
          result.usage.prompt_tokens
        );
        span.setAttribute(
          ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
          result.usage.completion_tokens
        );
      }

      // Capture choices as log events.
      result.choices.forEach(choice => {
        const message: Partial<GenAIMessage> = {};
        if (config.captureMessageContent) {
          // TODO: telemetry diff with streaming case: content=null, no 'role: assistant', 'tool calls (enableCaptureContent=true)' test case
          if (choice.message.content) {
            message.content = choice.message.content;
          }
          if (choice.message.tool_calls) {
            message.tool_calls = choice.message.tool_calls;
          }
        } else {
          if (choice.message.tool_calls) {
            message.tool_calls = choice.message.tool_calls.map(tc => {
              const repr: GenAIToolCall = {
                id: tc.id,
                type: tc.type,
              };
              if (tc.type === 'function') {
                repr.function = { name: tc.function.name };
              }
              return repr;
            });
          }
        }
        this.logger.emit({
          timestamp: Date.now(),
          context: ctx,
          severityNumber: SeverityNumber.INFO,
          attributes: {
            [ATTR_EVENT_NAME]: EVENT_GEN_AI_CHOICE,
            [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
          },
          body: {
            finish_reason: choice.finish_reason,
            index: choice.index,
            message,
          } as GenAIChoiceEventBody,
        });
      });

      this._genaiClientOperationDuration.record(
        (performance.now() - startNow) / 1000,
        {
          ...commonAttrs,
          [ATTR_GEN_AI_RESPONSE_MODEL]: result.model,
        }
      );

      if (result.usage) {
        this._genaiClientTokenUsage.record(result.usage.prompt_tokens, {
          ...commonAttrs,
          [ATTR_GEN_AI_RESPONSE_MODEL]: result.model,
          [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
        });

        this._genaiClientTokenUsage.record(result.usage.completion_tokens, {
          ...commonAttrs,
          [ATTR_GEN_AI_RESPONSE_MODEL]: result.model,
          [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
        });
      }
    } catch (err) {
      this._diag.error(
        'unexpected error getting telemetry from chat result:',
        err
      );
    }
    span.end();
  }

  _createAPIPromiseRejectionHandler(
    startNow: number,
    span: Span,
    commonAttrs: Attributes
  ) {
    return (err: Error) => {
      this._diag.debug('OpenAI APIPromise rejection: %O', err);

      // https://github.com/openai/openai-node/blob/master/src/error.ts
      // The most reliable low cardinality string for errors seems to be
      // the class name. See also:
      // https://platform.openai.com/docs/guides/error-codes
      const errorType = err?.constructor?.name;

      this._genaiClientOperationDuration.record(
        (performance.now() - startNow) / 1000,
        {
          ...commonAttrs,
          'error.type': errorType,
        }
      );

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err.message,
      });

      span.setAttribute('error.type', errorType);
      span.end();
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _getPatchedEmbeddingsCreate(): any {
    const self = this;
    return (original: Embeddings['create']) => {
      // https://platform.openai.com/docs/api-reference/embeddings/create
      return function patchedCreate(
        this: Embeddings,
        ...args: Parameters<Embeddings['create']>
      ) {
        if (!self.isEnabled()) {
          return original.apply(this, args);
        }

        self._diag.debug('OpenAI.Chat.Embeddings.create args: %O', args);
        const params = args[0];
        const startNow = performance.now();

        let startInfo: ReturnType<OpenAIInstrumentation['_startEmbeddingsSpan']>;
        try {
          startInfo = self._startEmbeddingsSpan(params, this?._client?.baseURL);
        } catch (err) {
          self._diag.error('unexpected error starting span:', err);
          return original.apply(this, args);
        }
        const { span, ctx, commonAttrs } = startInfo;

        const apiPromise = context.with(ctx, () => original.apply(this, args));

        apiPromise
          .then(result => {
            self._onEmbeddingsCreateResult(span, startNow, commonAttrs, result);
          })
          .catch(
            self._createAPIPromiseRejectionHandler(startNow, span, commonAttrs)
          );

        return apiPromise;
      };
    };
  }

  /**
   * Start a span for this chat-completion API call. This also emits log events
   * as appropriate for the request params.
   */
  _startEmbeddingsSpan(
    params: EmbeddingCreateParams,
    baseURL: string | undefined
  ) {
    // Attributes common to span, metrics, log events.
    const commonAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
      [ATTR_GEN_AI_REQUEST_MODEL]: params.model,
      [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
    };
    Object.assign(commonAttrs, getAttrsFromBaseURL(baseURL, this._diag));

    // Span attributes.
    const attrs: Attributes = {
      ...commonAttrs,
    };
    if (params.encoding_format != null) {
      attrs[ATTR_GEN_AI_REQUEST_ENCODING_FORMATS] = [params.encoding_format];
    }

    const span = this.tracer.startSpan(
      `${attrs[ATTR_GEN_AI_OPERATION_NAME]} ${attrs[ATTR_GEN_AI_REQUEST_MODEL]}`,
      {
        kind: SpanKind.CLIENT,
        attributes: attrs,
      }
    );
    const ctx = trace.setSpan(context.active(), span);

    return { span, ctx, commonAttrs };
  }

  _onEmbeddingsCreateResult(
    span: Span,
    startNow: number,
    commonAttrs: Attributes,
    result: CreateEmbeddingResponse
  ) {
    this._diag.debug('OpenAI.Embeddings.create result: %O', result);
    try {
      span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, result.model);

      this._genaiClientOperationDuration.record(
        (performance.now() - startNow) / 1000,
        {
          ...commonAttrs,
          [ATTR_GEN_AI_RESPONSE_MODEL]: result.model,
        }
      );

      span.setAttribute(
        ATTR_GEN_AI_USAGE_INPUT_TOKENS,
        result.usage.prompt_tokens
      );
      this._genaiClientTokenUsage.record(result.usage.prompt_tokens, {
        ...commonAttrs,
        [ATTR_GEN_AI_RESPONSE_MODEL]: result.model,
        [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
      });
    } catch (err) {
      this._diag.error(
        'unexpected error getting telemetry from embeddings result:',
        err
      );
    }
    span.end();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _getPatchedResponsesCreate(): any {
    const self = this;
    return (original: Responses['create']) => {
      // https://platform.openai.com/docs/api-reference/responses/create
      return function patchedCreate(
        this: Responses,
        ...args: Parameters<Responses['create']>
      ) {
        if (!self.isEnabled()) {
          return original.apply(this, args);
        }

        self._diag.debug('OpenAI.Responses.create args: %O', args);
        const params = args[0];
        const config = self.getConfig();
        const startNow = performance.now();

        let startInfo: ReturnType<OpenAIInstrumentation['_startResponsesSpan']>;
        try {
          startInfo = self._startResponsesSpan(
            params,
            config,
            this?._client?.baseURL
          );
        } catch (err) {
          self._diag.error('unexpected error starting span:', err);
          return original.apply(this, args);
        }
        const { span, ctx, commonAttrs } = startInfo;

        const apiPromise = context.with(ctx, () => original.apply(this, args));

        // Streaming.
        if (isStreamPromise(params, apiPromise)) {
          return apiPromise.then(stream => {
            self._wrap(stream as Stream<ResponseStreamEvent>, Symbol.asyncIterator, origIterator => {
              return () => {
                return self._onResponsesStreamIterator(
                  origIterator.call(stream),
                  span,
                  startNow,
                  config,
                  commonAttrs,
                  ctx
                );
              };
            });
            return stream;
          });
        }

        // Non-streaming.
        apiPromise
          .then(result => {
            self._onResponsesCreateResult(
              span,
              startNow,
              commonAttrs,
              result as Response,
              config,
              ctx,
            );
          })
          .catch(
            self._createAPIPromiseRejectionHandler(startNow, span, commonAttrs)
          );

        return apiPromise;
      };
    };
  }

  _startResponsesSpan(
    params: ResponseCreateParams,
    config: OpenAIInstrumentationConfig,
    baseURL: string | undefined
  ) {
    // Common attributes for the span, metrics, and log events.
    const commonAttrs: Attributes = Object.assign({
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
      [ATTR_GEN_AI_REQUEST_MODEL]: params.model,
      [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
      [ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]: params.instructions,
    }, getAttrsFromBaseURL(baseURL, this._diag));

    // Span attributes.
    const attrs: Attributes = Object.assign({
      [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: params.max_output_tokens ?? undefined,
      [ATTR_GEN_AI_REQUEST_TEMPERATURE]: params.temperature ?? undefined,
      [ATTR_GEN_AI_REQUEST_TOP_P]: params.top_p ?? undefined,
    }, commonAttrs);

    const span: Span = this.tracer.startSpan(
      `${attrs[ATTR_GEN_AI_OPERATION_NAME]} ${attrs[ATTR_GEN_AI_REQUEST_MODEL]}`,
      {
        kind: SpanKind.CLIENT,
        attributes: attrs,
      }
    );
    const ctx: Context = trace.setSpan(context.active(), span);

    const inputs: InputMessages = new ConvertResponseInputsToInputMessagesUseCase(
      config.captureMessageContent
    ).convert(params);

    // Capture inputs as log events.
    this.logger.emit({
      timestamp: Date.now(),
      context: ctx,
      severityNumber: SeverityNumber.INFO,
      eventName: EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
      attributes: {
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_INPUT_MESSAGES]: undefined // inputs as AnyValue,
      },
      body: inputs as AnyValue,
    });

    return { span, ctx, commonAttrs };
  }

  async *_onResponsesStreamIterator(
    iterator: AsyncIterator<ResponseStreamEvent>,
    span: Span,
    startNow: number,
    config: OpenAIInstrumentationConfig,
    commonAttrs: Attributes,
    ctx: Context
  ) {
    const iterable = { [Symbol.asyncIterator]: () => iterator };
    let model: string | undefined;
    const converter = new ConvertResponseOutputsToOutputMessagesUseCase(config.captureMessageContent);

    for await (const event of iterable) {
      yield event;

      // Gather telemetry from this chunk.
      this._diag.debug(
        'OpenAI.Responses.create stream event: %O',
        event
      );

      switch (event.type) {
        case 'response.created': {
          const response = event.response;
          model = response.model;
          span.setAttributes({
            [ATTR_GEN_AI_RESPONSE_ID]: response.id,
            [ATTR_GEN_AI_RESPONSE_MODEL]: model,
            [ATTR_GEN_AI_CONVERSATION_ID]: response.conversation?.id
          });
          break;
        }
        case 'response.output_item.done': {
          const output = converter.convert([event.item]);
          span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [output[0].finish_reason])
          this.logger.emit({
            timestamp: Date.now(),
            context: ctx,
            severityNumber: SeverityNumber.INFO,
            eventName: EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
            attributes: {
              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
              [ATTR_GEN_AI_OUTPUT_MESSAGES]: undefined // output as AnyValue,
            },
            body: output as AnyValue,
          });
          break;
        }
        case 'response.completed': {
          const usage = event.response.usage;
          span.setAttributes({
            [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: usage?.input_tokens,
            [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: usage?.output_tokens,
          });
          if (usage?.input_tokens) {
            this._genaiClientTokenUsage.record(usage?.input_tokens, {
              ...commonAttrs,
              [ATTR_GEN_AI_RESPONSE_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
            });
          }
          if (usage?.output_tokens) {
            this._genaiClientTokenUsage.record(usage?.output_tokens, {
              ...commonAttrs,
              [ATTR_GEN_AI_RESPONSE_MODEL]: model,
              [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
            });
          }
          break;
        }
      }
    }

    this._genaiClientOperationDuration.record(
      (performance.now() - startNow) / 1000,
      {
        ...commonAttrs,
        [ATTR_GEN_AI_RESPONSE_MODEL]: model,
      }
    );

    span.end();
  }

  _onResponsesCreateResult(
    span: Span,
    startNow: number,
    commonAttrs: Attributes,
    result: Response,
    config: OpenAIInstrumentationConfig,
    ctx: Context,
  ) {
    this._diag.debug('OpenAI.Responses.create result: %O', result);
    const { id, model, conversation, output, usage } = result;
    try {
      if (conversation) {
        span.setAttribute(
          ATTR_GEN_AI_CONVERSATION_ID,
          conversation.id
        );
      }
      span.setAttribute(ATTR_GEN_AI_RESPONSE_ID, id);
      span.setAttribute(ATTR_GEN_AI_RESPONSE_MODEL, model);
      if (usage) {
        span.setAttribute(ATTR_GEN_AI_USAGE_INPUT_TOKENS, usage.input_tokens);
        span.setAttribute(ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, usage.output_tokens);
        this._genaiClientTokenUsage.record(usage.input_tokens, {
          ...commonAttrs,
          [ATTR_GEN_AI_RESPONSE_MODEL]: model,
          [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
        });

        this._genaiClientTokenUsage.record(usage.output_tokens, {
          ...commonAttrs,
          [ATTR_GEN_AI_RESPONSE_MODEL]: model,
          [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
        });
      }

      const outputs = new ConvertResponseOutputsToOutputMessagesUseCase(
        config.captureMessageContent,
      ).convert(output);

      span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [outputs[0].finish_reason])

      // Capture outputs as a log event.
      this.logger.emit({
        timestamp: Date.now(),
        context: ctx,
        severityNumber: SeverityNumber.INFO,
        eventName: EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
        attributes: {
          [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
          [ATTR_GEN_AI_OUTPUT_MESSAGES]: outputs as AnyValue,
        },
        body: outputs as AnyValue,
      });

      this._genaiClientOperationDuration.record(
        (performance.now() - startNow) / 1000,
        {
          ...commonAttrs,
          [ATTR_GEN_AI_RESPONSE_MODEL]: model,
        }
      );
    } catch (err) {
      this._diag.error(
        'unexpected error getting telemetry from chat result:',
        err
      );
    }
    span.end();
  }
}

class ConvertResponseInputsToInputMessagesUseCase {
  constructor(private readonly captureMessageContent = false) { }

  convert(params: ResponseCreateParams): InputMessages {
    const messages: Array<ChatMessage> = [];

    if (typeof params.instructions === 'string') {
      messages.push(this.message({ role: 'system', content: params.instructions }));
    }
    if (typeof params.input === 'string') {
      messages.push(this.message({ role: 'user', content: params.input }));
    } else if (Array.isArray(params.input)) {
      messages.push(...params.input.map((input): ChatMessage => this[input.type ?? 'message'](input as never)));
    }

    return messages;
  }

  message(
    item:
      | EasyInputMessage
      | ResponseInputItem.Message
      | Responses.ResponseInputMessageItem
      | ResponseOutputMessage,
  ): ChatMessage {
    const parts: Array<MessagePart> = [];
    if (typeof item.content === 'string') {
      if (this.captureMessageContent) {
        parts.push({
          type: 'text',
          content: item.content,
        } satisfies TextPart);
      } else {
        parts.push({
          type: 'text',
          content: undefined,
        } satisfies GenericPart);
      }
    } else if (Array.isArray(item.content)) {
      for (const content of item.content) {
        switch (content.type) {
          case 'input_text':
          case 'output_text':
            if (this.captureMessageContent) {
              parts.push({
                type: 'text',
                content: content.text,
              } satisfies TextPart);
            } else {
              parts.push({
                type: 'text',
                content: undefined,
              } satisfies GenericPart);
            }
            break;
          case 'refusal':
            parts.push({
              type: 'refusal',
              refusal: content.refusal,
            } satisfies GenericPart);
            break;
          case 'input_image':
            parts.push({
              ...(this.captureMessageContent ? content : undefined),
              type: 'image',
            } satisfies GenericPart);
            break;
          case 'input_file':
            parts.push({
              ...(this.captureMessageContent ? content : undefined),
              type: 'file',
            } satisfies GenericPart);
            break;
          case 'input_audio': {
            parts.push({
              ...(this.captureMessageContent ? content : undefined),
              type: 'audio',
            } satisfies GenericPart);
            break;
          }
        }
      }
    }

    return {
      role: item.role,
      parts,
    } satisfies ChatMessage;
  }

  function_call(item: ResponseFunctionToolCall): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.name,
          arguments: this.captureMessageContent ? item.arguments : undefined,
          call_id: item.call_id,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  custom_tool_call(item: ResponseCustomToolCall): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.name,
          arguments: this.captureMessageContent ? item.input : undefined,
          call_id: item.call_id,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  reasoning(item: ResponseReasoningItem): ChatMessage {
    const parts: Array<MessagePart> = [];
    for (const summary of item.summary) {
      parts.push({
        type: item.type,
        text: this.captureMessageContent ? summary.text : undefined,
      });
    }
    if (item.content) {
      for (const content of item.content) {
        parts.push({
          type: item.type,
          text: this.captureMessageContent ? content.text : undefined,
        });
      }
    }

    return {
      role: 'assistant',
      parts,
    } satisfies ChatMessage;
  }

  file_search_call(item: ResponseFileSearchToolCall): ChatMessage {
    const parts: Array<MessagePart> = [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.queries : undefined,
      } satisfies ToolCallRequestPart,
    ];
    for (const result of item.results ?? []) {
      parts.push({
        type: 'tool_call_response',
        id: item.id,
        response: this.captureMessageContent ? result : undefined,
      } satisfies ToolCallResponsePart);
    }

    return {
      role: 'assistant',
      parts,
    } satisfies ChatMessage;
  }

  web_search_call(item: ResponseFunctionWebSearch): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.type,
          // @ts-expect-error: action is missing on Responses.ResponseFunctionWebSearch type
          arguments: this.captureMessageContent ? item.action : undefined,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  computer_call(item: ResponseComputerToolCall): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.type,
          arguments: this.captureMessageContent ? item.action : undefined,
          call_id: item.call_id,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  computer_call_output(item: ResponseInputItem.ComputerCallOutput): ChatMessage {
    return {
      role: 'user',
      parts: [
        {
          type: 'tool_call_response',
          id: item.id,
          response: this.captureMessageContent ? item.output : undefined,
          call_id: item.call_id,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  code_interpreter_call(item: ResponseCodeInterpreterToolCall): ChatMessage {
    const parts: Array<MessagePart> = [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.code : undefined,
      } satisfies ToolCallRequestPart,
    ];
    for (const output of item.outputs ?? []) {
      switch (output.type) {
        case 'image':
          parts.push({
            type: 'tool_call_response',
            id: item.id,
            response: this.captureMessageContent ? output.url : undefined,
          } satisfies ToolCallResponsePart);
          break;
        case 'logs':
          parts.push({
            type: 'tool_call_response',
            id: item.id,
            response: this.captureMessageContent ? output.logs : undefined,
          } satisfies ToolCallResponsePart);
          break;
      }
    }

    return {
      role: 'assistant',
      parts,
    } satisfies ChatMessage;
  }

  image_generation_call(
    item:
      | ResponseInputItem.ImageGenerationCall
      | ResponseOutputItem.ImageGenerationCall,
  ): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.type,
        } satisfies ToolCallRequestPart,
        {
          type: 'tool_call_response',
          id: item.id,
          response: this.captureMessageContent ? item.result : undefined,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  function_call_output(item: ResponseInputItem.FunctionCallOutput): ChatMessage {
    return {
      role: 'user',
      parts: [
        {
          type: 'tool_call_response',
          id: item.id,
          response: this.captureMessageContent ? item.output : undefined,
          call_id: item.call_id,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  local_shell_call(
    item:
      | ResponseInputItem.LocalShellCall
      | ResponseOutputItem.LocalShellCall,
  ): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.type,
          arguments: this.captureMessageContent ? item.action : undefined,
          call_id: item.call_id,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  local_shell_call_output(item: ResponseInputItem.LocalShellCallOutput): ChatMessage {
    return {
      role: 'user',
      parts: [
        {
          type: 'tool_call_response',
          id: item.id,
          response: this.captureMessageContent ? item.output : undefined,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  mcp_call(
    item: ResponseInputItem.McpCall | ResponseOutputItem.McpCall,
  ): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.type,
          arguments: this.captureMessageContent ? `${item.name}(${item.arguments})` : undefined,
          server: item.server_label,
        } satisfies ToolCallRequestPart,
        {
          type: 'tool_call_response',
          id: item.id,
          response: item.error
            ? item.error
            : this.captureMessageContent
              ? item.output
              : undefined,
          server: item.server_label,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  mcp_list_tools(item: ResponseInputItem.McpListTools): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call_response',
          id: item.id,
          response: item.error
            ? item.error
            : this.captureMessageContent
              ? item.tools
              : undefined,
          server: item.server_label,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  mcp_approval_request(item: ResponseInputItem.McpApprovalRequest): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: `${item.type}${this.captureMessageContent ? `: ${item.name}` : ''}`,
          arguments: this.captureMessageContent ? item.arguments : undefined,
          server: item.server_label,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  mcp_approval_response(item: ResponseInputItem.McpApprovalResponse): ChatMessage {
    return {
      role: 'user',
      parts: [
        {
          type: 'tool_call_response',
          response: this.captureMessageContent ? item.approve : undefined,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  custom_tool_call_output(item: ResponseCustomToolCallOutput): ChatMessage {
    return {
      role: 'user',
      parts: [
        {
          type: 'tool_call_response',
          id: item.id,
          response: this.captureMessageContent ? item.output : undefined,
          call_id: item.call_id,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  item_reference(item: ResponseInputItem.ItemReference): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'item_reference',
          id: item.id,
        } satisfies GenericPart,
      ],
    } satisfies ChatMessage;
  }
}

class ConvertResponseOutputsToOutputMessagesUseCase {
  constructor(private readonly captureMessageContent = false) { }

  convert(responseOutput: Array<ResponseOutputItem>): OutputMessages {
    const parts: Array<MessagePart> = responseOutput.flatMap((item: ResponseOutputItem) => this[item.type](item as never));

    return [
      {
        role: 'assistant',
        parts,
        finish_reason: parts[parts.length - 1]?.type === 'tool_call' ? 'tool_call' : 'stop',
      },
    ];

  }

  message(item: ResponseOutputMessage): Array<MessagePart> {
    const parts: Array<MessagePart> = [];
    for (const content of item.content) {
      switch (content.type) {
        case 'output_text':
          if (this.captureMessageContent) {
            parts.push({
              type: 'text',
              content: content.text,
            } satisfies TextPart);
          } else {
            parts.push({
              type: 'text',
              content: undefined,
            } satisfies GenericPart);
          }
          break;
        case 'refusal':
          parts.push({
            type: content.type,
            refusal: content.refusal,
          } satisfies GenericPart);
          break;
      }
    }

    return parts;
  }

  function_call(item: ResponseFunctionToolCall): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.name,
        arguments: this.captureMessageContent ? item.arguments : undefined,
        call_id: item.call_id,
      } satisfies ToolCallRequestPart
    ];
  }

  custom_tool_call(item: ResponseCustomToolCall): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.name,
        arguments: this.captureMessageContent ? item.input : undefined,
        call_id: item.call_id,
      } satisfies ToolCallRequestPart
    ];
  }

  reasoning(item: ResponseReasoningItem): Array<MessagePart> {
    const parts: Array<MessagePart> = [];
    for (const summary of item.summary) {
      parts.push({
        type: item.type,
        text: this.captureMessageContent ? summary.text : undefined,
      });
    }
    if (item.content) {
      for (const content of item.content) {
        parts.push({
          type: item.type,
          text: this.captureMessageContent ? content.text : undefined,
        });
      }
    }

    return parts;
  }

  file_search_call(item: ResponseFileSearchToolCall): Array<MessagePart> {
    const parts: Array<MessagePart> = [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.queries : undefined,
      } satisfies ToolCallRequestPart
    ];
    for (const result of item.results ?? []) {
      parts.push({
        type: 'tool_call_response',
        id: item.id,
        response: this.captureMessageContent ? result : undefined,
      } satisfies ToolCallResponsePart);
    }

    return parts;
  }

  web_search_call(item: ResponseFunctionWebSearch): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        // @ts-expect-error: action is missing on Responses.ResponseFunctionWebSearch type
        arguments: this.captureMessageContent ? item.action : undefined,
      } satisfies ToolCallRequestPart,
    ];
  }

  computer_call(item: ResponseComputerToolCall): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.action : undefined,
        call_id: item.call_id,
      } satisfies ToolCallRequestPart,
    ];
  }

  code_interpreter_call(item: ResponseCodeInterpreterToolCall): Array<MessagePart> {
    const parts: Array<MessagePart> = [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.code : undefined,
      } satisfies ToolCallRequestPart,
    ];
    for (const output of item.outputs ?? []) {
      switch (output.type) {
        case 'image':
          parts.push({
            type: 'tool_call_response',
            id: item.id,
            response: this.captureMessageContent ? output.url : undefined,
          } satisfies ToolCallResponsePart);
          break;
        case 'logs':
          parts.push({
            type: 'tool_call_response',
            id: item.id,
            response: this.captureMessageContent ? output.logs : undefined,
          } satisfies ToolCallResponsePart);
          break;
      }
    }

    return parts;
  }

  image_generation_call(
    item: ResponseOutputItem.ImageGenerationCall,
  ): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
      } satisfies ToolCallRequestPart,
      {
        type: 'tool_call_response',
        id: item.id,
        response: this.captureMessageContent ? item.result : undefined,
      } satisfies ToolCallResponsePart,
    ];
  }

  local_shell_call(item: ResponseOutputItem.LocalShellCall): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.action : undefined,
        call_id: item.call_id,
      } satisfies ToolCallRequestPart,
    ];
  }

  mcp_call(item: ResponseOutputItem.McpCall): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.name,
        arguments: this.captureMessageContent ? `${item.name}(${item.arguments})` : undefined,
        server: item.server_label,
      } satisfies ToolCallRequestPart,
      {
        type: 'tool_call_response',
        id: item.id,
        response: item.error
          ? item.error
          : this.captureMessageContent
            ? item.output
            : undefined,
        server: item.server_label,
      } satisfies ToolCallResponsePart
    ];
  }

  mcp_list_tools(item: ResponseOutputItem.McpListTools): Array<MessagePart> {
    return [
      {
        type: 'tool_call_response',
        id: item.id,
        response: item.error
          ? item.error
          : this.captureMessageContent
            ? item.tools
            : undefined,
        server: item.server_label,
      } satisfies ToolCallResponsePart,
    ];
  }

  mcp_approval_request(
    item: ResponseOutputItem.McpApprovalRequest,
  ): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: `${item.type}${this.captureMessageContent ? `: ${item.name}` : ''}`,
        arguments: this.captureMessageContent ? item.arguments : undefined,
        server: item.server_label,
      } satisfies ToolCallRequestPart,
    ];
  }
}

function isTextContent(
  value: ChatCompletionContentPart | ChatCompletionContentPartRefusal
): value is ChatCompletionContentPartText {
  return value.type === 'text';
}

function isStreamPromise<
  Params extends { stream?: boolean | null } | undefined,
  Chunk,
  NonStream
>(
  params: Params,
  value: APIPromise<Stream<Chunk> | NonStream>
): value is APIPromise<Stream<Chunk>> {
  return Boolean(params?.stream);
}
