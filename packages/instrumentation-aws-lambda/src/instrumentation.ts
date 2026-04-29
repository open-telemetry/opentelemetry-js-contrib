/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InstrumentationBase,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  Context as OtelContext,
  context as otelContext,
  diag,
  propagation,
  ROOT_CONTEXT,
  MeterProvider,
  Span,
  SpanKind,
  SpanStatusCode,
  TextMapGetter,
  trace,
  TraceFlags,
  TracerProvider,
  Attributes,
} from '@opentelemetry/api';
import {
  AWSXRAY_TRACE_ID_HEADER,
  AWSXRayPropagator,
} from '@opentelemetry/propagator-aws-xray';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import { ATTR_CLOUD_ACCOUNT_ID, ATTR_FAAS_COLDSTART } from './semconv';
import { ATTR_FAAS_EXECUTION, ATTR_FAAS_ID } from './semconv-obsolete';

import {
  APIGatewayProxyEventHeaders,
  Callback,
  Context,
  Handler,
  StreamifyHandler,
} from 'aws-lambda';

import { AwsLambdaInstrumentationConfig } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import {
  finalizeSpan,
  initializeEventTriggerSpan,
  LambdaAttributes,
  TriggerOrigin,
} from './triggers';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';

diag.debug('Loading AwsLambdaInstrumentation');

const awsPropagator = new AWSXRayPropagator();
const headerGetter: TextMapGetter<APIGatewayProxyEventHeaders> = {
  keys(carrier): string[] {
    return Object.keys(carrier);
  },
  get(carrier, key: string) {
    return carrier[key];
  },
};

export const traceContextEnvironmentKey = '_X_AMZN_TRACE_ID';
export const xForwardProto = 'X-Forwarded-Proto';
const SPAN_STATE_ATTRIBUTE = 'cx.internal.span.state';
const TRACE_ID_ATTRIBUTE = 'cx.internal.trace.id';
const SPAN_ID_ATTRIBUTE = 'cx.internal.span.id';
const SPAN_ROLE_ATTRIBUTE = 'cx.internal.span.role';

type InstrumentationContext = {
  triggerOrigin: TriggerOrigin | undefined;
  triggerSpan: Span | undefined;
  invocationSpan: Span;
  invocationParentContext: OtelContext;
};

// Lambda's init phase is limited to 10 seconds. Otherwise the sandbox is
// re-nitialized from scratch.
export const lambdaMaxInitInMilliseconds = 10_000;
export const AWS_HANDLER_STREAMING_SYMBOL = Symbol.for(
  'aws.lambda.runtime.handler.streaming'
);
export const AWS_HANDLER_STREAMING_RESPONSE = 'response';

/**
 * Determines if callback-based handlers are supported based on the Node.js runtime version.
 * Returns true if callbacks are supported (Node.js < 24).
 * Returns false if AWS_EXECUTION_ENV is not set or doesn't match the expected format.
 */
function isSupportingCallbacks(): boolean {
  const executionEnv = process.env.AWS_EXECUTION_ENV;
  if (!executionEnv) {
    return false;
  }

  // AWS_EXECUTION_ENV format: AWS_Lambda_nodejs24.x, AWS_Lambda_nodejs22.x, etc.
  const match = executionEnv.match(/AWS_Lambda_nodejs(\d+)\./);
  if (match && match[1]) {
    return parseInt(match[1], 10) < 24;
  }

  return false;
}

export class AwsLambdaInstrumentation extends InstrumentationBase<AwsLambdaInstrumentationConfig> {
  private declare _traceForceFlusher?: () => Promise<void>;
  private declare _metricForceFlusher?: () => Promise<void>;
  private declare config: AwsLambdaInstrumentationConfig;

  constructor(config: AwsLambdaInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this.config = config;
  }

  init() {
    return [];
  }

