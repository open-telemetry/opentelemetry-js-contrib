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
  Span,
  SpanKind,
  SpanStatusCode,
  TextMapGetter,
  TraceFlags,
  TracerProvider,
  ROOT_CONTEXT,
  Attributes,
} from '@opentelemetry/api';
import {
  AWSXRAY_TRACE_ID_HEADER,
  AWSXRayPropagator,
} from '@opentelemetry/propagator-aws-xray';
import {
  SemanticAttributes,
  SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';

import {
  APIGatewayProxyEventHeaders,
  Callback,
  Context,
  Handler,
} from 'aws-lambda';

import { AwsLambdaInstrumentationConfig, EventContextExtractor } from './types';
import { VERSION } from './version';
import {
  ApiGatewayEvent,
  ApiGatewayRequestContext,
  LambdaModule,
  TriggerOrigin,
} from './internal-types';
import { strict } from 'assert';

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

type GatewayResult = Partial<{
  statusCode: number;
  headers: Record<string, string>;
}>;

export class AwsLambdaInstrumentation extends InstrumentationBase {
  private _forceFlush?: () => Promise<void>;
  private triggerOrigin: TriggerOrigin | undefined;
  constructor(protected override _config: AwsLambdaInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-aws-lambda', VERSION, _config);
  }

  override setConfig(config: AwsLambdaInstrumentationConfig = {}) {
    this._config = config;
  }

  init() {
    const taskRoot = process.env.LAMBDA_TASK_ROOT;
    const handlerDef = process.env._HANDLER;

    // _HANDLER and LAMBDA_TASK_ROOT are always defined in Lambda but guard bail out if in the future this changes.
    if (!taskRoot || !handlerDef) {
      return [];
    }

    const handler = path.basename(handlerDef);
    const moduleRoot = handlerDef.substr(0, handlerDef.length - handler.length);

    const [module, functionName] = handler.split('.', 2);

    // Lambda loads user function using an absolute path.
    let filename = path.resolve(taskRoot, moduleRoot, module);
    if (!filename.endsWith('.js')) {
      // Patching infrastructure currently requires a filename when requiring with an absolute path.
      filename += '.js';
    }

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
              diag.debug('Applying patch for lambda handler');
              if (isWrapped(moduleExports[functionName])) {
                this._unwrap(moduleExports, functionName);
              }
              this._wrap(moduleExports, functionName, this._getHandler());
              return moduleExports;
            },
            (moduleExports?: LambdaModule) => {
              if (moduleExports == undefined) return;
              diag.debug('Removing patch for lambda handler');
              this._unwrap(moduleExports, functionName);
            }
          ),
        ]
      ),
    ];
  }

  private _getHandler() {
    return (original: Handler) => {
      return this._getPatchHandler(original);
    };
  }

  private _getPatchHandler(original: Handler) {
    diag.debug('patch handler function');
    const plugin = this;

    return function patchedHandler(
      this: never,
      // The event can be a user type, it truly is any.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: any,
      context: Context,
      callback: Callback
    ) {
      const config = plugin._config;
      const parent = AwsLambdaInstrumentation._determineParent(
        event,
        context,
        config.disableAwsContextPropagation === true,
        config.eventContextExtractor ||
          AwsLambdaInstrumentation._defaultEventContextExtractor
      );

      const name = context.functionName;

      let wrapperSpan: Span | undefined;

      if (plugin._config.detectApiGateway?.enable && event.requestContext) {
        plugin.triggerOrigin = TriggerOrigin.API_GATEWAY;
        wrapperSpan = plugin._getApiGatewaySpan(event, parent);
      }

      const inner = (otelContextInstance: OtelContext) => {
        const lambdaSpan = plugin.tracer.startSpan(
          name,
          {
            kind: SpanKind.SERVER,
            attributes: {
              [SemanticAttributes.FAAS_EXECUTION]: context.awsRequestId,
              [SemanticResourceAttributes.FAAS_ID]: context.invokedFunctionArn,
              [SemanticResourceAttributes.CLOUD_ACCOUNT_ID]:
                AwsLambdaInstrumentation._extractAccountId(
                  context.invokedFunctionArn
                ),
            },
          },
          otelContextInstance
        );

        if (config.requestHook) {
          safeExecuteInTheMiddle(
            () => config.requestHook!(lambdaSpan, { event, context }),
            (e) => {
              if (e)
                diag.error('aws-lambda instrumentation: requestHook error', e);
            },
            true
          );
        }

        return otelContext.with(
          trace.setSpan(otelContextInstance, lambdaSpan),
          () => {
            // Lambda seems to pass a callback even if handler is of Promise form, so we wrap all the time before calling
            // the handler and see if the result is a Promise or not. In such a case, the callback is usually ignored. If
            // the handler happened to both call the callback and complete a returned Promise, whichever happens first will
            // win and the latter will be ignored.
            const wrappedCallback = plugin._wrapCallback(
              callback,
              lambdaSpan,
              wrapperSpan
            );

            const maybePromise = safeExecuteInTheMiddle(
              () => original.apply(this, [event, context, wrappedCallback]),
              (error) => {
                if (error != null) {
                  // Exception thrown synchronously before resolving callback / promise.
                  // Callback may or may not have been called, we can't know for sure, but it doesn't matter, both will end the current span
                  plugin._applyResponseHook(lambdaSpan, error);
                  plugin._endSpan(lambdaSpan, error);
                }
              }
            ) as Promise<{}> | undefined;
            if (typeof maybePromise?.then === 'function') {
              return maybePromise.then(
                (value) => {
                  plugin._applyResponseHook(lambdaSpan, null, value);
                  plugin._endSpan(lambdaSpan, undefined);
                  return value;
                },
                (err: Error | string) => {
                  plugin._applyResponseHook(lambdaSpan, err);

                  plugin._endSpan(lambdaSpan, err);
                  throw err;
                }
              );
            }
            return maybePromise;
          }
        );
      };

      let handlerReturn: Promise<any> | undefined;
      if (!wrapperSpan) {
        // No wrapper span
        try {
          handlerReturn = inner(parent);
        } catch (e) {
          // Catching a lambda that synchronously failed

          plugin._flush();
          throw e;
        }
      } else {
        const subCtx = trace.setSpan(parent, wrapperSpan);
        handlerReturn = otelContext.with(subCtx, () => {
          return safeExecuteInTheMiddle(
            () => {
              const innerResult = inner(subCtx); // This call never fails, because it either returns a promise, or was called with safeExecuteInTheMiddle
              // The handler was an async, it returned a promise.
              if (typeof innerResult?.then === 'function') {
                return innerResult.then(
                  (value) => {
                    strict(wrapperSpan);

                    plugin._endWrapperSpan(
                      wrapperSpan,
                      value as GatewayResult | any,
                      undefined
                    );

                    return value;
                  },
                  async (error) => {
                    strict(wrapperSpan);
                    await plugin._endWrapperSpan(wrapperSpan, undefined, error);
                    throw error; // We don't want the instrumentation to hide the error from AWS
                  }
                );
              } else {
                // The lambda was synchronous, or it as synchronously thrown an error
                strict(wrapperSpan);

                //if (hasLambdaSynchronouslyThrown) {
                plugin._endWrapperSpan(wrapperSpan, innerResult, undefined);
                // }
                // Fallthrough: sync reply, but callback may be in use. No way to query the event loop !
              }

              return innerResult;
            },
            (error) => {
              if (error) {
                strict(wrapperSpan);
                plugin._endWrapperSpan(wrapperSpan, undefined, error);
                plugin._flush();
              }
            }
          );
        });
      }

      // Second case, lambda was asynchronous, in which case
      if (typeof handlerReturn?.then === 'function') {
        return handlerReturn.then(
          async (success) => {
            await plugin._flush();
            return success;
          },
          async (error) => {
            await plugin._flush();
            throw error;
          }
        );
      }

      // Third case, the lambda is purely synchronous, without event loop, nor callback() being called
      // Pitfall, no flushing !
      // We can't know for sure if the event loop is empty or not, so we can't know if we should flush or not.
      return handlerReturn;
    };
  }

  private _getApiGatewaySpan(event: ApiGatewayEvent, parent: OtelContext) {
    const requestContext = event.requestContext as ApiGatewayRequestContext;

    let attributes: Attributes = {
      [SemanticAttributes.HTTP_METHOD]: requestContext.httpMethod,
      [SemanticAttributes.HTTP_ROUTE]: requestContext.resourcePath,
      [SemanticAttributes.HTTP_URL]:
        requestContext.domainName + requestContext.path,
      [SemanticAttributes.HTTP_SERVER_NAME]: requestContext.domainName,
      [SemanticResourceAttributes.CLOUD_ACCOUNT_ID]: requestContext.accountId,
    };

    if (requestContext.identity?.sourceIp) {
      attributes[SemanticAttributes.NET_PEER_IP] =
        requestContext.identity.sourceIp;
    }

    if (event.multiValueQueryStringParameters) {
      Object.assign(
        attributes,
        Object.fromEntries(
          Object.entries(event.multiValueQueryStringParameters).map(
            ([k, v]) => [`http.request.query.${k}`, v.length == 1 ? v[0] : v] // We don't have a semantic attribute for query parameters, but would be useful nonetheless
          )
        )
      );
    }

    if (event.multiValueHeaders) {
      Object.assign(
        attributes,
        Object.fromEntries(
          Object.entries(event.multiValueHeaders).map(([k, v]) => [
            // See https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/http/#http-request-and-response-headers
            `http.request.header.${k}`,
            v.length == 1 ? v[0] : v,
          ])
        )
      );
    }
    if (event.pathParameters) {
      Object.assign(
        attributes,
        Object.fromEntries(
          Object.entries(event.pathParameters).map(([k, v]) => [
            `http.request.parameters.${k}`,
            v,
          ])
        )
      );
    }

    return this.tracer.startSpan(
      requestContext.domainName + requestContext.path,
      {
        kind: SpanKind.SERVER,
        attributes: attributes,
      },
      parent
    );
  }

  override setTracerProvider(tracerProvider: TracerProvider) {
    super.setTracerProvider(tracerProvider);
    this._forceFlush = this._getForceFlush(tracerProvider);
  }

  private async _endWrapperSpan(
    span: Span,
    returnFromLambda: GatewayResult | any,
    errorFromLambda: string | Error | null | undefined
  ) {
    if (this.triggerOrigin == TriggerOrigin.API_GATEWAY) {
      this._endAPIGatewaySpan(span, returnFromLambda, errorFromLambda);
    }
    span.end();
  }

  private _endAPIGatewaySpan(
    span: Span,
    returnFromLambda: GatewayResult | any,
    errorFromLambda: string | Error | null | undefined
  ) {
    if (errorFromLambda) {
      span.recordException(errorFromLambda);

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: this._errorToString(errorFromLambda),
      });

      span.end();
      return;
    }
    if (!(typeof returnFromLambda == 'object')) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'Lambda return value malformed',
      });
      span.end();
      return;
    }

    span.setAttribute(
      SemanticAttributes.HTTP_STATUS_CODE,
      returnFromLambda.statusCode
    );
    const statusCode = returnFromLambda.statusCode;

    if (this._config.detectApiGateway?.errorCodes) {
      const fail = this._config.detectApiGateway.errorCodes.reduce(
        (fail, ec) => {
          if (fail || ec === statusCode) {
            return true;
          }

          if (ec instanceof RegExp && ec.test(String(statusCode))) {
            return true;
          }
          return fail;
        },
        false
      );

     

      if (fail) {
        return span.setStatus({
          code: SpanStatusCode.ERROR,
          message:
            'Return to API Gateway with error ' + returnFromLambda.statusCode,
        });
      } else {
        return span.setStatus({
          code: SpanStatusCode.OK,
        });
      }
    }

    return span.setStatus({
      code: SpanStatusCode.UNSET,
    });
  }

  private _getForceFlush(tracerProvider: TracerProvider) {
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

  private _wrapCallback(
    originalAWSLambdaCallback: Callback,
    span: Span,
    wrapperSpan?: Span
  ): Callback {
    const plugin = this;
    return (err, res) => {
      diag.debug('executing wrapped lookup callback function');
      plugin._applyResponseHook(span, err, res);

      plugin._endSpan(span, err);
      if (wrapperSpan) {
        plugin._endWrapperSpan(wrapperSpan, res, err);
      }

      this._flush().then(() => {
        diag.debug('executing original lookup callback function');
        originalAWSLambdaCallback.apply(this, [err, res]); // End of the function
      });
    };
  }

  private async _flush() {
    if (this._forceFlush) {
      try {
        await this._forceFlush();
      } catch (e) {
        // We must not fail this call, but we may log it
        diag.error('Error while flushing the lambda', e);
      }
    } else {
      diag.error(
        'Spans may not be exported for the lambda function because we are not force flushing before callback.'
      );
    }
  }

  private _endSpan(span: Span, err: string | Error | null | undefined) {
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
  }

  private _errorToString(err: string | Error | null | undefined) {
    let errMessage;
    if (typeof err === 'string') {
      errMessage = err;
    } else if (err) {
      errMessage = err.message;
    }
    return errMessage;
  }

  private _applyResponseHook(
    span: Span,
    err?: Error | string | null,
    res?: any
  ) {
    if (this._config?.responseHook) {
      safeExecuteInTheMiddle(
        () => this._config.responseHook!(span, { err, res }),
        (e) => {
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

  private static _determineParent(
    event: any,
    context: Context,
    disableAwsContextPropagation: boolean,
    eventContextExtractor: EventContextExtractor
  ): OtelContext {
    let parent: OtelContext | undefined = undefined;
    if (!disableAwsContextPropagation) {
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
    const extractedContext = safeExecuteInTheMiddle(
      () => eventContextExtractor(event, context),
      (e) => {
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
    if (!parent) {
      // No context in Lambda environment or HTTP headers.
      return ROOT_CONTEXT;
    }
    return parent;
  }
}
