/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  context,
  type Attributes,
  type MeterProvider,
  type TracerProvider,
} from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import {
  ATTR_GEN_AI_CONVERSATION_COMPACTED,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_RESPONSE_STATUS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  TelemetryHandler,
  type AsyncStreamWrapperOptions,
  type EmbeddingInvocation,
  type InferenceInvocation,
} from '@opentelemetry/genai-util';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  Completions as ChatCompletions,
} from 'openai/resources/chat/completions';
import type {
  CreateEmbeddingResponse,
  EmbeddingCreateParams,
  Embeddings,
} from 'openai/resources/embeddings';
import type {
  Response,
  ResponseCreateParams,
  ResponseOutputItem,
  ResponseStreamEvent,
  Responses,
} from 'openai/resources/responses/responses';
import type { Stream } from 'openai/streaming';
import type { APIPromise } from 'openai';
import {
  convertResponsesInputToMessages,
  convertResponsesOutputToMessages,
  deriveResponsesFinishReason,
  extractResponsesConversationId,
  extractResponsesSystemInstructions,
  hasCompactionItems,
} from './responses';
import type { OpenAIInstrumentationConfig } from './types';
import {
  ChatStreamAccumulator,
  extractChatInputMessages,
  extractChatOutputMessages,
  extractChatTokenUsage,
  extractResponsesTokenUsage,
  getOpenAIErrorType,
  inferEmbeddingDimensions,
  normalizeChatFinishReason,
  parseBaseURL,
  responseFormatToOutputType,
} from './utils';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

export class OpenAIInstrumentation extends InstrumentationBase<OpenAIInstrumentationConfig> {
  private _telemetryHandler?: TelemetryHandler;
  private _tracerProvider?: TracerProvider;
  private _meterProvider?: MeterProvider;

