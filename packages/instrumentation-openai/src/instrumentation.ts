/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  metrics,
  SeverityNumber,
  trace,
  type AnyValue,
  type Attributes,
  type Context,
  type MeterProvider,
  type TracerProvider,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import {
  ENV_GENAI_CAPTURE_MESSAGE_CONTENT,
  TelemetryHandler,
  getContentCaptureMode,
  getErrorType,
  type ContentCaptureMode,
  type EmbeddingInvocation,
  type FinishReason,
  type GenAIInstrumentationConfig,
  type InferenceInvocation,
  type InferenceInvocationOptions,
  type InputMessages as GenaiInputMessages,
  type MessagePart,
  type OutputMessages,
} from '@opentelemetry/genai-util';
import type {
  ChatCompletion,
  ChatCompletionMessageToolCall,
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionChunk,
  Completions as ChatCompletions,
} from 'openai/resources/chat/completions';
import type { Embeddings, EmbeddingCreateParams } from 'openai/resources/embeddings';
import type {
  Responses,
  Response,
  ResponseCreateParams,
  ResponseStreamEvent,
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
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
  EVENT_GEN_AI_CHOICE,
  EVENT_GEN_AI_SYSTEM_MESSAGE,
  EVENT_GEN_AI_USER_MESSAGE,
  EVENT_GEN_AI_ASSISTANT_MESSAGE,
  EVENT_GEN_AI_TOOL_MESSAGE,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
} from './semconv';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import {
  chatCompletionParamsToInferenceRequestOptions,
  formatChatMessageContent,
  getAttrsFromBaseURL,
  getEnvBool,
  getProviderNameFromBaseURL,
  getServerFromBaseURL,
  responseCreateParamsToInferenceRequestOptions,
  tokenUsageDetailsFromChatCompletionUsage,
  tokenUsageDetailsFromResponsesUsage,
} from './utils';
import {
  ConvertResponseInputsToInputMessagesUseCase,
  ConvertResponseOutputsToOutputMessagesUseCase,
} from './responses';
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
} from './internal-types';

export class OpenAIInstrumentation extends InstrumentationBase<OpenAIInstrumentationConfig> {
  private _telemetryHandler: TelemetryHandler | undefined;
  private _explicitTracerProvider: TracerProvider | undefined;
  private _explicitMeterProvider: MeterProvider | undefined;

  constructor(config: OpenAIInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);

