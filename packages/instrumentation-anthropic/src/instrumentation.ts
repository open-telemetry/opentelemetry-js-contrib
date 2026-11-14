/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type Anthropic from '@anthropic-ai/sdk';
import { context } from '@opentelemetry/api';
import type { MeterProvider, TracerProvider } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { isTracingSuppressed } from '@opentelemetry/core';
import { TelemetryHandler } from '@opentelemetry/genai-util';
import type { AnthropicInstrumentationConfig } from './types';
import {
  getProviderName,
  getRequestOptions,
  ResponseRecorder,
  type InferenceInvocation,
} from './utils';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

/**
 * From 0.134.0 the SDK traces its own API calls with GenAI semantic
 * conventions, so patching those versions would emit a second span per call.
 */
const SUPPORTED_VERSIONS = ['>=0.65.0 <0.134.0'];

/**
 * Depth of `messages.stream()` calls on the stack. The helper invokes
 * `messages.create()` synchronously, so a non-zero depth means the span being
 * started belongs to that helper.
 */
let inMessagesStreamHelper = 0;

/** The state of the span the helper just started, handed to `patchedStream`. */
let pendingHelperState: CallState | undefined;

/** Read and clear it. A function, so its declared return type survives. */
function takePendingHelperState(): CallState | undefined {
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

interface CallState {
  /** Owns the span and metrics of the call; completes at most once. */
  invocation: InferenceInvocation;
  /** Records response metadata and usage onto `invocation`. */
  response: ResponseRecorder;
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
   * Set when the iteration ended because the caller aborted: the SDK swallows
   * abort errors and simply stops yielding, so this is read when the stream
   * wrapper finishes to record the abort instead of a success.
   */
  aborted: boolean;
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
  // Declared rather than initialized: the base constructor may call the
  // provider setters below before subclass field initializers would run.
  declare private _telemetry: TelemetryHandler | undefined;
  declare private _telemetryTracerProvider: TracerProvider | undefined;
  declare private _telemetryMeterProvider: MeterProvider | undefined;

  constructor(config: AnthropicInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  override setTracerProvider(provider: TracerProvider) {
    super.setTracerProvider(provider);
    this._telemetryTracerProvider = provider;
    this._telemetry = undefined;
  }

  override setMeterProvider(provider: MeterProvider) {
    super.setMeterProvider(provider);
    this._telemetryMeterProvider = provider;
    this._telemetry = undefined;
  }

  /**
   * The handler that owns each call's span and metrics. It is rebuilt when a
   * provider changes so that new calls report through the current providers.
   */
  private _getTelemetry(): TelemetryHandler {
    return (this._telemetry ??= new TelemetryHandler({
      instrumentationName: PACKAGE_NAME,
      instrumentationVersion: PACKAGE_VERSION,
      tracerProvider: this._telemetryTracerProvider,
      meterProvider: this._telemetryMeterProvider,
      diag: this._diag,
      // Message content is not recorded by this instrumentation, so the
      // capture environment variable must not change what is emitted.
      contentCaptureMode: 'none',
    }));
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
          SUPPORTED_VERSIONS,
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
        SUPPORTED_VERSIONS,
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
        const invocation = instrumentation._getTelemetry().startInference({
          providerName: getProviderName(this?._client),
          requestModel:
            typeof params.model === 'string' ? params.model : undefined,
          requestOptions: getRequestOptions(params),
        });
        const state: CallState = {
          invocation,
          response: new ResponseRecorder(invocation),
          awaitingNext: false,
          closing: false,
          aborted: false,
          helperOwned: inMessagesStreamHelper > 0,
        };
        if (state.helperOwned) {
          pendingHelperState = state;
        }

        let result: Promise<unknown>;
        try {
          result = invocation.withContext(() => original.apply(this, args));
        } catch (error) {
          instrumentation._fail(state, error);
          throw error;
        }

        if (isAPIPromise(result)) {
          instrumentation._observeAPIPromise(result, state);
        } else {
          // Not an `APIPromise`: fall back to observing the plain promise.
          result.then(
            value => instrumentation._onParsed(value, state),
            error => instrumentation._fail(state, error)
          );
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
    state: CallState
  ): void {
    const instrumentation = this;
    let failure: unknown;
    let failed = false;
    let aborted = false;

    this._wrap(messageStream, '_emit', original => {
      return function patchedEmit(
        this: unknown,
        event: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...args: any[]
      ) {
        if (event === 'streamEvent') {
          // The helper consumes the raw stream itself, so its events stand in
          // for the stream chunks the wrapper would otherwise observe.
          state.response.recordStreamEvent(args[0]);
          state.invocation.recordStreamChunk();
        } else if (event === 'error') {
          failure = args[0];
          failed = true;
        } else if (event === 'abort') {
          // The SDK emits `abort` instead of `error` when the caller cancels.
          // That is recorded as an error with `error.type`
          // `APIUserAbortError`, consistent with an aborted raw stream, since
          // the call did not produce a response.
          aborted = true;
        }
        const result = original.call(this, event, ...args);
        if (event === 'end') {
          if (aborted) {
            instrumentation._failWithAbort(state);
          } else if (failed) {
            instrumentation._fail(state, failure);
          } else if (messageStream.receivedMessages.length === 0) {
            // The stream ended before `message_stop`, so the helper cannot
            // produce a final message and `finalMessage()` will reject with
            // an `AnthropicError`.
            state.invocation.fail({
              errorType: 'AnthropicError',
              statusDescription:
                'stream ended without producing a Message with role=assistant',
            });
          } else {
            state.invocation.stop();
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
    state: CallState
  ): void {
    const onError = (error: unknown) => this._fail(state, error);
    let parsed = false;

    this._wrap(apiPromise, 'parse', originalParse => {
      return () => {
        const parsePromise = originalParse.call(apiPromise);
        // `parse()` is memoized and runs again for every `then`, `await` and
        // `withResponse()`; observing it more than once would wrap the same
        // stream again.
        if (parsed) {
          return parsePromise;
        }
        parsed = true;
        parsePromise.then(value => this._onParsed(value, state), onError);
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
            state.invocation.stop();
          }
        }, onError);
        return responsePromise;
      };
    });
  }

  /** Handle the parsed body: a `Stream` keeps the span open, a `Message` ends it. */
  private _onParsed(value: unknown, state: CallState): void {
    if (isAnthropicStream(value)) {
      // The span now belongs to the stream's lifetime.
      this._wrapStream(value, state);
    } else {
      state.response.recordMessage(value);
      state.invocation.stop();
    }
  }

  private _wrapStream(stream: AnthropicStream, state: CallState): void {
    const signal = stream.controller?.signal;

    // `Stream.tee()` calls `iterator()` directly, bypassing
    // `Symbol.asyncIterator`, so wrap the internal iterator method.
    this._wrap(stream, 'iterator', originalIterator => {
      // Call with the stream as receiver: `iterator` is an own-property closure
      // in current SDK versions, but the supported range is `>=0.65.0 <0.134.0`.
      const observed: AsyncIterable<unknown> = {
        [Symbol.asyncIterator]: () =>
          this._observeIterator(originalIterator.call(stream), state, signal),
      };
      // A helper stream is not finished when its events run out: the helper
      // still has to turn them into a final message, and reports its events
      // and outcome through `_emit` instead.
      const iterable = state.helperOwned
        ? observed
        : this._getTelemetry().wrapAsyncStream(observed, {
            invocation: state.invocation,
            onChunk: event => state.response.recordStreamEvent(event),
            onEnd: () => {
              if (state.aborted) this._failWithAbort(state);
            },
          });
      return () => iterable[Symbol.asyncIterator]();
    });

    // A stream that is abandoned without ever being iterated would otherwise
    // leave the span open forever, since it is only ended from the iterator.
    if (signal) {
      if (
        signal.aborted &&
        !state.awaitingNext &&
        !state.closing &&
        !state.helperOwned
      ) {
        this._failWithAbort(state);
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
            this._failWithAbort(state);
          }
        },
        { once: true }
      );
    }
  }

  /**
   * Track the abort-related state of the SDK iterator. Completing the
   * invocation, chunk metrics and response data are left to the genai-util
   * stream wrapper that sits on top of this iterator.
   */
  private _observeIterator(
    iterator: AsyncIterator<unknown>,
    state: CallState,
    signal: AbortSignal | undefined
  ): AsyncIterator<unknown> {
    let exhausted = false;
    return {
      next: async () => {
        state.awaitingNext = true;
        let result: IteratorResult<unknown>;
        try {
          result = await iterator.next();
        } catch (error) {
          this._fail(state, error);
          throw error;
        } finally {
          state.awaitingNext = false;
        }
        if (result.done) {
          exhausted = true;
          // `Stream.fromSSEResponse` swallows abort errors and simply stops
          // yielding, so an aborted generation is indistinguishable from a
          // completed one without checking the signal.
          if (signal?.aborted) state.aborted = true;
        } else if (signal?.aborted && !state.helperOwned) {
          // An abort raised while `next()` was outstanding is deferred to
          // here, and that call can still deliver a buffered event. The abort
          // listener has already fired by now, so nothing else would ever end
          // the span if the caller stops reading after this event.
          this._failWithAbort(state);
        }
        return result;
      },
      return: async (value?: unknown) => {
        // Sampled before `return()`, which aborts the controller itself when
        // the caller breaks out of the loop.
        if (!exhausted && signal?.aborted) state.aborted = true;
        // Whether the span has already ended is irrelevant to SDK cleanup: the
        // response body still has to be released and cancelled, exactly as it
        // would be without instrumentation.
        state.closing = true;
        try {
          await iterator.return?.(value);
        } catch (error) {
          this._diag.debug('error closing Anthropic stream iterator:', error);
        } finally {
          state.closing = false;
        }
        return { done: true, value };
      },
    };
  }

  private _failWithAbort(state: CallState): void {
    state.invocation.fail({
      errorType: 'APIUserAbortError',
      statusDescription: 'stream aborted',
    });
  }

  private _fail(state: CallState, error: unknown): void {
    // The SDK's error classes (`RateLimitError`, `APIConnectionError`, ...)
    // are the most reliable low-cardinality identifier, and are what
    // genai-util derives `error.type` from. A thrown non-`Error` has no such
    // name, so it falls back to `_OTHER` per semantic conventions.
    state.invocation.fail({
      exception: error instanceof Error ? error : undefined,
    });
  }
}
