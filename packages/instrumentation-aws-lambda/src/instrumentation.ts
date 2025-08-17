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

import * as path from 'path';
import * as fs from 'fs';

import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  Context as OtelContext,
  context as otelContext,
  diag,
  trace,
  propagation,
  MeterProvider,
  Span,
  SpanKind,
  SpanStatusCode,
  TextMapGetter,
  TracerProvider,
  ROOT_CONTEXT,
  Attributes,
} from '@opentelemetry/api';
import { pubsubPropagation } from '@opentelemetry/propagation-utils';
import {
  ATTR_URL_FULL,
  MESSAGINGOPERATIONVALUES_PROCESS,
  SEMATTRS_MESSAGING_DESTINATION,
  SEMATTRS_MESSAGING_MESSAGE_ID,
  SEMATTRS_MESSAGING_OPERATION,
  SEMATTRS_MESSAGING_SYSTEM,
} from '@opentelemetry/semantic-conventions';
import { ATTR_CLOUD_ACCOUNT_ID, ATTR_FAAS_COLDSTART } from './semconv';
import { ATTR_FAAS_EXECUTION, ATTR_FAAS_ID } from './semconv-obsolete';

import {
  APIGatewayProxyEventHeaders,
  Callback,
  Context,
  Handler,
  SQSRecord,
  StreamifyHandler,
} from 'aws-lambda';

import { AwsLambdaInstrumentationConfig, EventContextExtractor } from './types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { LambdaModule } from './internal-types';

const headerGetter: TextMapGetter<APIGatewayProxyEventHeaders> = {
  keys(carrier): string[] {
    return Object.keys(carrier);
  },
  get(carrier, key: string) {
    return carrier[key];
  },
};