    // Boolean env (true/false) is handled in `_getEffectiveContentCaptureMode`
    // so it maps to `span_only` / `none` like the previous instrumentation.
    const cfg = this.getConfig();
    const envCC = getEnvBool(ENV_GENAI_CAPTURE_MESSAGE_CONTENT, this._diag);
    if (envCC === true) {
      cfg.captureMessageContent = 'span_only';
    } else if (envCC === false) {
      cfg.captureMessageContent = 'none';
    }
  }

  // Override InstrumentationAbtract.setConfig so we can normalize config.
  override setConfig(config: OpenAIInstrumentationConfig = {}) {
    const { captureMessageContent, ...rest } = config;
    const validConfig: OpenAIInstrumentationConfig = { ...rest };
    if (captureMessageContent !== undefined) {
      validConfig.captureMessageContent =
        typeof captureMessageContent === 'boolean'
          ? captureMessageContent
            ? 'span_only'
            : 'none'
          : captureMessageContent;
    }
    this._telemetryHandler = undefined;
    super.setConfig(validConfig);
  }

  override setTracerProvider(tracerProvider: TracerProvider): void {
    super.setTracerProvider(tracerProvider);
    this._explicitTracerProvider = tracerProvider;
    this._telemetryHandler = undefined;
  }

  override setMeterProvider(meterProvider: MeterProvider): void {
    super.setMeterProvider(meterProvider);
    this._explicitMeterProvider = meterProvider;
    this._telemetryHandler = undefined;
  }

  /**
   * Effective content capture mode: boolean env from this package first, then
   * genai-util env + normalized config.
   */
  private _getEffectiveContentCaptureMode(): ContentCaptureMode {
    const envBool = getEnvBool(ENV_GENAI_CAPTURE_MESSAGE_CONTENT, this._diag);
    if (envBool === true) {
      return 'span_only';
    }
    if (envBool === false) {
      return 'none';
    }
    const cfg = this.getConfig().captureMessageContent;
    const normalized: ContentCaptureMode | undefined =
      typeof cfg === 'boolean' ? (cfg ? 'span_only' : 'none') : cfg;
    return getContentCaptureMode(normalized);
  }

  private _genAiConfigForTelemetryHandler(): GenAIInstrumentationConfig {
    return { captureMessageContent: this._getEffectiveContentCaptureMode() };
  }

  private _shouldCaptureMessageContent(): boolean {
    return this._getEffectiveContentCaptureMode() !== 'none';
  }

  private _getTelemetryHandler(): TelemetryHandler {
    return (this._telemetryHandler ??= new TelemetryHandler({
      instrumentationName: PACKAGE_NAME,
      instrumentationVersion: PACKAGE_VERSION,
      tracerProvider:
        this._explicitTracerProvider ?? trace.getTracerProvider(),
      meterProvider: this._explicitMeterProvider ?? metrics.getMeterProvider(),
      diag: this._diag,
      config: this._genAiConfigForTelemetryHandler(),
    }));
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
          if (modExports.OpenAI.Responses) {
            this._wrap(
              modExports.OpenAI.Responses.prototype,
              'create',
              this._getPatchedResponsesCreate()
            );
          }

          return modExports;
        },
        module => {
          const modExports =
            module[Symbol.toStringTag] === 'Module'
              ? module.default // ESM
              : module; // CommonJS
          this._unwrap(modExports.OpenAI.Chat.Completions.prototype, 'create');
          this._unwrap(modExports.OpenAI.Embeddings.prototype, 'create');
          if (modExports.OpenAI.Responses) {
            this._unwrap(modExports.OpenAI.Responses.prototype, 'create');
          }
        }
      ),
    ];
  }

  // Metrics are created by TelemetryHandler (gen_ai-util).
  override _updateMetricInstruments(): void {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _getPatchedChatCompletionsCreate(): any {
    const self = this;
    return (original: ChatCompletions['create']) => {
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
        const captureContent = self._shouldCaptureMessageContent();
        const baseURL = this?._client?.baseURL;

        let invocation: InferenceInvocation;
        try {
          invocation = self._startChatCompletionInvocation(
            params,
            config,
            baseURL
          );
        } catch (err) {
          self._diag.error('unexpected error starting invocation:', err);
          return original.apply(this, args);
        }

        const ctx = invocation.getContext();
        const apiPromise = context.with(ctx, () => original.apply(this, args));

        if (isStreamPromise(params, apiPromise)) {
          type StreamAccum = {
            id?: string;
            model?: string;
            finishReasons: string[];
            choices: Array<{
              content?: string;
              toolCalls?: ChatCompletionMessageToolCall[];
            }>;
          };
          const acc: StreamAccum = { finishReasons: [], choices: [] };

          apiPromise
            .then(stream => {
              self._getTelemetryHandler().wrapAsyncStream(
                stream as Stream<ChatCompletionChunk>,
                {
                invocation,
                onChunk: (chunk: ChatCompletionChunk) => {
                  self._diag.debug(
                    'OpenAI.Chat.Completions.create stream chunk: %O',
                    chunk
                  );
                  const idx = chunk.choices?.[0]?.index ?? 0;
                  if (!acc.choices[idx]) {
                    acc.choices[idx] = {};
                  }
                  const choiceAcc = acc.choices[idx]!;
                  if (captureContent) {
                    const contentPart = chunk.choices?.[0]?.delta?.content;
                    if (contentPart) {
                      choiceAcc.content = (choiceAcc.content ?? '') + contentPart;
                    }
                  }
                  const toolCallPart = chunk.choices?.[0]?.delta?.tool_calls?.[0];
                  if (toolCallPart) {
                    if (!choiceAcc.toolCalls) {
                      choiceAcc.toolCalls = [];
                    }
                    const toolCalls = choiceAcc.toolCalls;
                    if (toolCallPart.id) {
                      if (toolCallPart.type === 'function') {
                        const repr: ChatCompletionMessageToolCall = {
                          id: toolCallPart.id,
                          type: 'function',
                          function: {
                            name: toolCallPart.function?.name ?? '',
                            arguments: toolCallPart.function?.arguments ?? '',
                          },
                        };
                        toolCalls.push(repr);
                      }
                    } else if (toolCalls.length > 0) {
                      const lastPart = toolCalls[toolCalls.length - 1];
                      if (
                        lastPart.type === 'function' &&
                        lastPart.function !== undefined
                      ) {
                        lastPart.function.arguments +=
                          toolCallPart.function?.arguments ?? '';
                      }
                    }
                  }
                  if (!acc.id && chunk.id) {
                    acc.id = chunk.id;
                    invocation.setResponseId(chunk.id);
                  }
                  if (!acc.model && chunk.model) {
                    acc.model = chunk.model;
                    invocation.setResponseModel(chunk.model);
                  }
                  const fr = chunk.choices?.[0]?.finish_reason;
                  if (fr) {
                    acc.finishReasons[idx] = fr;
                  }
                  if (chunk.usage) {
                    const usageDetails =
                      tokenUsageDetailsFromChatCompletionUsage(chunk.usage);
                    if (usageDetails) {
                      invocation.setUsage(usageDetails);
                    }
                  }
                },
                onEnd: async () => {
                  const reasons = acc.finishReasons.filter(
                    r => r !== undefined
                  );
                  if (reasons.length > 0) {
                    invocation.setFinishReasons(reasons as FinishReason[]);
                  }
                  const outputs = self._chatStreamAccumToOutputMessages(
                    acc,
                    captureContent
                  );
                  if (outputs.length > 0) {
                    invocation.addOutputMessages(outputs);
                  }
                  self._emitChatCompletionChoiceLogs(ctx, captureContent, acc);
                },
              });
              return stream;
            })
            .catch((err: Error) => {
              invocation.fail({
                exception: err,
                errorType: getErrorType(err),
                statusDescription: err.message,
              });
            });
          return apiPromise;
        }

        apiPromise
          .then(result => {
            try {
              self._finalizeChatCompletionSync(
                invocation,
                result as ChatCompletion,
                captureContent,
                ctx
              );
              invocation.stop();
            } catch (err) {
              self._diag.error(
                'unexpected error getting telemetry from chat result:',
                err
              );
              invocation.stop();
            }
          })
          .catch((err: Error) => {
            invocation.fail({
              exception: err,
              errorType: getErrorType(err),
              statusDescription: err.message,
            });
          });

        return apiPromise;
      };
    };
  }

  private _chatCompletionParamsToInputMessages(
    params: ChatCompletionCreateParams,
    capture: boolean
  ): GenaiInputMessages {
    return params.messages.map((msg: ChatCompletionMessageParam) => {
      const parts: MessagePart[] = [];
      switch (msg.role) {
        case 'system':
        case 'user': {
          if (Array.isArray(msg.content)) {
            for (const p of msg.content as ReadonlyArray<{
              type?: string;
              text?: string;
            }>) {
              if (p.type === 'text' && typeof p.text === 'string') {
                parts.push({
                  type: 'text',
                  content: capture ? p.text : '',
                });
              } else if (p.type === 'refusal' && 'refusal' in p) {
                const refusal = (p as { refusal?: string }).refusal;
                if (typeof refusal === 'string') {
                  parts.push({ type: 'text', content: capture ? refusal : '' });
                }
              } else if (p.type === 'image_url') {
                parts.push({
                  type: 'text',
                  content: '[image]',
                });
              }
            }
          } else if (typeof msg.content === 'string') {
            parts.push({
              type: 'text',
              content: capture ? msg.content : '',
            });
          }
          return { role: msg.role, parts };
        }
        case 'assistant': {
          if (msg.content) {
            if (Array.isArray(msg.content)) {
              const text = formatChatMessageContent(
                msg.content as Parameters<typeof formatChatMessageContent>[0]
              );
              if (text.length > 0) {
                parts.push({ type: 'text', content: capture ? text : '' });
              }
            } else {
              parts.push({
                type: 'text',
                content: capture ? String(msg.content) : '',
              });
            }
          }
          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              if (tc.type === 'function') {
                parts.push({
                  type: 'tool_call',
                  id: tc.id,
                  name: tc.function.name,
                  arguments: capture ? tc.function.arguments : undefined,
                });
              }
            }
          }
          return { role: 'assistant', parts };
        }
        case 'tool': {
          let text = '';
          if (capture) {
            if (Array.isArray(msg.content)) {
              text = msg.content.map(p => p.text).join('');
            } else if (typeof msg.content === 'string') {
              text = msg.content;
            }
          }
          parts.push({
            type: 'tool_call_response',
            id: msg.tool_call_id,
            response: text,
          });
          return { role: 'tool', parts };
        }
        default:
          this._diag.debug(
            `unknown message role mapping for genai input: ${(msg as { role?: string }).role}`
          );
          return { role: 'user', parts };
      }
    });
  }

  private _startChatCompletionInvocation(
    params: ChatCompletionCreateParams,
    config: OpenAIInstrumentationConfig,
    baseURL: string | undefined
  ): InferenceInvocation {
    const providerName = getProviderNameFromBaseURL(baseURL, this._diag);
    const { serverAddress, serverPort } = getServerFromBaseURL(
      baseURL,
      this._diag
    );
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
      [ATTR_GEN_AI_REQUEST_MODEL]: params.model,
      [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
      [ATTR_GEN_AI_PROVIDER_NAME]: providerName,
    };
    Object.assign(metricAttrs, getAttrsFromBaseURL(baseURL, this._diag));

    const extraAttrs: Attributes = {
      [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
    };
    if (params.frequency_penalty != null) {
      extraAttrs[ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY] =
        params.frequency_penalty;
    }
    if (typeof params.max_completion_tokens === 'number') {
      extraAttrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS] =
        params.max_completion_tokens;
    } else if (typeof params.max_tokens === 'number') {
      extraAttrs[ATTR_GEN_AI_REQUEST_MAX_TOKENS] = params.max_tokens;
    }
    if (typeof params.presence_penalty === 'number') {
      extraAttrs[ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY] =
        params.presence_penalty;
    }
    if (params.stop != null) {
      extraAttrs[ATTR_GEN_AI_REQUEST_STOP_SEQUENCES] = Array.isArray(
        params.stop
      )
        ? params.stop
        : [params.stop];
    }
    if (params.temperature != null) {
      extraAttrs[ATTR_GEN_AI_REQUEST_TEMPERATURE] = params.temperature;
    }
    if (params.top_p != null) {
      extraAttrs[ATTR_GEN_AI_REQUEST_TOP_P] = params.top_p;
    }

    const invocationOpts: InferenceInvocationOptions = {
      providerName,
      operationName: GEN_AI_OPERATION_NAME_VALUE_CHAT,
      requestModel: params.model,
      requestOptions: chatCompletionParamsToInferenceRequestOptions(params),
      inputMessages: this._chatCompletionParamsToInputMessages(
        params,
        this._shouldCaptureMessageContent()
      ),
      serverAddress,
      serverPort,
      metricAttributes: metricAttrs,
      attributes: extraAttrs,
    };

    const invocation = this._getTelemetryHandler().startInference(invocationOpts);
    const ctx = invocation.getContext();

    const timestamp = Date.now();
    const captureContent = this._shouldCaptureMessageContent();
    params.messages.forEach((msg: ChatCompletionMessageParam) => {
      switch (msg.role) {
        case 'system': {
          const body: GenAISystemMessageEventBody = {};
          if (captureContent) {
            if (Array.isArray(msg.content)) {
              body.content = formatChatMessageContent(msg.content);
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
          if (captureContent) {
            if (Array.isArray(msg.content)) {
              body.content = formatChatMessageContent(msg.content);
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
          if (captureContent) {
            if (msg.content) {
              if (Array.isArray(msg.content)) {
                body.content = formatChatMessageContent(msg.content);
              } else {
                body.content = msg.content;
              }
            }
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
          if (captureContent) {
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

    return invocation;
  }

  private _chatStreamAccumToOutputMessages(
    acc: {
      finishReasons: string[];
      choices: Array<{
        content?: string;
        toolCalls?: ChatCompletionMessageToolCall[];
      }>;
    },
    captureContent: boolean
  ): OutputMessages {
    const out: OutputMessages = [];
    for (const [idx, choice] of acc.choices.entries()) {
      if (!choice) {
        continue;
      }
      const parts: MessagePart[] = [];
      if (
        captureContent &&
        choice.content &&
        choice.content.length > 0
      ) {
        parts.push({ type: 'text', content: choice.content });
      }
      if (choice.toolCalls) {
        for (const tc of choice.toolCalls) {
          if (tc.type === 'function') {
            parts.push({
              type: 'tool_call',
              id: tc.id,
              name: tc.function.name,
              arguments: captureContent ? tc.function.arguments : undefined,
            });
          }
        }
      }
      out.push({
        role: 'assistant',
        parts,
        finish_reason: acc.finishReasons[idx],
      });
    }
    return out;
  }

  private _emitChatCompletionChoiceLogs(
    ctx: Context,
    captureContent: boolean,
    acc: {
      finishReasons: string[];
      choices: Array<{
        content?: string;
        toolCalls?: ChatCompletionMessageToolCall[];
      }>;
    }
  ): void {
    for (const [idx, choice] of acc.choices.entries()) {
      if (!choice) {
        continue;
      }
      const message: Partial<GenAIMessage> = {};
      if (
        captureContent &&
        choice.content &&
        choice.content.length > 0
      ) {
        message.content = choice.content;
      }
      if (choice.toolCalls && choice.toolCalls.length > 0) {
        message.tool_calls = choice.toolCalls as unknown as GenAIToolCall[];
        if (!captureContent) {
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
          finish_reason: acc.finishReasons[idx],
          index: idx,
          message,
        } as GenAIChoiceEventBody,
      });
    }
  }

  private _finalizeChatCompletionSync(
    invocation: InferenceInvocation,
    result: ChatCompletion,
    captureContent: boolean,
    ctx: Context
  ): void {
    this._diag.debug('OpenAI.Chat.Completions.create result: %O', result);
    invocation.setFinishReasons(
      result.choices.map(c => c.finish_reason as FinishReason)
    );
    invocation.setResponseId(result.id);
    invocation.setResponseModel(result.model);
    if (result.usage) {
      const usage = tokenUsageDetailsFromChatCompletionUsage(result.usage);
      if (usage) {
        invocation.setUsage(usage);
      }
    }

    const outputs: OutputMessages = result.choices.map(choice => {
      const parts: MessagePart[] = [];
      if (choice.message.content) {
        const c = choice.message.content;
        const text =
          typeof c === 'string'
            ? c
            : formatChatMessageContent(
                c as Parameters<typeof formatChatMessageContent>[0]
              );
        if (captureContent && text.length > 0) {
          parts.push({
            type: 'text',
            content: text,
          });
        }
      }
      if (choice.message.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          if (tc.type === 'function') {
            parts.push({
              type: 'tool_call',
              id: tc.id,
              name: tc.function.name,
              arguments: captureContent ? tc.function.arguments : undefined,
            });
          }
        }
      }
      return {
        role: 'assistant',
        parts,
        finish_reason: choice.finish_reason,
      };
    });
    invocation.addOutputMessages(outputs);

    result.choices.forEach(choice => {
      const message: Partial<GenAIMessage> = {};
      if (captureContent) {
        if (choice.message.content) {
          message.content = choice.message.content;
        }
        if (choice.message.tool_calls) {
          message.tool_calls = choice.message.tool_calls;
        }
      } else if (choice.message.tool_calls) {
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
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _getPatchedEmbeddingsCreate(): any {
    const self = this;
    return (original: Embeddings['create']) => {
      return function patchedCreate(
        this: Embeddings,
        ...args: Parameters<Embeddings['create']>
      ) {
        if (!self.isEnabled()) {
          return original.apply(this, args);
        }

        self._diag.debug('OpenAI.Chat.Embeddings.create args: %O', args);
        const params = args[0];
        const baseURL = this?._client?.baseURL;

        let invocation: EmbeddingInvocation;
        try {
          invocation = self._startEmbeddingInvocation(params, baseURL);
        } catch (err) {
          self._diag.error('unexpected error starting embedding invocation:', err);
          return original.apply(this, args);
        }
        const ctx = invocation.getContext();
        const apiPromise = context.with(ctx, () => original.apply(this, args));

        apiPromise
          .then(result => {
            self._diag.debug('OpenAI.Embeddings.create result: %O', result);
            try {
              invocation.setResponseModel(result.model);
              invocation.setUsage(result.usage.prompt_tokens);
              invocation.stop();
            } catch (err) {
              self._diag.error(
                'unexpected error getting telemetry from embeddings result:',
                err
              );
              invocation.stop();
            }
          })
          .catch((err: Error) => {
            invocation.fail({
              exception: err,
              errorType: getErrorType(err),
              statusDescription: err.message,
            });
          });

        return apiPromise;
      };
    };
  }

  private _startEmbeddingInvocation(
    params: EmbeddingCreateParams,
    baseURL: string | undefined
  ): EmbeddingInvocation {
    const providerName = getProviderNameFromBaseURL(baseURL, this._diag);
    const { serverAddress, serverPort } = getServerFromBaseURL(
      baseURL,
      this._diag
    );
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
      [ATTR_GEN_AI_REQUEST_MODEL]: params.model,
      [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
      [ATTR_GEN_AI_PROVIDER_NAME]: providerName,
    };
    Object.assign(metricAttrs, getAttrsFromBaseURL(baseURL, this._diag));

    const attrs: Attributes = {
      [ATTR_GEN_AI_SYSTEM]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
    };
    if (params.encoding_format != null) {
      attrs[ATTR_GEN_AI_REQUEST_ENCODING_FORMATS] = [params.encoding_format];
    }

    return this._getTelemetryHandler().startEmbedding({
      providerName,
      requestModel: params.model,
      encodingFormats:
        params.encoding_format != null ? [params.encoding_format] : undefined,
      serverAddress,
      serverPort,
      metricAttributes: metricAttrs,
      attributes: attrs,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _getPatchedResponsesCreate(): any {
    const self = this;
    return (original: Responses['create']) => {
      return function patchedCreate(
        this: Responses,
        ...args: Parameters<Responses['create']>
      ) {
        if (!self.isEnabled()) {
          return original.apply(this, args);
        }

        self._diag.debug('OpenAI.Responses.create args: %O', args);
        const params = args[0];
        const captureContent = self._shouldCaptureMessageContent();
        const baseURL = this?._client?.baseURL;

        let invocation: InferenceInvocation;
        try {
          invocation = self._startResponsesInvocation(
            params,
            captureContent,
            baseURL
          );
        } catch (err) {
          self._diag.error('unexpected error starting responses invocation:', err);
          return original.apply(this, args);
        }
        const ctx = invocation.getContext();
        const apiPromise = context.with(ctx, () => original.apply(this, args));

        if (isStreamPromise(params, apiPromise)) {
          const converter = new ConvertResponseOutputsToOutputMessagesUseCase(
            captureContent
          );
          const streamOutputs: OutputMessages = [];

          apiPromise
            .then(stream => {
              self._getTelemetryHandler().wrapAsyncStream(
                stream as Stream<ResponseStreamEvent>,
                {
                  invocation,
                  onChunk: (event: ResponseStreamEvent) => {
                    self._diag.debug(
                      'OpenAI.Responses.create stream event: %O',
                      event
                    );
                    try {
                      switch (event.type) {
                        case 'response.created': {
                          const response = event.response;
                          invocation.setResponseId(response.id);
                          invocation.setResponseModel(response.model);
                          if (response.conversation?.id) {
                            invocation.setAttribute(
                              ATTR_GEN_AI_CONVERSATION_ID,
                              response.conversation.id
                            );
                          }
                          break;
                        }
                        case 'response.output_item.done': {
                          const output = converter.convert([event.item]);
                          streamOutputs.push(...output);
                          if (output[0]?.finish_reason) {
                            invocation.setFinishReasons([
                              output[0].finish_reason as FinishReason,
                            ]);
                          }
                          self.logger.emit({
                            timestamp: Date.now(),
                            context: ctx,
                            severityNumber: SeverityNumber.INFO,
                            eventName: EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
                            attributes: {
                              [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
                              [ATTR_GEN_AI_OUTPUT_MESSAGES]: output as AnyValue,
                            },
                          });
                          break;
                        }
                        case 'response.completed': {
                          const usage = event.response.usage;
                          const details =
                            tokenUsageDetailsFromResponsesUsage(usage);
                          if (details) {
                            invocation.setUsage(details);
                          }
                          break;
                        }
                      }
                    } catch (e) {
                      self._diag.error(
                        'Error processing response stream event telemetry',
                        e
                      );
                    }
                  },
                  onEnd: async () => {
                    if (streamOutputs.length > 0) {
                      invocation.addOutputMessages(streamOutputs);
                    }
                  },
                }
              );
              return stream;
            })
            .catch((err: Error) => {
              invocation.fail({
                exception: err,
                errorType: getErrorType(err),
                statusDescription: err.message,
              });
            });
          return apiPromise;
        }

        apiPromise
          .then(result => {
            try {
              self._finalizeResponsesSync(
                invocation,
                result as Response,
                captureContent,
                ctx
              );
              invocation.stop();
            } catch (err) {
              self._diag.error(
                'unexpected error getting telemetry from responses result:',
                err
              );
              invocation.stop();
            }
          })
          .catch((err: Error) => {
            invocation.fail({
              exception: err,
              errorType: getErrorType(err),
              statusDescription: err.message,
            });
          });

        return apiPromise;
      };
    };
  }

  private _startResponsesInvocation(
    params: ResponseCreateParams,
    captureContent: boolean,
    baseURL: string | undefined
  ): InferenceInvocation {
    const providerName = getProviderNameFromBaseURL(baseURL, this._diag);
    const { serverAddress, serverPort } = getServerFromBaseURL(
      baseURL,
      this._diag
    );
    const metricAttrs: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_CHAT,
      [ATTR_GEN_AI_REQUEST_MODEL]: params.model,
      [ATTR_GEN_AI_PROVIDER_NAME]: providerName,
    };
    Object.assign(metricAttrs, getAttrsFromBaseURL(baseURL, this._diag));

    const inputs = new ConvertResponseInputsToInputMessagesUseCase(
      captureContent
    ).convert(params) as unknown as GenaiInputMessages;

    const extraAttrs: Attributes = {};
    if (params.instructions != null) {
      extraAttrs[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] = params.instructions;
    }

    const invocation = this._getTelemetryHandler().startInference({
      providerName,
      operationName: GEN_AI_OPERATION_NAME_VALUE_CHAT,
      requestModel: params.model,
      requestOptions: responseCreateParamsToInferenceRequestOptions(params),
      inputMessages: inputs,
      serverAddress,
      serverPort,
      metricAttributes: metricAttrs,
      attributes: extraAttrs,
    });

    const ctx = invocation.getContext();
    this.logger.emit({
      timestamp: Date.now(),
      context: ctx,
      severityNumber: SeverityNumber.INFO,
      eventName: EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
      attributes: {
        [ATTR_GEN_AI_PROVIDER_NAME]: providerName,
        [ATTR_GEN_AI_INPUT_MESSAGES]: inputs as AnyValue,
      },
    });

    return invocation;
  }

  private _finalizeResponsesSync(
    invocation: InferenceInvocation,
    result: Response,
    captureContent: boolean,
    ctx: Context
  ): void {
    this._diag.debug('OpenAI.Responses.create result: %O', result);
    const { id, model, conversation, output, usage } = result;

    if (conversation) {
      invocation.setAttribute(ATTR_GEN_AI_CONVERSATION_ID, conversation.id);
    }
    invocation.setResponseId(id);
    invocation.setResponseModel(model);
    const usageDetails = tokenUsageDetailsFromResponsesUsage(usage);
    if (usageDetails) {
      invocation.setUsage(usageDetails);
    }

    const outputs = new ConvertResponseOutputsToOutputMessagesUseCase(
      captureContent
    ).convert(output) as unknown as OutputMessages;

    if (outputs[0]?.finish_reason) {
      invocation.setFinishReasons([
        outputs[0].finish_reason as FinishReason,
      ]);
    }
    invocation.addOutputMessages(outputs);

    this.logger.emit({
      timestamp: Date.now(),
      context: ctx,
      severityNumber: SeverityNumber.INFO,
      eventName: EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
      attributes: {
        [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
        [ATTR_GEN_AI_OUTPUT_MESSAGES]: outputs as AnyValue,
      },
    });
  }
}
function isStreamPromise<
  Params extends { stream?: boolean | null } | undefined,
  Chunk,
  NonStream,
>(
  params: Params,
  value: APIPromise<Stream<Chunk> | NonStream>
): value is APIPromise<Stream<Chunk>> {
  return Boolean(params?.stream);
}
