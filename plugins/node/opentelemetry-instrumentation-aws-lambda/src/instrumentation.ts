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
} from '@opentelemetry/api';
import {
  AWSXRAY_TRACE_ID_HEADER,
  AWSXRayPropagator,
} from '@opentelemetry/propagator-aws-xray';
import {
  MessagingDestinationKindValues,
  MessagingOperationValues,
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
import { LambdaModule } from './internal-types';
import { pubsubPropagation } from '@opentelemetry/propagation-utils';
import { SQS } from 'aws-sdk';

type LowerCase<T> = T extends {}
  ? {
      [K in keyof T as K extends string
        ? string extends K
          ? string
          : `${Uncapitalize<string & K>}`
        : K]: T[K] extends {} | undefined ? LowerCase<T[K]> : T[K];
    }
  : T; //[ keyof T ]

type V = LowerCase<SQS.Message>;
declare const a: V;

class ContextGetter
  implements TextMapGetter<LowerCase<SQS.MessageBodyAttributeMap>>
{
  keys(carrier: LowerCase<SQS.MessageBodyAttributeMap>): string[] {
    return Object.keys(carrier);
  }

  get(carrier: any, key: string): undefined | string | string[] {
    if (typeof carrier?.[key] == 'object') {
      return carrier?.[key]?.stringValue || carrier?.[key]?.value;
    } else {
      return carrier?.[key];
    }
  }
}

const extractPropagationContext = (
  message: LowerCase<SQS.Message>,
  sqsExtractContextPropagationFromPayload: boolean | undefined
): any => {
  const propagationFields = propagation.fields();

  if (
    message.attributes &&
    Object.keys(message.attributes).some((attr) =>
      propagationFields.includes(attr)
    )
  ) {
    return message.attributes;
  } else if (
    message.messageAttributes &&
    Object.keys(message.messageAttributes).some((attr) =>
      propagationFields.includes(attr)
    )
  ) {
    return message.messageAttributes;
  } else if (sqsExtractContextPropagationFromPayload && message.body) {
    try {
      const payload = JSON.parse(message.body);
      return payload.messageAttributes;
    } catch {
      diag.debug(
        'failed to parse SQS payload to extract context propagation, trace might be incomplete.'
      );
    }
  }
  return undefined;
};

export const contextGetter = new ContextGetter();

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

export class AwsLambdaInstrumentation extends InstrumentationBase {
  private _forceFlush?: () => Promise<void>;

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
      const span = plugin.tracer.startSpan(
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
        parent
      );

      if (config.requestHook) {
        safeExecuteInTheMiddle(
          () => config.requestHook!(span, { event, context }),
          (e) => {
            if (e)
              diag.error('aws-lambda instrumentation: requestHook error', e);
          },
          true
        );
      }

      return otelContext.with(trace.setSpan(parent, span), () => {
        // Lambda seems to pass a callback even if handler is of Promise form, so we wrap all the time before calling
        // the handler and see if the result is a Promise or not. In such a case, the callback is usually ignored. If
        // the handler happened to both call the callback and complete a returned Promise, whichever happens first will
        // win and the latter will be ignored.

        /**
         * If there is a "Records" entry in the event that is of Array type, we might assume we are receiving a list of records coming from a queue, like SQS.
         * We will patch those items following the aws-sdk implementation
         */

        if ('Records' in event) {
          pubsubPropagation.patchMessagesArrayToStartProcessSpans<
            LowerCase<SQS.Message> /* | SNS.Message */
          >({
            messages: event.Records as Array<LowerCase<SQS.Message>>,
            parentContext: trace.setSpan(otelContext.active(), span),
            tracer: plugin.tracer,
            messageToSpanDetails: (message: LowerCase<SQS.Message>) => {
              console.log(
                propagation.extract(
                  ROOT_CONTEXT,
                  extractPropagationContext(message, false),
                  contextGetter
                )
              );

              return {
                name: 'SQS',
                parentContext: propagation.extract(
                  ROOT_CONTEXT,
                  extractPropagationContext(message, false),
                  contextGetter
                ),
                attributes: {
                  [SemanticAttributes.MESSAGING_SYSTEM]: 'aws.sqs',
                  [SemanticAttributes.MESSAGING_DESTINATION_KIND]:
                    MessagingDestinationKindValues.QUEUE,
                  [SemanticAttributes.MESSAGING_MESSAGE_ID]: message.messageId,
                  [SemanticAttributes.MESSAGING_OPERATION]:
                    MessagingOperationValues.PROCESS,
                },
              };
            },
          });

          pubsubPropagation.patchArrayForProcessSpans(
            event.Records,
            plugin.tracer,
            otelContext.active()
          );
        }

        const wrappedCallback = plugin._wrapCallback(callback, span);
        const maybePromise = safeExecuteInTheMiddle(
          () => original.apply(this, [event, context, wrappedCallback]),
          (error) => {
            if (error != null) {
              // Exception thrown synchronously before resolving callback / promise.
              plugin._applyResponseHook(span, error);
              plugin._endSpan(span, error, () => {});
            }
          }
        ) as Promise<{}> | undefined;
        if (typeof maybePromise?.then === 'function') {
          return maybePromise.then(
            (value) => {
              plugin._applyResponseHook(span, null, value);
              return new Promise((resolve) =>
                plugin._endSpan(span, undefined, () => resolve(value))
              );
            },
            (err: Error | string) => {
              plugin._applyResponseHook(span, err);
              return new Promise((resolve, reject) =>
                plugin._endSpan(span, err, () => reject(err))
              );
            }
          );
        }
        return maybePromise;
      });
    };
  }

  override setTracerProvider(tracerProvider: TracerProvider) {
    super.setTracerProvider(tracerProvider);
    this._forceFlush = this._getForceFlush(tracerProvider);
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

  private _wrapCallback(original: Callback, span: Span): Callback {
    const plugin = this;
    return function wrappedCallback(this: never, err, res) {
      diag.debug('executing wrapped lookup callback function');
      plugin._applyResponseHook(span, err, res);

      plugin._endSpan(span, err, () => {
        diag.debug('executing original lookup callback function');
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

    if (this._forceFlush) {
      this._forceFlush().then(
        () => callback(),
        () => callback()
      );
    } else {
      diag.error(
        'Spans may not be exported for the lambda function because we are not force flushing before callback.'
      );
      callback();
    }
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
