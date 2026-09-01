/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type Anthropic from '@anthropic-ai/sdk';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Attributes, Span } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_OPERATION_NAME,
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

function normalizeFinishReason(reason: Anthropic.Messages.StopReason): string {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
    default:
      return reason;
  }
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
  constructor(config: AnthropicInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
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
        if (!instrumentation.isEnabled()) {
          return original.apply(this, args);
        }

        const params = args[0] as Anthropic.Messages.MessageCreateParams;
        const span = instrumentation.tracer.startSpan(`chat ${params.model}`, {
          kind: SpanKind.CLIENT,
          attributes: getRequestAttributes(params, this),
        });
        const state: SpanState = { span, ended: false, usage: {} };
        const ctx = trace.setSpan(context.active(), span);

        let result: Promise<unknown>;
        try {
          result = context.with(ctx, () => original.apply(this, args));
        } catch (error) {
          instrumentation._endSpanWithError(state, error);
          throw error;
        }

        result.then(
          value => {
            if (isAnthropicStream(value)) {
              instrumentation._wrapStream(value, state);
            } else {
              if (isAnthropicMessage(value)) {
                instrumentation._tryRecordMessage(state, value);
              }
              instrumentation._endSpan(state);
            }
          },
          error => instrumentation._endSpanWithError(state, error)
        );

        // Preserve the Anthropic SDK's customized APIPromise instance.
        return result;
      };
    };
  }

  private _wrapStream(stream: AnthropicStream, state: SpanState): void {
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
    if (message.stop_reason) {
      state.span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [
        normalizeFinishReason(message.stop_reason),
      ]);
    }
    state.usage = message.usage;
    this._recordUsage(state);
  }

  private _recordStreamEvent(
    state: SpanState,
    event: Anthropic.Messages.RawMessageStreamEvent
  ): void {
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
    state.span.end();
  }

  private _endSpanWithError(state: SpanState, error: unknown): void {
    if (state.ended) return;
    const err = error instanceof Error ? error : new Error(String(error));
    state.span.recordException(err);
    state.span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    state.span.setAttribute('error.type', err.constructor.name);
    this._endSpan(state);
  }
}