  public getPatchHandler(
    original: Handler | StreamifyHandler
  ): Handler | StreamifyHandler {
    diag.debug('patching handler function');
    const plugin = this;

    let requestHandledBefore = false;
    let requestIsColdStart = true;

    const lambdaStartTime =
      this.getConfig().lambdaStartTime ||
      Date.now() - Math.floor(1000 * process.uptime());

    function _onRequest(): void {
      if (requestHandledBefore) {
        // Non-first requests cannot be coldstart.
        requestIsColdStart = false;
      } else {
        if (
          process.env.AWS_LAMBDA_INITIALIZATION_TYPE ===
          'provisioned-concurrency'
        ) {
          // If sandbox environment is initialized with provisioned concurrency,
          // even the first requests should not be considered as coldstart.
          requestIsColdStart = false;
        } else {
          // Check whether it is proactive initialization or not:
          // https://aaronstuyvenberg.com/posts/understanding-proactive-initialization
          const passedTimeSinceHandlerLoad: number =
            Date.now() - lambdaStartTime;
          const proactiveInitialization: boolean =
            passedTimeSinceHandlerLoad > lambdaMaxInitInMilliseconds;

          // If sandbox has been initialized proactively before the actual request,
          // even the first requests should not be considered as coldstart.
          requestIsColdStart = !proactiveInitialization;
        }
        requestHandledBefore = true;
      }
    }

    if (this._isStreamingHandler(original)) {
      return function patchedStreamingHandler(
        this: never,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: any,
        responseStream: Parameters<StreamifyHandler>[1],
        context: Context
      ) {
        _onRequest();

        return plugin._before_execution(event, context, requestIsColdStart).then(
          instrCtx =>
            otelContext.with(
              trace.setSpan(
                instrCtx.invocationParentContext,
                instrCtx.invocationSpan
              ),
              () =>
                plugin._executePromiseHandler(
                  () => original.apply(this, [event, responseStream, context]),
                  context,
                  instrCtx
                )
            ),
          err => plugin._handleBeforeExecutionFailurePromise(err, context)
        );
      };
    }

    const supportsCallbacks = isSupportingCallbacks();

    if (supportsCallbacks) {
      return function patchedHandlerWithCallback(
        this: never,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: any,
        context: Context,
        callback?: Callback
      ) {
        _onRequest();

        return plugin._before_execution(event, context, requestIsColdStart).then(
          instrCtx =>
            otelContext.with(
              trace.setSpan(
                instrCtx.invocationParentContext,
                instrCtx.invocationSpan
              ),
              () => {
                if (callback) {
                  plugin._invokeWithCallback(
                    original as Handler,
                    this,
                    event,
                    context,
                    callback,
                    instrCtx
                  );
                  return;
                }

                return plugin._executePromiseHandler(
                  () =>
                    (original as (event: any, context: Context) => any).apply(
                      this,
                      [event, context]
                    ),
                  context,
                  instrCtx
                );
              }
            ),
          err =>
            callback
              ? plugin._handleBeforeExecutionFailureCallback(
                  err,
                  context,
                  callback
                )
              : plugin._handleBeforeExecutionFailurePromise(err, context)
        );
      };
    }

    // Node.js 24+: Promise-only handlers (but keep callback compatibility for legacy code)
    return function patchedPromiseHandler(
      this: never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: any,
      context: Context,
      callback?: Callback
    ) {
      _onRequest();

      return plugin._before_execution(event, context, requestIsColdStart).then(
        instrCtx =>
          otelContext.with(
            trace.setSpan(
              instrCtx.invocationParentContext,
              instrCtx.invocationSpan
            ),
            () => {
              if (callback) {
                plugin._invokeWithCallback(
                  original as Handler,
                  this,
                  event,
                  context,
                  callback,
                  instrCtx
                );
                return undefined;
              }

              return plugin._executePromiseHandler(
                () =>
                  (original as (event: any, context: Context) => any).apply(
                    this,
                    [event, context]
                  ),
                context,
                instrCtx
              );
            }
          ),
        err =>
          callback
            ? plugin._handleBeforeExecutionFailureCallback(
                err,
                context,
                callback
              )
            : plugin._handleBeforeExecutionFailurePromise(err, context)
      );
    };
  }

