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
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { isTracingSuppressed } from '@opentelemetry/core';
import type { AnthropicInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

/**
 * Depth of `messages.stream()` calls on the stack. The helper invokes
 * `messages.create()` synchronously, so a non-zero depth means the span being
 * started belongs to that helper.
 */
let inMessagesStreamHelper = 0;

/** The state of the span the helper just started, handed to `patchedStream`. */
let pendingHelperState: SpanState | undefined;

/** Read and clear it. A function, so its declared return type survives. */
function takePendingHelperState(): SpanState | undefined {
  const state = pendingHelperState;
  pendingHelperState = undefined;
  return state;
}

/**
 * A `MessageStream`. Its outcome is observed through `_emit`, never through
 * `done()`/`finalMessage()` or an `error` listener: the SDK reports otherwise
 * unhandled stream failures with `Promise.reject()` only while no terminal
 * promise has been created and no listener is registered for the event, so
 * either would silence the caller's own failures.
 *
 * `receivedMessages` carries what the helper accumulated; it being empty at
 * `end` is the condition on which `finalMessage()` rejects.
 */
interface AnthropicMessageStream {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _emit(event: string, ...args: any[]): void;
  receivedMessages: unknown[];
}

function isMessageStream(value: unknown): value is AnthropicMessageStream {
  const candidate = value as AnthropicMessageStream;
  return (
    typeof candidate?._emit === 'function' &&
    Array.isArray(candidate?.receivedMessages)
  );
}

/** The shared `resources/messages/messages` module, whichever entry point loaded it. */
interface MessagesModule {
  Messages: { prototype: Record<string, unknown> };
}

interface SpanState {
  span: Span;
  ended: boolean;
  /**
   * Set only while an `iterator.next()` call is outstanding. The SDK aborts
   * its own controller from inside that call when an SSE `error` event ends
   * iteration, so an abort observed in this window belongs to the iterator.
   * A suspended iterator (parked at `yield`) is caller-controlled time and is
   * deliberately excluded, so cancelling there still ends the span.
   */
  awaitingNext: boolean;
  /**
   * Set while the wrapped iterator closes the SDK iterator. `return()` aborts
   * the controller as ordinary cleanup, which must not read as a cancellation.
   */
  closing: boolean;
  /**
   * Set when the call was made by `messages.stream()`. The helper keeps
   * consuming after the raw stream ends — accumulating events into a final
   * message — and can fail there, so its terminal promise decides the outcome
   * instead of the iterator.
   */
  helperOwned: boolean;
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

function isMessageCreateParams(
  value: unknown
): value is Anthropic.Messages.MessageCreateParams {
  return typeof value === 'object' && value !== null;
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
    // Regional endpoints are `<region>-aiplatform.googleapis.com`; the global
    // endpoint has no region prefix.
    if (/(^|[.-])aiplatform\.googleapis\.com$/.test(host)) {
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
    // Patch the shared `Messages` resource file rather than the package root:
    // `@anthropic-ai/sdk/client` and the Bedrock and Vertex packages import SDK
    // subpaths, so a root-only hook never runs for them. Every entry point
    // loads this one file, so patching it here covers them all exactly once.
    // Both extensions are registered: native ESM resolves to `.mjs`, which a
    // `.js` hook does not match.
    const messagesFiles = [
      '@anthropic-ai/sdk/resources/messages/messages.js',
      '@anthropic-ai/sdk/resources/messages/messages.mjs',
    ].map(
      name =>
        new InstrumentationNodeModuleFile(
          name,
          ['>=0.65.0 <1'],
          (moduleExports: MessagesModule) => {
            this._wrap(
              moduleExports.Messages.prototype,
              'create',
              this._getPatchedMessagesCreate()
            );
            this._wrap(
              moduleExports.Messages.prototype,
              'stream',
              this._getPatchedMessagesStream()
            );
            return moduleExports;
          },
          (moduleExports: MessagesModule) => {
            this._unwrap(moduleExports.Messages.prototype, 'create');
            this._unwrap(moduleExports.Messages.prototype, 'stream');
          }
        )
    );

    return [
      new InstrumentationNodeModuleDefinition(
        '@anthropic-ai/sdk',
        ['>=0.65.0 <1'],
        undefined,
        undefined,
        messagesFiles
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
        if (
          !instrumentation.isEnabled() ||
          isTracingSuppressed(context.active())
        ) {
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
        const state: SpanState = {
          span,
          ended: false,
          awaitingNext: false,
          closing: false,
          helperOwned: inMessagesStreamHelper > 0,
        };
        if (state.helperOwned) {
          pendingHelperState = state;
        }
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

        if (isAPIPromise(result)) {
          instrumentation._observeAPIPromise(result, state);
        } else {
          // Not an `APIPromise`: fall back to observing the plain promise.
          result.then(value => {
            if (isAnthropicStream(value)) {
              instrumentation._wrapStream(value, state);
            } else {
              instrumentation._endSpan(state);
            }
          }, onError);
        }

        // Preserve the Anthropic SDK's customized APIPromise instance.
        return result;
      };
    };
  }

  /**
   * `messages.stream()` returns a helper that keeps working after the raw
   * stream is exhausted: it accumulates events into a final message, and
   * rejects if the response ended before `message_stop`. The iterator sees a
   * clean completion in that case, so the helper's own terminal promise has to
   * decide the span's outcome.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _getPatchedMessagesStream(): any {
    const instrumentation = this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original: any) => {
      return function patchedStream(
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

        takePendingHelperState();
        inMessagesStreamHelper++;
        let messageStream: unknown;
        try {
          // The helper calls `messages.create()` synchronously, so the span is
          // started before this returns.
          messageStream = original.apply(this, args);
        } finally {
          inMessagesStreamHelper--;
        }

        const state = takePendingHelperState();
        if (state && isMessageStream(messageStream)) {
          instrumentation._observeMessageStream(messageStream, state);
        } else if (state) {
          // The helper did not hand back something we can observe; fall back to
          // the iterator deciding, as it does for a raw stream.
          state.helperOwned = false;
        }

        return messageStream;
      };
    };
  }

  /**
   * Watch the helper's events without taking part in them.
   *
   * Registering a listener or awaiting `done()`/`finalMessage()` would tell the
   * SDK that someone is handling failures, and it would stop re-raising them as
   * unhandled rejections — so a caller that only reads stream events would
   * lose its errors as soon as instrumentation was enabled. Wrapping `_emit`
   * observes the same events while leaving the listener count and the terminal
   * promises untouched.
   */
  private _observeMessageStream(
    messageStream: AnthropicMessageStream,
    state: SpanState
  ): void {
    const instrumentation = this;
    let failure: unknown;
    let failed = false;

    this._wrap(messageStream, '_emit', original => {
      return function patchedEmit(
        this: unknown,
        event: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...args: any[]
      ) {
        if (event === 'error' || event === 'abort') {
          failure = args[0];
          failed = true;
        }
        const result = original.call(this, event, ...args);
        if (event === 'end') {
          if (failed) {
            instrumentation._endSpanWithError(state, failure);
          } else if (messageStream.receivedMessages.length === 0) {
            // The stream ended before `message_stop`, so the helper cannot
            // produce a final message and `finalMessage()` will reject.
            instrumentation._endSpanWithError(
              state,
              new Error(
                'stream ended without producing a Message with role=assistant'
              )
            );
          } else {
            instrumentation._endSpan(state);
          }
        }
        return result;
      };
    });
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
   * - `parse()` backs `then`/`catch`/`finally`/`await`/`withResponse()`. For a
   *   non-streaming call the span covers the body read and records body-level
   *   failures; for a streaming call it yields the `Stream`, whose iterator is
   *   wrapped so the span ends with the stream.
   * - `asResponse()` hands the caller an unread `Response`; the caller owns the
   *   body from that point, so the span ends when the response settles. This
   *   applies to streaming calls too, where the raw response is consumed
   *   directly and the stream iterator never runs.
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
        parsePromise.then(value => {
          if (isAnthropicStream(value)) {
            // The span now belongs to the stream's lifetime.
            this._wrapStream(value, state);
          } else {
            this._endSpan(state);
          }
        }, onError);
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
      if (
        signal.aborted &&
        !state.awaitingNext &&
        !state.closing &&
        !state.helperOwned
      ) {
        this._endSpanWithAbort(state);
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          // The SDK aborts its own controller when an SSE `error` event ends
          // iteration, before rejecting `next()`. Classifying that as a user
          // abort here would discard the real API error, so an abort raised
          // while `next()` is outstanding is left to the iterator. An abort
          // while the iterator is suspended is the caller cancelling, and may
          // be the last thing that ever happens to this stream.
          if (!state.awaitingNext && !state.closing && !state.helperOwned) {
            this._endSpanWithAbort(state);
          }
        },
        { once: true }
      );
    }
  }

  private async *_streamIterator(
    iterator: AsyncIterator<unknown>,
    state: SpanState,
    stream?: AnthropicStream
  ): AsyncGenerator<unknown> {
    const signal = stream?.controller?.signal;
    let exhausted = false;
    try {
      while (true) {
        state.awaitingNext = true;
        let next;
        try {
          next = await iterator.next();
        } finally {
          state.awaitingNext = false;
        }
        if (next.done) {
          exhausted = true;
          break;
        }
        // An abort raised while `next()` was outstanding is deferred to here,
        // and that call can still deliver a buffered event. The abort listener
        // has already fired by now, so nothing else would ever end the span if
        // the caller stops reading after this event.
        if (signal?.aborted && !state.helperOwned) {
          this._endSpanWithAbort(state);
        }
        yield next.value;
      }
      // `Stream.fromSSEResponse` swallows abort errors and simply stops
      // yielding, so an aborted generation is indistinguishable from a
      // completed one without checking the signal.
      // A helper stream is not finished when its events run out: the helper
      // still has to turn them into a final message, and can fail doing so.
      if (state.helperOwned) {
        // `MessageStream.done()` reports the outcome.
      } else if (signal?.aborted) {
        this._endSpanWithAbort(state);
      } else {
        this._endSpan(state);
      }
    } catch (error) {
      this._endSpanWithError(state, error);
      throw error;
    } finally {
      // Whether the span has already ended is irrelevant to SDK cleanup: the
      // response body still has to be released and cancelled, exactly as it
      // would be without instrumentation.
      if (!exhausted) {
        // Sampled before `return()`, which aborts the controller itself when
        // the caller breaks out of the loop.
        const abortedByCaller = signal?.aborted ?? false;
        state.closing = true;
        try {
          await iterator.return?.();
        } catch (error) {
          this._diag.debug('error closing Anthropic stream iterator:', error);
        } finally {
          state.closing = false;
        }
        if (state.helperOwned) {
          // `MessageStream.done()` reports the outcome.
        } else if (abortedByCaller) {
          this._endSpanWithAbort(state);
        } else {
          this._endSpan(state);
        }
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
