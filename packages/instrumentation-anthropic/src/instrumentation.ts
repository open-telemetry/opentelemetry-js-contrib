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
  controller?: AbortController;
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

function isMessageCreateParams(
  value: unknown
): value is Anthropic.Messages.MessageCreateParams {
  return typeof value === 'object' && value !== null;
}

function isStreamRequest(
  params: Anthropic.Messages.MessageCreateParams | undefined
): boolean {
  return params?.stream === true;
}

/**
 * `AnthropicBedrock` and `AnthropicVertex` extend `BaseAnthropic` and reuse the
 * core `Messages` resource, so the same patch serves all three. Derive the
 * provider from the client's base URL rather than assuming the first-party API.
 */
function getProviderName(client: unknown): string {
  const baseURL = (client as { baseURL?: unknown })?.baseURL;
  if (typeof baseURL === 'string') {
    let host: string;
    try {
      host = new URL(baseURL).host;
    } catch {
      return 'anthropic';
    }
    if (/\.amazonaws\.com$/.test(host) && host.includes('bedrock')) {
      return 'aws.bedrock';
    }
    if (/(^|\.)aiplatform\.googleapis\.com$/.test(host)) {
      return 'gcp.vertex_ai';
    }
  }
  return 'anthropic';
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

        // Let the SDK raise its own error for a malformed call rather than
        // failing inside the patch before `original` is ever reached.
        if (!isMessageCreateParams(args[0])) {
          return original.apply(this, args);
        }

        const params = args[0];
        const model =
          typeof params.model === 'string' ? params.model : undefined;
        const span = instrumentation.tracer.startSpan(
          model ? `chat ${model}` : 'chat',
          {
            kind: SpanKind.CLIENT,
            attributes: {
              'gen_ai.operation.name': 'chat',
              'gen_ai.provider.name': getProviderName(this?._client),
              ...(model ? { 'gen_ai.request.model': model } : {}),
            },
          }
        );
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
   * both consumption paths are wrapped and the span ends with whichever the
   * caller actually uses:
   *
   * - `parse()` backs `then`/`catch`/`finally`/`await`/`withResponse()`, so the
   *   span covers the body read and records body-level failures.
   * - `asResponse()` hands the caller an unread `Response`; the caller owns the
   *   body from that point, so the span ends when the response settles.
   *
   * Nothing is subscribed eagerly: a caller may not consume the promise until
   * long after the response arrives, and ending the span at that point would
   * both truncate its duration and swallow a later parse failure. A promise
   * that is never consumed produces no span, and is collected along with these
   * wrappers once the caller drops it.
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

    this._wrap(apiPromise, 'asResponse', originalAsResponse => {
      return () => {
        const responsePromise = originalAsResponse.call(apiPromise);
        responsePromise.then(() => {
          // `withResponse()` calls `parse()` and `asResponse()` together; let
          // the parse result end the span so the body read is included.
          if (!parsed) {
            this._endSpan(state);
          }
        }, onError);
        return responsePromise;
      };
    });
  }

  private _wrapStream(stream: AnthropicStream, state: SpanState): void {
    // `Stream.tee()` calls `iterator()` directly, bypassing
    // `Symbol.asyncIterator`, so wrap the internal iterator method.
    this._wrap(stream, 'iterator', originalIterator => {
      // Call with the stream as receiver: `iterator` is an own-property closure
      // in current SDK versions, but the supported range is `>=0.65.0 <1`.
      return () =>
        this._streamIterator(originalIterator.call(stream), state, stream);
    });

    // A stream that is abandoned without ever being iterated would otherwise
    // leave the span open forever, since it is only ended from the iterator.
    const signal = stream.controller?.signal;
    if (signal) {
      if (signal.aborted) {
        this._endSpanWithAbort(state);
        return;
      }
      signal.addEventListener('abort', () => this._endSpanWithAbort(state), {
        once: true,
      });
    }
  }

  private async *_streamIterator(
    iterator: AsyncIterator<unknown>,
    state: SpanState,
    stream?: AnthropicStream
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
      // `Stream.fromSSEResponse` swallows abort errors and simply stops
      // yielding, so an aborted generation is indistinguishable from a
      // completed one without checking the signal.
      if (stream?.controller?.signal.aborted) {
        this._endSpanWithAbort(state);
      } else {
        this._endSpan(state);
      }
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

  private _endSpanWithAbort(state: SpanState): void {
    if (state.ended) return;
    state.span.setStatus({
      code: SpanStatusCode.ERROR,
      message: 'stream aborted',
    });
    state.span.setAttribute('error.type', 'APIUserAbortError');
    this._endSpan(state);
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
