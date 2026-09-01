/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type Anthropic from '@anthropic-ai/sdk';
// Avoids depending on @opentelemetry/core for high-resolution timing helpers.
import { performance } from 'node:perf_hooks';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Attributes, Histogram, Span } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { isTracingSuppressed } from '@opentelemetry/core';
import {
  StreamContentAccumulator,
  normalizeFinishReason,
  serializeInputMessages,
  serializeOutputMessage,
  serializeSystemInstructions,
} from './content';
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOKEN_TYPE,
  GEN_AI_TOKEN_TYPE_VALUE_INPUT,
  GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
} from './semconv';
import type { AnthropicInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

type AnthropicModule = typeof Anthropic & {
  Anthropic?: typeof Anthropic;
  default?: typeof Anthropic;
};

interface SpanState {
  span: Span;
  ended: boolean;
  usage: UsageState;
  captureMessageContent: boolean;
  content?: StreamContentAccumulator;
  metricAttributes: Attributes;
  responseModel?: string;
  startTime: number;
  resultObserved: boolean;
  withResponseInProgress: boolean;
}

interface UsageState {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

interface AnthropicStream
  extends AsyncIterable<Anthropic.Messages.RawMessageStreamEvent> {
  iterator(): AsyncIterator<Anthropic.Messages.RawMessageStreamEvent>;
}

interface AnthropicAPIPromise extends Promise<unknown> {
  parse?: () => Promise<unknown>;
  asResponse?: () => Promise<Response>;
  withResponse?: () => Promise<unknown>;
}

function getAnthropicExport(module: AnthropicModule): typeof Anthropic {
  return module.Anthropic ?? module.default ?? module;
}

function isAnthropicStream(value: unknown): value is AnthropicStream {
  return (
    value !== null &&
    typeof value === 'object' &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function' &&
    'iterator' in value &&
    typeof value.iterator === 'function'
  );
}

function isAnthropicMessage(
  value: unknown
): value is Anthropic.Messages.Message {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'message' &&
    'id' in value &&
    'model' in value &&
    'usage' in value
  );
}

function getServerAttributes(resource: unknown): Attributes {
  if (resource === null || typeof resource !== 'object') return {};
  const client = '_client' in resource ? resource._client : undefined;
  if (client === null || typeof client !== 'object' || !('baseURL' in client)) {
    return {};
  }
  try {
    const url = new URL(String(client.baseURL));
    const attributes: Attributes = { [ATTR_SERVER_ADDRESS]: url.hostname };
    if (url.port && url.port !== '80' && url.port !== '443') {
      attributes[ATTR_SERVER_PORT] = Number(url.port);
    }
    return attributes;
  } catch {
    return {};
  }
}

function getRequestAttributes(
  params: Anthropic.Messages.MessageCreateParams,
  resource: unknown
): Attributes {
  return {
    [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
    [ATTR_GEN_AI_PROVIDER_NAME]: 'anthropic',
    [ATTR_GEN_AI_REQUEST_MODEL]: params.model,
    [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: params.max_tokens,
    [ATTR_GEN_AI_REQUEST_TEMPERATURE]: params.temperature ?? undefined,
    [ATTR_GEN_AI_REQUEST_TOP_P]: params.top_p ?? undefined,
    [ATTR_GEN_AI_REQUEST_TOP_K]: params.top_k ?? undefined,
    [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: params.stop_sequences ?? undefined,
    ...getServerAttributes(resource),
  };
}

export class AnthropicInstrumentation extends InstrumentationBase<AnthropicInstrumentationConfig> {
  private _clientOperationDuration!: Histogram;
  private _clientTokenUsage!: Histogram;

  constructor(config: AnthropicInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    const capture =
      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
    if (capture?.toLowerCase() === 'true') {
      this.getConfig().captureMessageContent = true;
    } else if (capture?.toLowerCase() === 'false') {
      this.getConfig().captureMessageContent = false;
    }
  }

  override setConfig(config: AnthropicInstrumentationConfig = {}): void {
    super.setConfig({
      ...config,
      captureMessageContent: Boolean(config.captureMessageContent),
    });
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        '@anthropic-ai/sdk',
        ['>=0.65.0 <1'],
        (module: AnthropicModule) => {
          const anthropic = getAnthropicExport(module);
          this._wrap(
            anthropic.Messages.prototype,
            'create',
            this._getPatchedMessagesCreate()
          );
          return module;
        },
        (module: AnthropicModule) => {
          const anthropic = getAnthropicExport(module);
          this._unwrap(anthropic.Messages.prototype, 'create');
        }
      ),
    ];
  }

  override _updateMetricInstruments(): void {
    this._clientOperationDuration = this.meter.createHistogram(
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
    this._clientTokenUsage = this.meter.createHistogram(
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
  private _getPatchedMessagesCreate(): any {
    const instrumentation = this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original: any) => {
      return function patchedCreate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this: any,
        ...args: unknown[]
      ) {
        if (
          !instrumentation.isEnabled() ||
          isTracingSuppressed(context.active())
        ) {
          return original.apply(this, args);
        }

        const params = args[0] as Anthropic.Messages.MessageCreateParams;
        const requestAttributes = getRequestAttributes(params, this);
        const captureMessageContent = Boolean(
          instrumentation.getConfig().captureMessageContent
        );
        const span = instrumentation.tracer.startSpan(`chat ${params.model}`, {
          kind: SpanKind.CLIENT,
          attributes: requestAttributes,
        });
        const state: SpanState = {
          span,
          ended: false,
          usage: {},
          captureMessageContent,
          metricAttributes: {
            [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
            [ATTR_GEN_AI_PROVIDER_NAME]: 'anthropic',
            [ATTR_GEN_AI_REQUEST_MODEL]: params.model,
            ...getServerAttributes(this),
          },
          startTime: performance.now(),
          resultObserved: false,
          withResponseInProgress: false,
        };
        if (captureMessageContent) {
          instrumentation._recordRequestContent(state, params);
        }
        const ctx = trace.setSpan(context.active(), span);

        let result: AnthropicAPIPromise;
        try {
          result = context.with(ctx, () => original.apply(this, args));
        } catch (error) {
          instrumentation._endSpanWithError(state, error);
          throw error;
        }

        instrumentation._observeAPIPromise(result, state);

        // Preserve the Anthropic SDK's customized APIPromise instance.
        return result;
      };
    };
  }

  private _observeAPIPromise(
    result: AnthropicAPIPromise,
    state: SpanState
  ): void {
    let observedLazily = false;
    const parse = result.parse;
    if (parse) {
      observedLazily = true;
      this._wrap(result, 'parse', () => {
        return () => {
          const parsed = parse.call(result);
          this._observeResult(parsed, state);
          return parsed;
        };
      });
    }
    const asResponse = result.asResponse;
    if (asResponse) {
      observedLazily = true;
      this._wrap(result, 'asResponse', () => {
        return () => {
          const response = asResponse.call(result);
          if (!state.withResponseInProgress) {
            this._observeResult(response, state);
          }
          return response;
        };
      });
    }
    const withResponse = result.withResponse;
    if (withResponse) {
      observedLazily = true;
      this._wrap(result, 'withResponse', () => {
        return () => {
          state.withResponseInProgress = true;
          let response: Promise<unknown>;
          try {
            response = withResponse.call(result);
          } finally {
            state.withResponseInProgress = false;
          }
          this._observeResult(response, state, true);
          return response;
        };
      });
    }
    if (!observedLazily) {
      this._observeResult(result, state);
    }
  }

  private _observeResult(
    result: Promise<unknown>,
    state: SpanState,
    unwrapData = false
  ): void {
    result.then(
      value => {
        if (state.resultObserved) return;
        state.resultObserved = true;
        if (
          unwrapData &&
          value !== null &&
          typeof value === 'object' &&
          'data' in value
        ) {
          value = value.data;
        }
        if (isAnthropicStream(value)) {
          this._wrapStream(value, state);
        } else {
          if (isAnthropicMessage(value)) {
            this._tryRecordMessage(state, value);
          }
          this._endSpan(state);
        }
      },
      error => {
        if (state.resultObserved) return;
        state.resultObserved = true;
        this._endSpanWithError(state, error);
      }
    );
  }

  private _wrapStream(stream: AnthropicStream, state: SpanState): void {
    if (state.captureMessageContent) {
      state.content = new StreamContentAccumulator();
    }
    // `Stream.tee()` calls `iterator()` directly, bypassing
    // `Symbol.asyncIterator`, so wrap the internal iterator method.
    this._wrap(stream, 'iterator', originalIterator => {
      return () => this._streamIterator(originalIterator(), state);
    });
  }

  private async *_streamIterator(
    iterator: AsyncIterator<Anthropic.Messages.RawMessageStreamEvent>,
    state: SpanState
  ): AsyncGenerator<Anthropic.Messages.RawMessageStreamEvent> {
    let exhausted = false;
    try {
      while (true) {
        const next = await iterator.next();
        if (next.done) {
          exhausted = true;
          break;
        }
        this._tryRecordStreamEvent(state, next.value);
        yield next.value;
      }
      this._endSpan(state);
    } catch (error) {
      this._endSpanWithError(state, error);
      throw error;
    } finally {
      if (!exhausted && !state.ended) {
        try {
          await iterator.return?.();
        } catch (error) {
          this._diag.debug('error closing Anthropic stream iterator:', error);
        }
        this._endSpan(state);
      }
    }
  }

  private _tryRecordMessage(
    state: SpanState,
    message: Anthropic.Messages.Message
  ): void {
    try {
      this._recordMessage(state, message);
    } catch (error) {
      this._diag.debug('error recording Anthropic response telemetry:', error);
    }
  }

  private _tryRecordStreamEvent(
    state: SpanState,
    event: Anthropic.Messages.RawMessageStreamEvent
  ): void {
    try {
      this._recordStreamEvent(state, event);
    } catch (error) {
      this._diag.debug(
        'error recording Anthropic stream response telemetry:',
        error
      );
    }
  }

  private _recordMessage(
    state: SpanState,
    message: Anthropic.Messages.Message
  ): void {
    state.span.setAttributes({
      [ATTR_GEN_AI_RESPONSE_ID]: message.id,
      [ATTR_GEN_AI_RESPONSE_MODEL]: message.model,
    });
    state.responseModel = message.model;
    if (message.stop_reason) {
      state.span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
        normalizeFinishReason(message.stop_reason),
      ]);
    }
    const outputMessages = serializeOutputMessage(message);
    if (state.captureMessageContent && outputMessages) {
      state.span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, outputMessages);
    }
    state.usage = message.usage;
    this._recordUsage(state);
  }

  private _recordStreamEvent(
    state: SpanState,
    event: Anthropic.Messages.RawMessageStreamEvent
  ): void {
    state.content?.add(event);
    if (event.type === 'message_start') {
      this._recordMessage(state, event.message);
      return;
    }
    if (event.type === 'message_delta') {
      state.usage = { ...state.usage, ...event.usage };
      if (event.delta.stop_reason) {
        state.span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
          normalizeFinishReason(event.delta.stop_reason),
        ]);
      }
      this._recordUsage(state);
    }
  }

  private _recordRequestContent(
    state: SpanState,
    params: Anthropic.Messages.MessageCreateParams
  ): void {
    try {
      const inputMessages = serializeInputMessages(params.messages);
      const systemInstructions = serializeSystemInstructions(params.system);
      state.span.setAttributes({
        [ATTR_GEN_AI_INPUT_MESSAGES]: inputMessages,
        [ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]: systemInstructions,
      });
    } catch (error) {
      this._diag.debug('error recording Anthropic request content:', error);
    }
  }

  private _recordUsage(state: SpanState): void {
    const usage = state.usage;
    const inputTokens =
      usage.input_tokens == null &&
      usage.cache_creation_input_tokens == null &&
      usage.cache_read_input_tokens == null
        ? undefined
        : (usage.input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0);
    state.span.setAttributes({
      [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: inputTokens,
      [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: usage.output_tokens ?? undefined,
      [ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]:
        usage.cache_creation_input_tokens ?? undefined,
      [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]:
        usage.cache_read_input_tokens ?? undefined,
    });
  }

  private _endSpan(state: SpanState): void {
    if (state.ended) return;
    state.ended = true;
    const outputMessages = state.content?.serialize();
    if (outputMessages) {
      state.span.setAttribute(ATTR_GEN_AI_OUTPUT_MESSAGES, outputMessages);
    }
    try {
      this._recordMetrics(state);
    } catch (error) {
      this._diag.debug('error recording Anthropic metrics:', error);
    }
    state.span.end();
  }

  private _recordMetrics(state: SpanState): void {
    const attributes: Attributes = {
      ...state.metricAttributes,
      [ATTR_GEN_AI_RESPONSE_MODEL]: state.responseModel,
    };
    this._clientOperationDuration.record(
      (performance.now() - state.startTime) / 1000,
      attributes
    );

    const usage = state.usage;
    const inputTokens =
      usage.input_tokens == null &&
      usage.cache_creation_input_tokens == null &&
      usage.cache_read_input_tokens == null
        ? undefined
        : (usage.input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0);
    if (inputTokens !== undefined) {
      this._clientTokenUsage.record(inputTokens, {
        ...attributes,
        [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
      });
    }
    if (usage.output_tokens != null) {
      this._clientTokenUsage.record(usage.output_tokens, {
        ...attributes,
        [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
      });
    }
  }

  private _endSpanWithError(state: SpanState, error: unknown): void {
    if (state.ended) return;
    const err = error instanceof Error ? error : new Error(String(error));
    state.span.recordException(err);
    state.span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    state.span.setAttribute('error.type', err.constructor.name);
    state.metricAttributes['error.type'] = err.constructor.name;
    this._endSpan(state);
  }
}