  private async _before_execution(
    event: any,
    context: Context,
    requestIsColdStart: boolean
  ): Promise<InstrumentationContext> {
    const upstreamContext = this._determineUpstreamContext(event, context);

    const { triggerSpan, triggerOrigin } =
      this._startTriggerSpan(event, upstreamContext) ?? {};

    let invocationParentContext;
    if (triggerSpan) {
      invocationParentContext = trace.setSpan(upstreamContext, triggerSpan);
    } else {
      invocationParentContext = upstreamContext;
    }

    const invocationSpan = this._startInvocationSpan(
      event,
      context,
      invocationParentContext,
      requestIsColdStart
    );

    await this._sendEarlySpans(
      upstreamContext,
      triggerSpan,
      invocationParentContext,
      invocationSpan
    );

    return {
      triggerOrigin,
      triggerSpan,
      invocationSpan,
      invocationParentContext,
    };
  }

  // never fails
  private async _after_execution(
    context: InstrumentationContext | undefined,
    err: string | Error | null | undefined,
    res: any
  ): Promise<void> {
    try {
      const plugin = this;
      if (context?.invocationSpan) {
        plugin._applyResponseHook(context.invocationSpan, err, res);
        plugin._endInvocationSpan(context.invocationSpan, err);
      }
      if (context?.triggerSpan) {
        plugin._endTriggerSpan(
          context.triggerSpan,
          context.triggerOrigin,
          res,
          err
        );
      }
    } catch (e) {
      diag.error('Error in _after_execution', e);
    }

    await this._flush();
    diag.debug('_after_execution completed');
  }

  // never fails
  private async _sendEarlySpans(
    triggerParentContext: OtelContext,
    triggerSpan: Span | undefined,
    invocationParentContext: OtelContext,
    invocationSpan: Span
  ) {
    try {
      if (
        triggerSpan &&
        (triggerSpan as unknown as ReadableSpan).kind !== undefined
      ) {
        const earlyTrigger = this._createEarlySpan(
          triggerParentContext,
          triggerSpan as unknown as ReadableSpan
        );
        earlyTrigger.end();
      }

      if (
        invocationSpan &&
        (invocationSpan as unknown as ReadableSpan).kind !== undefined
      ) {
        const earlyTrigger = this._createEarlySpan(
          invocationParentContext,
          invocationSpan as unknown as ReadableSpan
        );
        earlyTrigger.end();
      }
    } catch (e) {
      diag.warn('Failed to prepare early spans', e);
    }
    await this._flush_trace();
  }

  private _createEarlySpan(
    parentContext: OtelContext,
    span: ReadableSpan
  ): Span {
    const earlySpan = this.tracer.startSpan(
      span.name,
      {
        startTime: span.startTime,
        kind: span.kind,
        attributes: span.attributes,
        links: span.links,
      },
      parentContext
    );

    const attributes = span.attributes;
    for (const [key, value] of Object.entries(attributes)) {
      if (value) {
        earlySpan.setAttribute(key, value);
      }
    }

    const events = span.events;
    for (const event of events) {
      earlySpan.addEvent(event.name, event.attributes, event.time);
    }

    earlySpan.setAttribute(SPAN_STATE_ATTRIBUTE, 'early');
    earlySpan.setAttribute(TRACE_ID_ATTRIBUTE, span.spanContext().traceId);
    earlySpan.setAttribute(SPAN_ID_ATTRIBUTE, span.spanContext().spanId);

    return earlySpan;
  }

  private _startTriggerSpan(
    event: unknown,
    parentContext: OtelContext
  ): { triggerOrigin: TriggerOrigin; triggerSpan: Span } | undefined {
    if (this.config.detectTrigger === false) {
      return undefined;
    }
    const trigger = initializeEventTriggerSpan(event);
    if (!trigger) {
      return undefined;
    }
    const { name, options, origin } = trigger;
    if (!options.attributes) {
      options.attributes = {};
    }
    options.attributes[LambdaAttributes.TRIGGER_SERVICE] = origin;
    options.attributes[SPAN_ROLE_ATTRIBUTE] = 'trigger';
    const triggerSpan = this.tracer.startSpan(name, options, parentContext);
    return { triggerOrigin: origin, triggerSpan };
  }

  private _endTriggerSpan(
    span: Span,
    triggerOrigin: TriggerOrigin | undefined,
    lambdaResponse: any,
    errorFromLambda: string | Error | null | undefined
  ): void {
    if (span.isRecording()) {
      if (errorFromLambda) {
        span.recordException(errorFromLambda);

        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: this._errorToString(errorFromLambda),
        });

        span.end();
        return;
      }

