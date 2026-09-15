/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type Anthropic from '@anthropic-ai/sdk';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
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
}

interface AnthropicStream extends AsyncIterable<unknown> {
  iterator(): AsyncIterator<unknown>;
}

/**
 * The subset of the SDK's `APIPromise` that this instrumentation relies on.
 * `asResponse()` settles with the raw `Response` without parsing its body;
 * `parse()` memoizes the parsed body and backs `then`/`catch`/`finally`.
 */
interface AnthropicAPIPromise<T> extends Promise<T> {
  asResponse(): Promise<unknown>;
  parse(): Promise<T>;
}

function getAnthropicExport(module: AnthropicModule): typeof Anthropic {
  return module.Anthropic ?? module.default ?? module;
}

function isStreamRequest(
  params: Anthropic.Messages.MessageCreateParams | undefined
): boolean {
  return params?.stream === true;
}

function isAPIPromise<T>(value: Promise<T>): value is AnthropicAPIPromise<T> {
  const candidate = value as AnthropicAPIPromise<T>;
  return (
    typeof candidate?.asResponse === 'function' &&
    typeof candidate?.parse === 'function'
  );
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
          attributes: {
            'gen_ai.operation.name': 'chat',
            'gen_ai.provider.name': 'anthropic',
            'gen_ai.request.model': params.model,
          },
        });
        const state: SpanState = { span, ended: false };
        const ctx = trace.setSpan(context.active(), span);

        let result: Promise<unknown>;
        try {
          result = context.with(ctx, () => original.apply(this, args));
        } catch (error) {
          instrumentation._endSpanWithError(state, error);
          throw error;
        }

        const onError = (error: unknown) =>
          instrumentation._endSpanWithError(state, error);

        if (isStreamRequest(params) || !isAPIPromise(result)) {
          // Streaming responses must be unwrapped so that the stream's iterator
          // can be wrapped. Parsing an SSE response does not consume a JSON
          // body, so awaiting the promise here is safe.
          result.then(value => {
            if (isAnthropicStream(value)) {
              instrumentation._wrapStream(value, state);
            } else {
              instrumentation._endSpan(state);
            }
          }, onError);
        } else {
          instrumentation._observeAPIPromise(result, state);
        }

        // Preserve the Anthropic SDK's customized APIPromise instance.
        return result;
      };
    };
  }

  /**
   * End the span when the caller consumes the response, without consuming it
   * ourselves.
   *
   * Subscribing with `then()` would call `APIPromise#parse()`, reading the body
   * before a caller could reach it via `asResponse()`/`withResponse()`. Instead
   * we wrap `parse()` so that the span covers the body read and records body
   * level failures, and fall back to `asResponse()` for callers that only ever
   * want the raw `Response` (they own the body from that point on).
   */
  private _observeAPIPromise(
    apiPromise: AnthropicAPIPromise<unknown>,
    state: SpanState
  ): void {
    const onError = (error: unknown) => this._endSpanWithError(state, error);
    let parsed = false;

    this._wrap(apiPromise, 'parse', originalParse => {
      return () => {
        parsed = true;
        const parsePromise = originalParse.call(apiPromise);
        parsePromise.then(() => this._endSpan(state), onError);
        return parsePromise;
      };
    });

    // `parse()` is invoked synchronously by `then()`/`await`, so by the time the
    // response settles we know whether the caller ever intends to parse.
    apiPromise.asResponse().then(() => {
      if (!parsed) {
        this._endSpan(state);
      }
    }, onError);
  }

  private _wrapStream(stream: AnthropicStream, state: SpanState): void {
    // `Stream.tee()` calls `iterator()` directly, bypassing
    // `Symbol.asyncIterator`, so wrap the internal iterator method.
    this._wrap(stream, 'iterator', originalIterator => {
      return () => this._streamIterator(originalIterator(), state);
    });
  }

  private async *_streamIterator(
    iterator: AsyncIterator<unknown>,
    state: SpanState
  ): AsyncGenerator<unknown> {
    let exhausted = false;
    try {
      while (true) {
        const next = await iterator.next();
        if (next.done) {
          exhausted = true;
          break;
        }
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