  constructor(config: OpenAIInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  override setConfig(config: OpenAIInstrumentationConfig = {}): void {
    super.setConfig(config);
    this._telemetryHandler = undefined;
  }

  override setTracerProvider(provider: TracerProvider): void {
    super.setTracerProvider(provider);
    this._tracerProvider = provider;
    this._telemetryHandler = undefined;
  }

  override setMeterProvider(provider: MeterProvider): void {
    super.setMeterProvider(provider);
    this._meterProvider = provider;
    this._telemetryHandler = undefined;
  }

  private _getTelemetryHandler(): TelemetryHandler {
    return (this._telemetryHandler ??= new TelemetryHandler({
      instrumentationName: PACKAGE_NAME,
      instrumentationVersion: PACKAGE_VERSION,
      tracerProvider: this._tracerProvider,
      meterProvider: this._meterProvider,
      diag: this._diag,
      config: this.getConfig(),
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

  private _failInvocation(
    invocation: InferenceInvocation | EmbeddingInvocation,
    err: unknown
  ): void {
    invocation.fail({
      exception: err instanceof Error ? err : undefined,
      errorType: getOpenAIErrorType(err),
    });
  }

  private _observeResponse<T>(
    promise: APIPromise<T>,
    invocation: InferenceInvocation | EmbeddingInvocation,
    onParsed: (result: T) => void,
    streaming = false
  ): void {
    let parsing = false;
    let observed = false;
    const fail = (err: unknown) => this._failInvocation(invocation, err);
    try {
      // Calling APIPromise.then starts parsing. Observe the SDK's own parser
      // instead: create(), withResponse() and derived parse() helpers share
      // this entry point across v4-v6, while asResponse() never uses it.
      const descriptor = Object.getOwnPropertyDescriptor(
        promise,
        'parseResponse'
      );
      const parse = descriptor?.value as
        | ((...args: unknown[]) => T | Promise<T>)
        | undefined;
      const canObserve = typeof parse === 'function' && descriptor?.writable;
      if (canObserve) {
        const diag = this._diag;
        void Object.defineProperty(promise, 'parseResponse', {
          ...descriptor,
          value(this: unknown, ...args: unknown[]) {
            parsing = true;
            let result: T | Promise<T>;
            try {
              result = parse.apply(this, args);
            } catch (err) {
              fail(err);
              throw err;
            }
            void Promise.resolve(result).then(value => {
              if (!observed && !invocation.isEnded()) {
                observed = true;
                try {
                  onParsed(value);
                } catch (err) {
                  diag.error('Unable to observe parsed OpenAI response', err);
                  invocation.stop();
                }
              }
            }, fail);
            return result;
          },
        });
      } else {
        this._diag.warn(
          'OpenAI response parser unavailable, recording request metadata only'
        );
      }
      // Let a caller await asResponse() and then the same APIPromise.
      // If nobody starts parsing, finish without reading or cloning the body.
      void promise.asResponse().then(() => {
        if (!parsing && (!streaming || !canObserve)) {
          setImmediate(() => {
            if (!parsing) invocation.stop();
          });
        }
      }, fail);
    } catch (err) {
      this._diag.error('Unable to observe OpenAI APIPromise', err);
      invocation.stop();
    }
  }

  private _attachStreamTelemetry<TChunk>(
    apiPromise: APIPromise<Stream<TChunk>>,
    handler: TelemetryHandler,
    invocation: InferenceInvocation,
    createOptions: () => Omit<
      AsyncStreamWrapperOptions<TChunk>,
      'invocation' | 'onError'
    >
  ): APIPromise<Stream<TChunk>> {
    this._observeResponse(
      apiPromise,
      invocation,
      (stream: AsyncIterable<TChunk>) => {
        const wrap = (source: AsyncIterable<TChunk>) =>
          handler.wrapAsyncStream(source, {
            invocation,
            ...createOptions(),
            onError: error => this._failInvocation(invocation, error),
          });
        if (!hasIteratorFactory(stream)) {
          wrap(stream);
          return;
        }

        // tee() uses this factory directly, bypassing Symbol.asyncIterator.
        // Iterator construction does not consume the stream. Let the first
        // iterator that actually advances own its telemetry.
        const original = stream.iterator.bind(stream);
        let wrapped = false;
        stream.iterator = () => {
          const iterator = original();
          const source = { [Symbol.asyncIterator]: () => iterator };
          return (async function* () {
            if (wrapped) return yield* source;
            wrapped = true;
            return yield* wrap(source);
          })();
        };
      },
      true
    );

    return apiPromise;
  }

  private _getPatchedChatCompletionsCreate() {
    const self = this;
    return (original: ChatCompletions['create']) => {
      // https://platform.openai.com/docs/api-reference/chat/create
      return function patchedCreate(
        this: ChatCompletions,
        ...args: Parameters<ChatCompletions['create']>
      ) {
        if (!self.isEnabled() || isTracingSuppressed(context.active())) {
          return original.apply(this, args);
        }

        const params = args[0];
        const handler = self._getTelemetryHandler();

        let invocation: InferenceInvocation;
        try {
          invocation = self._startChatCompletionsInvocation(
            handler,
            params,
            this?._client?.baseURL
          );
        } catch (err) {
          self._diag.error('unexpected error starting span:', err);
          return original.apply(this, args);
        }

        let apiPromise: APIPromise<
          Stream<ChatCompletionChunk> | ChatCompletion
        >;
        try {
          apiPromise = invocation.withContext(() =>
            original.apply(this, args)
          ) as APIPromise<Stream<ChatCompletionChunk> | ChatCompletion>;
        } catch (err) {
          self._failInvocation(invocation, err);
          throw err;
        }

        if (isStreamPromise(params, apiPromise)) {
          return self._attachStreamTelemetry(
            apiPromise,
            handler,
            invocation,
            () => {
              const accumulator = new ChatStreamAccumulator(
                invocation.shouldCaptureContent()
              );
              return {
                onChunk: chunk => {
                  accumulator.onChunk(chunk, invocation);
                },
                onEnd: () => {
                  accumulator.finalize(invocation);
                },
              };
            }
          );
        }

        self._observeResponse(apiPromise, invocation, result => {
          self._onChatCompletionsCreateResult(
            invocation,
            result as ChatCompletion
          );
        });

        return apiPromise;
      };
    };
  }

  private _startChatCompletionsInvocation(
    handler: TelemetryHandler,
    params: ChatCompletionCreateParams,
    baseURL: string | undefined
  ): InferenceInvocation {
    const { serverAddress, serverPort } = parseBaseURL(baseURL, this._diag);
    const maxTokens =
      typeof params.max_completion_tokens === 'number'
        ? params.max_completion_tokens
        : typeof params.max_tokens === 'number'
          ? params.max_tokens
          : undefined;
    const stopSequences =
      params.stop == null
        ? undefined
        : Array.isArray(params.stop)
          ? params.stop
          : [params.stop];

    const initialAttrs: Attributes = {};
    const outputType = responseFormatToOutputType(params.response_format);
    if (outputType) {
      initialAttrs[ATTR_GEN_AI_OUTPUT_TYPE] = outputType;
    }

    const captureContent = handler.shouldCaptureContent();

    return handler.startInference({
      providerName: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
      operationName: GEN_AI_OPERATION_NAME_VALUE_CHAT,
      requestModel: params.model,
      serverAddress,
      serverPort,
      attributes: initialAttrs,
      requestOptions: {
        temperature: params.temperature ?? undefined,
        topP: params.top_p ?? undefined,
        maxTokens,
        stopSequences,
        frequencyPenalty: params.frequency_penalty ?? undefined,
        presencePenalty: params.presence_penalty ?? undefined,
        choiceCount: params.n ?? undefined,
        seed: params.seed ?? undefined,
        stream: params.stream ? true : undefined,
        reasoningLevel: params.reasoning_effort ?? undefined,
      },
      inputMessages: captureContent
        ? extractChatInputMessages(params.messages)
        : undefined,
    });
  }

  private _onChatCompletionsCreateResult(
    invocation: InferenceInvocation,
    result: ChatCompletion
  ): void {
    try {
      if (result.id) {
        invocation.setResponseId(result.id);
      }
      if (result.model) {
        invocation.setResponseModel(result.model);
      }
      if (Array.isArray(result.choices)) {
        invocation.setFinishReasons(
          result.choices.map(c => normalizeChatFinishReason(c.finish_reason))
        );
        if (invocation.shouldCaptureContent()) {
          invocation.addOutputMessages(
            extractChatOutputMessages(result.choices)
          );
        }
      }
      const usage = extractChatTokenUsage(result.usage);
      if (usage) {
        invocation.setUsage(usage);
      }
    } catch (err) {
      this._diag.error(
        'unexpected error getting telemetry from chat result:',
        err
      );
    } finally {
      invocation.stop();
    }
  }

  private _getPatchedEmbeddingsCreate() {
    const self = this;
    return (original: Embeddings['create']) => {
      // https://platform.openai.com/docs/api-reference/embeddings/create
      return function patchedCreate(
        this: Embeddings,
        ...args: Parameters<Embeddings['create']>
      ) {
        if (!self.isEnabled() || isTracingSuppressed(context.active())) {
          return original.apply(this, args);
        }

        const params = args[0];
        const handler = self._getTelemetryHandler();

        let invocation: EmbeddingInvocation;
        try {
          invocation = self._startEmbeddingsInvocation(
            handler,
            params,
            this?._client?.baseURL
          );
        } catch (err) {
          self._diag.error('unexpected error starting span:', err);
          return original.apply(this, args);
        }

        let apiPromise: APIPromise<CreateEmbeddingResponse>;
        try {
          apiPromise = invocation.withContext(() =>
            original.apply(this, args)
          ) as APIPromise<CreateEmbeddingResponse>;
        } catch (err) {
          self._failInvocation(invocation, err);
          throw err;
        }

        self._observeResponse(apiPromise, invocation, result => {
          self._onEmbeddingsCreateResult(invocation, params, result);
        });

        return apiPromise;
      };
    };
  }

  private _startEmbeddingsInvocation(
    handler: TelemetryHandler,
    params: EmbeddingCreateParams,
    baseURL: string | undefined
  ): EmbeddingInvocation {
    const { serverAddress, serverPort } = parseBaseURL(baseURL, this._diag);
    return handler.startEmbedding({
      providerName: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
      operationName: GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
      requestModel: params.model,
      encodingFormats:
        params.encoding_format != null ? [params.encoding_format] : undefined,
      dimensionCount: params.dimensions ?? undefined,
      serverAddress,
      serverPort,
    });
  }

  private _onEmbeddingsCreateResult(
    invocation: EmbeddingInvocation,
    params: EmbeddingCreateParams,
    result: CreateEmbeddingResponse
  ): void {
    try {
      if (result.model) {
        invocation.setResponseModel(result.model);
      }
      if (params.dimensions == null) {
        const inferredDims = inferEmbeddingDimensions(
          result.data?.[0]?.embedding as number[] | string | undefined
        );
        if (inferredDims !== undefined) {
          invocation.setDimensionCount(inferredDims);
        }
      }
      if (result.usage?.prompt_tokens !== undefined) {
        invocation.setUsage(result.usage.prompt_tokens);
      }
    } catch (err) {
      this._diag.error(
        'unexpected error getting telemetry from embeddings result:',
        err
      );
    } finally {
      invocation.stop();
    }
  }

  private _getPatchedResponsesCreate() {
    const self = this;
    return (original: Responses['create']) => {
      // https://platform.openai.com/docs/api-reference/responses/create
      return function patchedCreate(
        this: Responses,
        ...args: Parameters<Responses['create']>
      ) {
        if (!self.isEnabled() || isTracingSuppressed(context.active())) {
          return original.apply(this, args);
        }

        const params = args[0];
        const handler = self._getTelemetryHandler();

        let invocation: InferenceInvocation;
        try {
          invocation = self._startResponsesInvocation(
            handler,
            params,
            this?._client?.baseURL
          );
        } catch (err) {
          self._diag.error('unexpected error starting span:', err);
          return original.apply(this, args);
        }

        let apiPromise: APIPromise<Stream<ResponseStreamEvent> | Response>;
        try {
          apiPromise = invocation.withContext(() =>
            original.apply(this, args)
          ) as APIPromise<Stream<ResponseStreamEvent> | Response>;
        } catch (err) {
          self._failInvocation(invocation, err);
          throw err;
        }

        if (isStreamPromise(params, apiPromise)) {
          return self._attachStreamTelemetry(
            apiPromise,
            handler,
            invocation,
            () => self._createResponsesStreamHooks(invocation)
          );
        }

        self._observeResponse(apiPromise, invocation, result => {
          self._onResponsesCreateResult(invocation, result as Response);
        });

        return apiPromise;
      };
    };
  }

  private _startResponsesInvocation(
    handler: TelemetryHandler,
    params: ResponseCreateParams,
    baseURL: string | undefined
  ): InferenceInvocation {
    const { serverAddress, serverPort } = parseBaseURL(baseURL, this._diag);
    const conversationId = extractResponsesConversationId(params.conversation);
    const outputType = responseFormatToOutputType(params.text?.format);

    const initialAttrs: Attributes = {};
    if (outputType) {
      initialAttrs[ATTR_GEN_AI_OUTPUT_TYPE] = outputType;
    }
    if (hasCompactionItems(params.input)) {
      initialAttrs[ATTR_GEN_AI_CONVERSATION_COMPACTED] = true;
    }

    const captureContent = handler.shouldCaptureContent();

    return handler.startInference({
      providerName: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
      operationName: GEN_AI_OPERATION_NAME_VALUE_CHAT,
      requestModel: params.model,
      conversationId,
      serverAddress,
      serverPort,
      attributes: initialAttrs,
      requestOptions: {
        temperature: params.temperature ?? undefined,
        topP: params.top_p ?? undefined,
        maxTokens: params.max_output_tokens ?? undefined,
        stream: params.stream ? true : undefined,
        reasoningLevel: params.reasoning?.effort ?? undefined,
      },
      systemInstructions: captureContent
        ? extractResponsesSystemInstructions(params.instructions)
        : undefined,
      inputMessages: captureContent
        ? convertResponsesInputToMessages(params.input)
        : undefined,
    });
  }

  private _createResponsesStreamHooks(
    invocation: InferenceInvocation
  ): Omit<
    AsyncStreamWrapperOptions<ResponseStreamEvent>,
    'invocation' | 'onError'
  > {
    const completedItems: ResponseOutputItem[] | undefined =
      invocation.shouldCaptureContent() ? [] : undefined;
    const completedTypes: Pick<ResponseOutputItem, 'type'>[] =
      completedItems ?? [];
    let terminalResponse: Response | undefined;
    let streamErrorType: string | undefined;

    return {
      onChunk: event => {
        switch (event.type) {
          case 'response.created':
          case 'response.in_progress': {
            const response = event.response;
            if (response.id) {
              invocation.setResponseId(response.id);
            }
            if (response.model) {
              invocation.setResponseModel(response.model);
            }
            const convId = extractResponsesConversationId(
              response.conversation
            );
            if (convId) {
              invocation.setAttribute(ATTR_GEN_AI_CONVERSATION_ID, convId);
            }
            break;
          }
          case 'response.output_item.done': {
            if (completedItems) {
              completedItems.push(event.item);
            } else {
              completedTypes.push({ type: event.item.type });
            }
            break;
          }
          case 'response.completed':
          case 'response.incomplete': {
            terminalResponse = event.response;
            break;
          }
          case 'response.failed': {
            terminalResponse = event.response;
            streamErrorType = event.response.error?.code ?? 'response_failed';
            break;
          }
          case 'error': {
            streamErrorType = event.code ?? 'stream_error';
            break;
          }
        }
      },
      onEnd: () => {
        if (terminalResponse) {
          this._applyResponsesMetadataAndContent(
            invocation,
            terminalResponse,
            completedItems,
            completedTypes
          );
        } else if (completedTypes.length > 0) {
          if (hasCompactionItems(completedTypes)) {
            invocation.setAttribute(ATTR_GEN_AI_CONVERSATION_COMPACTED, true);
          }
          const finishReason = deriveResponsesFinishReason(completedTypes);
          if (finishReason) invocation.setFinishReasons([finishReason]);
          if (completedItems) {
            invocation.addOutputMessages(
              convertResponsesOutputToMessages(completedItems, finishReason)
            );
          }
        }

        if (streamErrorType) {
          invocation.fail({ errorType: streamErrorType });
        }
      },
    };
  }

  private _applyResponsesMetadataAndContent(
    invocation: InferenceInvocation,
    result: Response,
    fallbackItems?: ReadonlyArray<ResponseOutputItem>,
    fallbackTypes: ReadonlyArray<Pick<ResponseOutputItem, 'type'>> = []
  ): void {
    if (result.id) {
      invocation.setResponseId(result.id);
    }
    if (result.model) {
      invocation.setResponseModel(result.model);
    }
    const convId = extractResponsesConversationId(result.conversation);
    if (convId) {
      invocation.setAttribute(ATTR_GEN_AI_CONVERSATION_ID, convId);
    }
    if (result.status) {
      invocation.setAttribute(ATTR_GEN_AI_RESPONSE_STATUS, result.status);
    }

    const usage = extractResponsesTokenUsage(result.usage);
    if (usage) {
      invocation.setUsage(usage);
    }

    const outputItems =
      Array.isArray(result.output) && result.output.length > 0
        ? result.output
        : (fallbackItems ?? []);

    const itemTypes = outputItems.length ? outputItems : fallbackTypes;
    if (hasCompactionItems(itemTypes)) {
      invocation.setAttribute(ATTR_GEN_AI_CONVERSATION_COMPACTED, true);
    }

    const finishReason = deriveResponsesFinishReason(
      itemTypes,
      result.status,
      result.incomplete_details
    );
    if (finishReason) invocation.setFinishReasons([finishReason]);

    if (invocation.shouldCaptureContent() && outputItems.length > 0) {
      invocation.addOutputMessages(
        convertResponsesOutputToMessages(outputItems, finishReason)
      );
    }
  }

  private _onResponsesCreateResult(
    invocation: InferenceInvocation,
    result: Response
  ): void {
    let errorType: string | undefined;
    try {
      this._applyResponsesMetadataAndContent(invocation, result);
      if (result.status === 'failed') {
        errorType = result.error?.code ?? 'response_failed';
      }
    } catch (err) {
      this._diag.error(
        'unexpected error getting telemetry from responses result:',
        err
      );
    } finally {
      if (errorType) {
        invocation.fail({ errorType });
      } else {
        invocation.stop();
      }
    }
  }
}

function hasIteratorFactory<T>(
  stream: AsyncIterable<T>
): stream is AsyncIterable<T> & { iterator: () => AsyncIterator<T> } {
  return 'iterator' in stream && typeof stream.iterator === 'function';
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
