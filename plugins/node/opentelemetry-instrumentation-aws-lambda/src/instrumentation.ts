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

import { env } from 'process';

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
  TraceFlags,
  TracerProvider,
  ROOT_CONTEXT,
} from '@opentelemetry/api';
import {
  AWSXRAY_TRACE_ID_HEADER,
  AWSXRayPropagator,
} from '@opentelemetry/propagator-aws-xray';
import {
  SEMATTRS_FAAS_EXECUTION,
  SEMRESATTRS_CLOUD_ACCOUNT_ID,
  SEMRESATTRS_FAAS_ID,
} from '@opentelemetry/semantic-conventions';

import {
  APIGatewayProxyEventHeaders,
  Callback,
  Context,
  Handler,
} from 'aws-lambda';

import { AwsLambdaInstrumentationConfig, EventContextExtractor } from './types';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import {
  isInvalidHandler,
  moduleRootAndHandler,
  resolveHandler,
  splitHandlerString,
  tryPath,
} from './user-function';

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
  private _traceForceFlusher?: () => Promise<void>;
  private _metricForceFlusher?: () => Promise<void>;

  protected override _config!: AwsLambdaInstrumentationConfig;

  constructor(config: AwsLambdaInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    if (this._config.disableAwsContextPropagation == null) {
      if (
        typeof env['OTEL_LAMBDA_DISABLE_AWS_CONTEXT_PROPAGATION'] ===
          'string' &&
        env[
          'OTEL_LAMBDA_DISABLE_AWS_CONTEXT_PROPAGATION'
        ].toLocaleLowerCase() === 'true'
      ) {
        this._config.disableAwsContextPropagation = true;
      }
    }
    this._traceForceFlusher = this._traceForceFlush(trace.getTracerProvider());
  }

  override setConfig(config: AwsLambdaInstrumentationConfig = {}) {
    this._config = config;
  }

  init() {
    const taskRoot = process.env.LAMBDA_TASK_ROOT;
    const handlerDef = this._config.lambdaHandler ?? process.env._HANDLER;

    // _HANDLER and LAMBDA_TASK_ROOT are always defined in Lambda but guard bail out if in the future this changes.
    if (!taskRoot || !handlerDef) {
      this._diag.debug(
        'Skipping lambda instrumentation: no _HANDLER/lambdaHandler or LAMBDA_TASK_ROOT.',
        { taskRoot, handlerDef }
      );
      return [];
    }
    if (isInvalidHandler(handlerDef)) {
      this._diag.debug(
        'Skipping lambda instrumentation: _HANDLER/lambdaHandler is invalid.',
        { taskRoot, handlerDef }
      );
      return [];
    }

    const [moduleRoot, moduleAndHandler] = moduleRootAndHandler(handlerDef);
    const [module, handlerPath] = splitHandlerString(moduleAndHandler);

    if (!module || !handlerPath) {
      this._diag.debug(
        'Skipping lambda instrumentation: _HANDLER/lambdaHandler is invalid.',
        { taskRoot, handlerDef, moduleRoot, module, handlerPath }
      );
      return [];
    }

    const filename = tryPath(taskRoot, moduleRoot, module);
    if (!filename) {
      this._diag.debug(
        'Skipping lambda instrumentation: _HANDLER/lambdaHandler and LAMBDA_TASK_ROOT did not resolve to a file.',
        {
          taskRoot,
          handlerDef,
          moduleRoot,
          module,
          handlerPath,
        }
      );
      return [];
    }

    diag.debug('Instrumenting lambda handler', {
      taskRoot,
      handlerDef,
      filename,
      moduleRoot,
      module,
      handlerPath,
    });

    const patch = (moduleExports: object) => {
      const [container, functionName] = resolveHandler(
        moduleExports,
        handlerPath
      );
      if (
        container == null ||
        functionName == null ||
        typeof container[functionName] !== 'function'
      ) {
        this._diag.debug(
          'Skipping lambda instrumentation: _HANDLER/lambdaHandler did not resolve to a function.',
          {
            taskRoot,
            handlerDef,
            filename,
            moduleRoot,
            module,
            handlerPath,
          }
        );
        return moduleExports;
      }

      if (isWrapped(container[functionName])) {
        this._unwrap(container, functionName);
      }
      this._wrap(container, functionName, this._getHandler());
      return moduleExports;
    };
    const unpatch = (moduleExports?: object) => {
      if (moduleExports == null) return;
      const [container, functionName] = resolveHandler(
        moduleExports,
        handlerPath
      );
      if (
        container == null ||
        functionName == null ||
        typeof container[functionName] !== 'function'
      ) {
        return;
      }

      this._unwrap(container, functionName);
    };

    return [
      new InstrumentationNodeModuleDefinition(
        // The patching infrastructure properly supports absolute paths when registering hooks but not when
        // actually matching against filenames when patching, so we need to provide a file instrumentation
        // that will actually match by using a relative path.
        filename,
        ['*'],
        patch,
        unpatch,
        [new InstrumentationNodeModuleFile(module, ['*'], patch, unpatch)]
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
            [SEMATTRS_FAAS_EXECUTION]: context.awsRequestId,
            [SEMRESATTRS_FAAS_ID]: context.invokedFunctionArn,
            [SEMRESATTRS_CLOUD_ACCOUNT_ID]:
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
          e => {
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
        if (typeof maybePromise?.then === 'function') {
          return maybePromise.then(
            value => {
              plugin._applyResponseHook(span, null, value);
              return new Promise(resolve =>
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

    const flushers = [];
    if (this._traceForceFlusher) {
      flushers.push(this._traceForceFlusher());
    } else {
      diag.error(
        'Spans may not be exported for the lambda function because we are not force flushing before callback.'
      );
    }
    if (this._metricForceFlusher) {
      flushers.push(this._metricForceFlusher());
    } else {
      diag.error(
        'Metrics may not be exported for the lambda function because we are not force flushing before callback.'
      );
    }

    Promise.all(flushers).then(callback, callback);
  }

  private _applyResponseHook(
    span: Span,
    err?: Error | string | null,
    res?: any
  ) {
    if (this._config?.responseHook) {
      safeExecuteInTheMiddle(
        () => this._config.responseHook!(span, { err, res }),
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
    if (!parent) {
      // No context in Lambda environment or HTTP headers.
      return ROOT_CONTEXT;
    }
    return parent;
  }
}
