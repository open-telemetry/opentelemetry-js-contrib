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
import { SeverityNumber } from '@opentelemetry/api-logs';
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
import type { APIPromise } from 'openai/core';
import type {
  CreateEmbeddingResponse,
  Embeddings,
  EmbeddingCreateParams,
} from 'openai/resources/embeddings';
import type { Stream } from 'openai/streaming';

import {
  ATTR_EVENT_NAME,
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
  ATTR_GEN_AI_TOKEN_TYPE,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
} from './semconv';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { getEnvBool, getAttrsFromBaseURL } from './utils';
import { OpenAIInstrumentationConfig } from './types';
import {
  GenAIMessage,
  GenAIChoiceEventBody,
  GenAISystemMessageEventBody,
  GenAIUserMessageEventBody,
  GenAIAssistantMessageEventBody,
  GenAIToolMessageEventBody,
} from './internal-types';

// The JS semconv package doesn't yet emit constants for event names.
// TODO: otel-js issue for semconv pkg not including event names
const EVENT_GEN_AI_SYSTEM_MESSAGE = 'gen_ai.system.message';
const EVENT_GEN_AI_USER_MESSAGE = 'gen_ai.user.message';
const EVENT_GEN_AI_ASSISTANT_MESSAGE = 'gen_ai.assistant.message';
const EVENT_GEN_AI_TOOL_MESSAGE = 'gen_ai.tool.message';
const EVENT_GEN_AI_CHOICE = 'gen_ai.choice';

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
        ['>=4.19.0 <6'],
        modExports => {
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

          return modExports;
        },
        modExports => {
          this._unwrap(modExports.OpenAI.Chat.Completions.prototype, 'create');
          this._unwrap(modExports.OpenAI.Embeddings.prototype, 'create');
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

  _getPatchedChatCompletionsCreate() {
    const self = this;
    return (original: ChatCompletions['create']) => {
      // https://platform.openai.com/docs/api-reference/chat/create
      return function patchedCreate(
        this: ChatCompletions,
        ...args: Parameters<ChatCompletions['create']>
      ) {
        if (!self.isEnabled) {
          return original.apply(this, args);
        }

        self._diag.debug('OpenAI.Chat.Completions.create args: %O', args);
        const params = args[0];
        const config = self.getConfig();
        const startNow = performance.now();

        let startInfo;
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
      [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
      [ATTR_GEN_AI_REQUEST_MODEL]: params.model,
      [ATTR_GEN_AI_SYSTEM]: 'openai',
    };
    Object.assign(commonAttrs, getAttrsFromBaseURL(baseURL, this._diag));

    // Span attributes.
    const attrs: Attributes = {
      ...commonAttrs,
    };
    if (params.frequency_penalty != null) {
      attrs[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY] = params.frequency_penalty;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((params as any).max_completion_tokens != null) {
      attrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS] =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (params as any).max_completion_tokens;
    } else if (params.max_tokens != null) {
      // `max_tokens` is deprecated in favour of `max_completion_tokens`.
      attrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = params.max_tokens;
    }
    if (params.presence_penalty != null) {
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
              [ATTR_GEN_AI_SYSTEM]: 'openai',
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
              [ATTR_GEN_AI_SYSTEM]: 'openai',
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
            body.tool_calls = msg.tool_calls?.map(tc => {
              return {
                id: tc.id,
                type: tc.type,
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                },
              };
            });
          } else {
            body.tool_calls = msg.tool_calls?.map(tc => {
              return {
                id: tc.id,
                type: tc.type,
                function: { name: tc.function.name },
              };
            });
          }
          this.logger.emit({
            timestamp,
            context: ctx,
            severityNumber: SeverityNumber.INFO,
            attributes: {
              [ATTR_EVENT_NAME]: EVENT_GEN_AI_ASSISTANT_MESSAGE,
              [ATTR_GEN_AI_SYSTEM]: 'openai',
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
              [ATTR_GEN_AI_SYSTEM]: 'openai',
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
    streamIter: AsyncIterator<ChatCompletionChunk>,
    span: Span,
    startNow: number,
    config: OpenAIInstrumentationConfig,
    commonAttrs: Attributes,
    ctx: Context
  ) {
    let id;
    let model;
    const finishReasons: string[] = [];
    const choices = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of streamIter as any) {
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
        const toolCalls = choices[idx].toolCalls;
        if (toolCallPart.id) {
          // First chunk in a tool call.
          toolCalls.push({
            id: toolCallPart.id,
            type: toolCallPart.type,
            function: {
              name: toolCallPart.function?.name,
              arguments: toolCallPart.function?.arguments ?? '',
            },
          });
        } else if (toolCalls.length > 0) {
          // A tool call chunk with more of the `function.arguments`.
          toolCalls[toolCalls.length - 1].function.arguments +=
            toolCallPart.function?.arguments ?? '';
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
          [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
        });
        this._genaiClientTokenUsage.record(chunk.usage.completion_tokens, {
          ...commonAttrs,
          [ATTR_GEN_AI_RESPONSE_MODEL]: model,
          [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
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
          [ATTR_GEN_AI_SYSTEM]: 'openai',
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
              return {
                id: tc.id,
                type: tc.type,
                function: { name: tc.function.name },
              };
            });
          }
        }
        this.logger.emit({
          timestamp: Date.now(),
          context: ctx,
          severityNumber: SeverityNumber.INFO,
          attributes: {
            [ATTR_EVENT_NAME]: EVENT_GEN_AI_CHOICE,
            [ATTR_GEN_AI_SYSTEM]: 'openai',
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
          [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
        });

        this._genaiClientTokenUsage.record(result.usage.completion_tokens, {
          ...commonAttrs,
          [ATTR_GEN_AI_RESPONSE_MODEL]: result.model,
          [ATTR_GEN_AI_TOKEN_TYPE]: 'output',
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

  _getPatchedEmbeddingsCreate() {
    const self = this;
    return (original: Embeddings['create']) => {
      // https://platform.openai.com/docs/api-reference/embeddings/create
      return function patchedCreate(
        this: Embeddings,
        ...args: Parameters<Embeddings['create']>
      ) {
        if (!self.isEnabled) {
          return original.apply(this, args);
        }

        self._diag.debug('OpenAI.Chat.Embeddings.create args: %O', args);
        const params = args[0];
        const startNow = performance.now();

        let startInfo;
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
      [ATTR_GEN_AI_OPERATION_NAME]: 'embeddings',
      [ATTR_GEN_AI_REQUEST_MODEL]: params.model,
      [ATTR_GEN_AI_SYSTEM]: 'openai',
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
        [ATTR_GEN_AI_TOKEN_TYPE]: 'input',
      });
    } catch (err) {
      this._diag.error(
        'unexpected error getting telemetry from embeddings result:',
        err
      );
    }
    span.end();
  }
}

function isTextContent(
  value: ChatCompletionContentPart | ChatCompletionContentPartRefusal
): value is ChatCompletionContentPartText {
  return value.type === 'text';
}

function isStreamPromise(
  params: ChatCompletionCreateParams | undefined,
  value: APIPromise<Stream<ChatCompletionChunk> | ChatCompletion>
): value is APIPromise<Stream<ChatCompletionChunk>> {
  if (params && params.stream) {
    return true;
  }
  return false;
}