      if (triggerOrigin) {
        finalizeSpan(this.config, triggerOrigin, span, lambdaResponse);
      }
      span.end();
    } else {
      diag.debug('Ending wrapper span for the second time');
    }
  }

  private _startInvocationSpan(
    event: any,
    context: Context,
    invocationParentContext: OtelContext,
    requestIsColdStart: boolean
  ): Span {
    const invocationSpan = this.tracer.startSpan(
      context.functionName,
      {
        kind: SpanKind.SERVER,
        attributes: {
          [ATTR_FAAS_EXECUTION]: context.awsRequestId,
          [SPAN_ROLE_ATTRIBUTE]: 'invocation',
          [ATTR_FAAS_ID]: context.invokedFunctionArn,
          [ATTR_CLOUD_ACCOUNT_ID]:
            AwsLambdaInstrumentation._extractAccountId(
              context.invokedFunctionArn
            ),
          [ATTR_FAAS_COLDSTART]: requestIsColdStart,
          ...AwsLambdaInstrumentation._extractOtherEventFields(event),
        },
      },
      invocationParentContext
    );

    if (this.config.requestHook) {
      try {
        this.config.requestHook!(invocationSpan, { event, context });
      } catch (e) {
        diag.error('aws-lambda instrumentation: requestHook error', e);
      }
    }
    return invocationSpan;
  }

  private _endInvocationSpan(
    span: Span,
    err: string | Error | null | undefined
  ): void {
    if (span.isRecording()) {
      if (err) {
        span.recordException(err);
      }

      const errMessage = this._errorToString(err);
      if (errMessage) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errMessage,
        });
      }
      span.end();
    } else {
      diag.debug('Ending span for the second time');
    }
  }

  private _wrapCallback(
    originalAWSLambdaCallback: Callback,
    instrumentationContext: InstrumentationContext
  ): Callback {
    return (err, res) => {
      diag.debug('executing wrapped callback function');
      this._after_execution(instrumentationContext, err, res).then(() => {
        diag.debug('executing original callback function');
        originalAWSLambdaCallback.apply(this, [err, res]); // End of the function
      });
    };
  }

  private _invokeWithCallback(
    original: Handler,
    thisArg: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any,
    context: Context,
    callback: Callback,
    instrumentationContext: InstrumentationContext
  ): void {
    const wrappedCallback = this._wrapCallback(callback, instrumentationContext);

    let maybePromise: unknown;
    try {
      maybePromise = original.apply(thisArg, [event, context, wrappedCallback]);
    } catch (err) {
      diag.debug('handler threw synchronously');
      this._after_execution(instrumentationContext, err as Error, undefined).then(
        () => {
          this._markEventLoopDontWait(context);
          diag.debug('calling AWS callback');
          callback(err as Error, undefined);
        }
      );
      return;
    }

    if (
      typeof maybePromise === 'object' &&
      maybePromise !== null &&
      typeof (maybePromise as PromiseLike<unknown>).then === 'function'
    ) {
      diag.debug('handler returned a promise');
      Promise.resolve(maybePromise).then(
        (value: unknown) => {
          diag.debug('handler promise completed');
          return this._after_execution(instrumentationContext, undefined, value).then(
            () => {
              this._markEventLoopDontWait(context);
              diag.debug('calling AWS callback');
              callback(undefined, value);
            }
          );
        },
        (err: unknown) => {
          diag.debug('handler promise failed');
          return this._after_execution(
            instrumentationContext,
            err as Error | string,
            undefined
          ).then(
            () => {
              this._markEventLoopDontWait(context);
              diag.debug('calling AWS callback');
              callback(err as Error | string, undefined);
            }
          );
        }
      );
    } else {
      diag.debug('handler returned synchronously (callback based)');
    }
  }

  private _executePromiseHandler(
    invokeOriginal: () => any,
    context: Context,
    instrumentationContext: InstrumentationContext
  ): Promise<any> {
    let maybePromise: unknown;
    try {
      maybePromise = invokeOriginal();
    } catch (err) {
      return this._handlePromiseRejection(
        err as Error | string,
        context,
        instrumentationContext
      );
    }

    if (
      typeof maybePromise === 'object' &&
      maybePromise !== null &&
      typeof (maybePromise as PromiseLike<unknown>).then === 'function'
    ) {
      return Promise.resolve(maybePromise).then(
        (value: unknown) =>
          this._handlePromiseResolution(
            value,
            context,
            instrumentationContext
          ),
        (err: unknown) =>
          this._handlePromiseRejection(
            err as Error | string,
            context,
            instrumentationContext
          )
      );
    }

    return this._handlePromiseResolution(
      maybePromise,
      context,
      instrumentationContext
    );
  }

  private async _handlePromiseResolution(
    value: unknown,
    context: Context,
    instrumentationContext: InstrumentationContext
  ) {
    diag.debug('handler promise completed');
    await this._after_execution(instrumentationContext, undefined, value);
    this._markEventLoopDontWait(context);
    return value;
  }

  private async _handlePromiseRejection(
    err: Error | string,
    context: Context,
    instrumentationContext: InstrumentationContext
  ) {
    diag.debug('handler promise failed');
    await this._after_execution(instrumentationContext, err, undefined);
    this._markEventLoopDontWait(context);
    throw err;
  }

  private async _handleBeforeExecutionFailurePromise(
    err: Error | string,
    context: Context
  ): Promise<never> {
    diag.error('_before_execution failed', err);
    await this._after_execution(undefined, err, undefined);
    this._markEventLoopDontWait(context);
    throw err;
  }

  private async _handleBeforeExecutionFailureCallback(
    err: Error | string,
    context: Context,
    callback: Callback
  ): Promise<void> {
    diag.error('_before_execution failed', err);
    await this._after_execution(undefined, err, undefined);
    this._markEventLoopDontWait(context);
    diag.debug('calling AWS callback');
    callback(err, undefined);
  }

  private _markEventLoopDontWait(context: Context) {
    try {
      context.callbackWaitsForEmptyEventLoop = false;
    } catch (e) {
      diag.debug('failed to set callbackWaitsForEmptyEventLoop', e);
    }
  }

  private _isStreamingHandler<TEvent, TResult>(
    handler: Handler<TEvent, TResult> | StreamifyHandler<TEvent, TResult>
  ): handler is StreamifyHandler<TEvent, TResult> {
    return (
      (handler as unknown as Record<symbol, unknown>)[
        AWS_HANDLER_STREAMING_SYMBOL
      ] === AWS_HANDLER_STREAMING_RESPONSE
    );
  }

  // never fails
  private async _flush(): Promise<void> {
    await Promise.all([this._flush_trace(), this._flush_metric()]);
  }

  // never fails
  private async _flush_trace(): Promise<void> {
    if (this._traceForceFlusher) {
      try {
        await this._traceForceFlusher();
      } catch (e) {
        diag.error('Error while flushing traces', e);
      }
    } else {
      diag.error(
        'Spans may not be exported for the lambda function because we are not force flushing before callback.'
      );
    }
  }

  // never fails
  private async _flush_metric(): Promise<void> {
    if (this._metricForceFlusher) {
      try {
        await this._metricForceFlusher();
      } catch (e) {
        diag.error('Error while flushing metrics', e);
      }
    } else {
      diag.error(
        'Metrics may not be exported for the lambda function because we are not force flushing before callback.'
      );
    }
  }

  private _errorToString(
    err: string | Error | null | undefined
  ): string | undefined {
    let errMessage;
    if (typeof err === 'string') {
      errMessage = err;
    } else if (err) {
      errMessage = err.message;
    }
    return errMessage;
  }

  override setTracerProvider(tracerProvider: TracerProvider): void {
    super.setTracerProvider(tracerProvider);
    this._traceForceFlusher = this._traceForceFlush(tracerProvider);
  }

  private _traceForceFlush(
    tracerProvider: TracerProvider
  ): (() => Promise<void>) | undefined {
    if (!tracerProvider) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentProvider: any = tracerProvider;

    if (typeof currentProvider.getDelegate === 'function') {
      currentProvider = currentProvider.getDelegate();
    }

    if (typeof currentProvider.forceFlush === 'function') {
      return currentProvider.forceFlush.bind(currentProvider);
    }

    return undefined;
  }

  override setMeterProvider(meterProvider: MeterProvider): void {
    super.setMeterProvider(meterProvider);
    this._metricForceFlusher = this._metricForceFlush(meterProvider);
  }

  private _metricForceFlush(
    meterProvider: MeterProvider
  ): (() => Promise<void>) | undefined {
    if (!meterProvider) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentProvider: any = meterProvider;

    if (typeof currentProvider.forceFlush === 'function') {
      return currentProvider.forceFlush.bind(currentProvider);
    }

    return undefined;
  }

  private _applyResponseHook(
    span: Span,
    err?: Error | string | null,
    res?: any
  ): void {
    const responseHook = this.config?.responseHook;
    if (responseHook) {
      safeExecuteInTheMiddle(
        () => responseHook(span, { err, res }),
        e => {
          if (e)
            diag.error('aws-lambda instrumentation: responseHook error', e);
        },
        true
      );
    }
  }

  private static _extractAccountId(arn: string): string | undefined {
    const parts = arn.split(':');
    if (parts.length >= 5) {
      return parts[4];
    }
    return undefined;
  }

  private static _defaultEventContextExtractor(event: any): OtelContext {
    // The default extractor tries to get sampled trace header from HTTP headers.
    const httpHeaders = event.headers || {};
    return propagation.extract(ROOT_CONTEXT, httpHeaders, headerGetter);
  }

  private static _extractOtherEventFields(event: any): Attributes {
    const answer: Attributes = {};
    const fullUrl = this._extractFullUrl(event);
    if (fullUrl) {
      answer[ATTR_URL_FULL] = fullUrl;
    }
    return answer;
  }

  private static _extractFullUrl(event: any): string | undefined {
    // API gateway encodes a lot of url information in various places to recompute this
    if (!event.headers) {
      return undefined;
    }
    // Helper function to deal with case variations (instead of making a tolower() copy of the headers)
    function findAny(
      event: any,
      key1: string,
      key2: string
    ): string | undefined {
      return event.headers[key1] ?? event.headers[key2];
    }
    const host = findAny(event, 'host', 'Host');
    const proto = findAny(event, 'x-forwarded-proto', 'X-Forwarded-Proto');
    const port = findAny(event, 'x-forwarded-port', 'X-Forwarded-Port');
    if (!(proto && host && (event.path || event.rawPath))) {
      return undefined;
    }
    let answer = proto + '://' + host;
    if (port) {
      answer += ':' + port;
    }
    answer += event.path ?? event.rawPath;
    if (event.queryStringParameters) {
      let first = true;
      for (const key in event.queryStringParameters) {
        answer += first ? '?' : '&';
        answer += encodeURIComponent(key);
        answer += '=';
        answer += encodeURIComponent(event.queryStringParameters[key]);
        first = false;
      }
    }
    return answer;
  }

  private _determineUpstreamContext(event: any, context: Context): OtelContext {
    let parent: OtelContext | undefined = undefined;
    if (!this.config.disableAwsContextPropagation) {
      const lambdaTraceHeader = process.env[traceContextEnvironmentKey];
      if (lambdaTraceHeader) {
        parent = awsPropagator.extract(
          otelContext.active(),
          { [AWSXRAY_TRACE_ID_HEADER]: lambdaTraceHeader },
          headerGetter
        );
      }
      if (parent) {
        const spanContext = trace.getSpan(parent)?.spanContext();
        if (
          spanContext &&
          (spanContext.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED
        ) {
          // Trace header provided by Lambda only sampled if a sampled context was propagated from
          // an upstream cloud service such as S3, or the user is using X-Ray. In these cases, we
          // need to use it as the parent.
          return parent;
        }
      }
    }
    const eventContextExtractor =
      this.config.eventContextExtractor ||
      AwsLambdaInstrumentation._defaultEventContextExtractor;
    const extractedContext = safeExecuteInTheMiddle(
      () => eventContextExtractor(event, context),
      e => {
        if (e)
          diag.error(
            'aws-lambda instrumentation: eventContextExtractor error',
            e
          );
      },
      true
    );
    if (extractedContext && trace.getSpan(extractedContext)?.spanContext()) {
      return extractedContext;
    }
    return ROOT_CONTEXT;
  }
}