const sqsContextGetter: TextMapGetter = {
  keys(carrier): string[] {
    if (carrier == null) {
      return [];
    }
    return Object.keys(carrier);
  },
  get(carrier, key: string) {
    return carrier?.[key]?.stringValue || carrier?.[key]?.value;
  },
};

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
  declare private _traceForceFlusher?: () => Promise<void>;
  declare private _metricForceFlusher?: () => Promise<void>;

  constructor(config: AwsLambdaInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  init() {
    const taskRoot = process.env.LAMBDA_TASK_ROOT;
    const handlerDef = this.getConfig().lambdaHandler ?? process.env._HANDLER;

    // _HANDLER and LAMBDA_TASK_ROOT are always defined in Lambda but guard bail out if in the future this changes.
    if (!taskRoot || !handlerDef) {
      this._diag.debug(
        'Skipping lambda instrumentation: no _HANDLER/lambdaHandler or LAMBDA_TASK_ROOT.',
        { taskRoot, handlerDef }
      );
      return [];
    }

    const handler = path.basename(handlerDef);
    const moduleRoot = handlerDef.substring(
      0,
      handlerDef.length - handler.length
    );

    const [module, functionName] = handler.split('.', 2);

    // Lambda loads user function using an absolute path.
    let filename = path.resolve(taskRoot, moduleRoot, module);
    if (!filename.endsWith('.js')) {
      // It's impossible to know in advance if the user has a js, mjs or cjs file.
      // Check that the .js file exists otherwise fallback to the next known possibilities (.mjs, .cjs).
      try {
        fs.statSync(`${filename}.js`);
        filename += '.js';
      } catch (e) {
        try {
          fs.statSync(`${filename}.mjs`);
          // fallback to .mjs (ESM)
          filename += '.mjs';
        } catch (e2) {
          try {
            fs.statSync(`${filename}.cjs`);
            // fallback to .cjs (CommonJS)
            filename += '.cjs';
          } catch (e3) {
            this._diag.warn(
              'No handler file was able to resolved with one of the known extensions for the file',
              filename
            );
          }
        }
      }
    }

    diag.debug('Instrumenting lambda handler', {
      taskRoot,
      handlerDef,
      handler,
      moduleRoot,
      module,
      filename,
      functionName,
    });

    const lambdaStartTime =
      this.getConfig().lambdaStartTime ||
      Date.now() - Math.floor(1000 * process.uptime());

    return [
      new InstrumentationNodeModuleDefinition(
        // NB: The patching infrastructure seems to match names backwards, this must be the filename, while
        // InstrumentationNodeModuleFile must be the module name.
        filename,
        ['*'],
        undefined,
        undefined,
        [
          new InstrumentationNodeModuleFile(
            module,
            ['*'],
            (moduleExports: LambdaModule) => {
              if (isWrapped(moduleExports[functionName])) {
                this._unwrap(moduleExports, functionName);
              }
              this._wrap(
                moduleExports,
                functionName,
                this._getHandler(lambdaStartTime)
              );
              return moduleExports;
            },
            (moduleExports?: LambdaModule) => {
              if (moduleExports == null) return;
              this._unwrap(moduleExports, functionName);
            }
          ),
        ]
      ),
    ];
  }

  private _getHandler(handlerLoadStartTime: number) {
    return (
      original: Handler | StreamifyHandler
    ): Handler | StreamifyHandler => {
      const patchedHandler = this._getPatchHandler(
        original,
        handlerLoadStartTime
      );

      if (this._isStreamingHandler(original)) {
        // Streaming handlers have special symbols that we need to copy over to the patched handler.
        for (const symbol of Object.getOwnPropertySymbols(original)) {
          (patchedHandler as unknown as Record<symbol, unknown>)[symbol] = (
            original as unknown as Record<symbol, unknown>
          )[symbol];
        }
      }

      return patchedHandler;
    };
  }

  private _getPatchHandler(
    original: Handler | StreamifyHandler,
    lambdaStartTime: number
  ): Handler | StreamifyHandler {
    diag.debug('patch handler function');
    const plugin = this;

    let requestHandledBefore = false;
    let requestIsColdStart = true;

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
        // The event can be a user type, it truly is any.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: any,
        responseStream: Parameters<StreamifyHandler>[1],
        context: Context
      ) {
        _onRequest();

        const parent = plugin._determineParent(event, context);
        const span = plugin._createSpanForRequest(
          event,
          context,
          requestIsColdStart,
          parent
        );
        plugin._applyRequestHook(span, event, context);

        return otelContext.with(trace.setSpan(parent, span), () => {
          const maybePromise = safeExecuteInTheMiddle(
            () => original.apply(this, [event, responseStream, context]),
            error => {
              if (error != null) {
                // Exception thrown synchronously before resolving promise.
                plugin._applyResponseHook(span, error);
                plugin._endSpan(span, error, () => {});
              }
            }
          ) as Promise<{}> | undefined;

          return plugin._handlePromiseResult(span, maybePromise);
        });
      };
    }

    // Determine whether to support callbacks based on runtime version
    const supportsCallbacks = isSupportingCallbacks();

    if (supportsCallbacks) {
      // Node.js 22 and lower: Support callback-based handlers for backward compatibility
      return function patchedHandlerWithCallback(
        this: never,
        // The event can be a user type, it truly is any.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: any,
        context: Context,
        callback?: Callback
      ) {
        _onRequest();

        const parent = plugin._determineParent(event, context);

        const span = plugin._createSpanForRequest(
          event,
          context,
          requestIsColdStart,
          parent
        );

        plugin._applyRequestHook(span, event, context);

        return otelContext.with(trace.setSpan(parent, span), () => {
          if (event.Records && event.Records[0].eventSource === 'aws:sqs') {
            const messages = event.Records;
            const queueArn = messages[0]?.eventSourceARN;
            const queueName = queueArn?.split(':').pop() ?? 'unknown';
            pubsubPropagation.patchMessagesArrayToStartProcessSpans({
              messages,
              parentContext: trace.setSpan(otelContext.active(), span),
              tracer: plugin.tracer,
              messageToSpanDetails: (message: SQSRecord) => ({
                name: queueName,
                parentContext: propagation.extract(
                  ROOT_CONTEXT,
                  message.messageAttributes || {},
                  sqsContextGetter
                ),
                attributes: {
                  [SEMATTRS_MESSAGING_SYSTEM]: 'aws.sqs',
                  [SEMATTRS_MESSAGING_DESTINATION]: queueName,
                  [SEMATTRS_MESSAGING_MESSAGE_ID]: message.messageId,
                  [SEMATTRS_MESSAGING_OPERATION]:
                    MESSAGINGOPERATIONVALUES_PROCESS,
                },
              }),
            });

            pubsubPropagation.patchArrayForProcessSpans(
              messages,
              plugin.tracer,
              otelContext.active()
            );
          }

          // Support both callback-based and Promise-based handlers for backward compatibility
          if (callback) {
            const wrappedCallback = plugin._wrapCallback(callback, span);
            const maybePromise = safeExecuteInTheMiddle(
              () => original.apply(this, [event, context, wrappedCallback]),
              error => {
                if (error != null) {
                  // Exception thrown synchronously before resolving callback / promise.
                  plugin._applyResponseHook(span, error);
                  plugin._endSpan(span, error, () => {});
                }
              }
            ) as Promise<{}> | undefined;

            return plugin._handlePromiseResult(span, maybePromise);
          } else {
            // Promise-based handler
            const maybePromise = safeExecuteInTheMiddle(
              () =>
                (
                  original as (
                    event: any,
                    context: Context
                  ) => Promise<any> | any
                ).apply(this, [event, context]),
              error => {
                if (error != null) {
                  // Exception thrown synchronously before resolving promise.
                  plugin._applyResponseHook(span, error);
                  plugin._endSpan(span, error, () => {});
                }
              }
            ) as Promise<{}> | undefined;

            return plugin._handlePromiseResult(span, maybePromise);
          }
        });
      };
    } else {
      // Node.js 24+: Only Promise-based handlers (callbacks deprecated)
      return function patchedHandler(
        this: never,
        // The event can be a user type, it truly is any.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: any,
        context: Context
      ) {
        _onRequest();

        const parent = plugin._determineParent(event, context);

        const span = plugin._createSpanForRequest(
          event,
          context,
          requestIsColdStart,
          parent
        );

        plugin._applyRequestHook(span, event, context);

        return otelContext.with(trace.setSpan(parent, span), () => {
          // Promise-based handler only (Node.js 24+)
          const maybePromise = safeExecuteInTheMiddle(
            () =>
              (
                original as (event: any, context: Context) => Promise<any> | any
              ).apply(this, [event, context]),
            error => {
              if (error != null) {
                // Exception thrown synchronously before resolving promise.
                plugin._applyResponseHook(span, error);
                plugin._endSpan(span, error, () => {});
              }
            }
          ) as Promise<{}> | undefined;

          return plugin._handlePromiseResult(span, maybePromise);
        });
      };
    }
  }

  private _createSpanForRequest(
    event: any,
    context: Context,
    requestIsColdStart: boolean,
    parent: OtelContext
  ): Span {
    const name = context.functionName;
    return this.tracer.startSpan(
      name,
      {
        kind: SpanKind.SERVER,
        attributes: {
          [ATTR_FAAS_EXECUTION]: context.awsRequestId,
          [ATTR_FAAS_ID]: context.invokedFunctionArn,
          [ATTR_CLOUD_ACCOUNT_ID]: AwsLambdaInstrumentation._extractAccountId(
            context.invokedFunctionArn
          ),
          [ATTR_FAAS_COLDSTART]: requestIsColdStart,
          ...AwsLambdaInstrumentation._extractOtherEventFields(event),
        },
      },
      parent
    );
  }

  private _applyRequestHook(span: Span, event: any, context: Context): void {
    const { requestHook } = this.getConfig();
    if (requestHook) {
      safeExecuteInTheMiddle(
        () => requestHook(span, { event, context }),
        e => {
          if (e) diag.error('aws-lambda instrumentation: requestHook error', e);
        },
        true
      );
    }
  }

  private _handlePromiseResult(
    span: Span,
    maybePromise: Promise<{}> | undefined
  ): Promise<{}> | undefined {
    if (typeof maybePromise?.then === 'function') {
      return maybePromise.then(
        value => {
          this._applyResponseHook(span, null, value);
          return new Promise(resolve =>
            this._endSpan(span, undefined, () => resolve(value))
          );
        },
        (err: Error | string) => {
          this._applyResponseHook(span, err);
          return new Promise((resolve, reject) =>
            this._endSpan(span, err, () => reject(err))
          );
        }
      );
    }

    // Handle synchronous return values by ending the span and applying response hook
    this._applyResponseHook(span, null, maybePromise);
    this._endSpan(span, undefined, () => {});
    return maybePromise;
  }

  private _determineParent(event: any, context: Context): OtelContext {
    const config = this.getConfig();
    return AwsLambdaInstrumentation._determineParent(
      event,
      context,
      config.eventContextExtractor ||
        AwsLambdaInstrumentation._defaultEventContextExtractor
    );
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

  override setTracerProvider(tracerProvider: TracerProvider) {
    super.setTracerProvider(tracerProvider);
    this._traceForceFlusher = this._traceForceFlush(tracerProvider);
  }

  private _traceForceFlush(tracerProvider: TracerProvider) {
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

  override setMeterProvider(meterProvider: MeterProvider) {
    super.setMeterProvider(meterProvider);
    this._metricForceFlusher = this._metricForceFlush(meterProvider);
  }

  private _metricForceFlush(meterProvider: MeterProvider) {
    if (!meterProvider) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentProvider: any = meterProvider;

    if (typeof currentProvider.forceFlush === 'function') {
      return currentProvider.forceFlush.bind(currentProvider);
    }

    return undefined;
  }

  private _wrapCallback(original: Callback, span: Span): Callback {
    const plugin = this;
    return function wrappedCallback(this: never, err, res) {
      plugin._diag.debug('executing wrapped callback function');
      plugin._applyResponseHook(span, err, res);

      plugin._endSpan(span, err, () => {
        plugin._diag.debug('executing original callback function');
        return original.apply(this, [err, res]);
      });
    };
  }

  private _endSpan(
    span: Span,
    err: string | Error | null | undefined,
    callback: () => void
  ) {
    if (err) {
      span.recordException(err);
    }

    let errMessage;
    if (typeof err === 'string') {
      errMessage = err;
    } else if (err) {
      errMessage = err.message;
    }
    if (errMessage) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errMessage,
      });
    }

    span.end();

    const flushers = [];
    if (this._traceForceFlusher) {
      flushers.push(this._traceForceFlusher());
    } else {
      diag.debug(
        'Spans may not be exported for the lambda function because we are not force flushing before handler completion.'
      );
    }
    if (this._metricForceFlusher) {
      flushers.push(this._metricForceFlusher());
    } else {
      diag.debug(
        'Metrics may not be exported for the lambda function because we are not force flushing before handler completion.'
      );
    }

    Promise.all(flushers).then(callback, callback);
  }

  private _applyResponseHook(
    span: Span,
    err?: Error | string | null,
    res?: any
  ) {
    const { responseHook } = this.getConfig();
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
    return propagation.extract(otelContext.active(), httpHeaders, headerGetter);
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

  private static _determineParent(
    event: any,
    context: Context,
    eventContextExtractor: EventContextExtractor
  ): OtelContext {
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
    if (trace.getSpan(extractedContext)?.spanContext()) {
      return extractedContext;
    }
    return ROOT_CONTEXT;
  }
}
