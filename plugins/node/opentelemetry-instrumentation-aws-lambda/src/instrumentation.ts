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
  context as otelcontext,
  diag,
  setSpan,
  Span,
  SpanKind,
  SpanStatusCode,
  TracerProvider,
} from '@opentelemetry/api';
import {
  SemanticAttributes,
  ResourceAttributes,
} from '@opentelemetry/semantic-conventions';

import { Callback, Context, Handler } from 'aws-lambda';

import { LambdaModule } from './types';
import { VERSION } from './version';
import { BasicTracerProvider } from '@opentelemetry/tracing';

export class AwsLambdaInstrumentation extends InstrumentationBase {
  private _tracerProvider: TracerProvider | undefined;

  constructor() {
    super('@opentelemetry/instrumentation-aws-lambda', VERSION);
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
      event: {},
      context: Context,
      callback: Callback
    ) {
      const name = context.functionName;
      const span = plugin.tracer.startSpan(name, {
        kind: SpanKind.SERVER,
        attributes: {
          [SemanticAttributes.FAAS_EXECUTION]: context.awsRequestId,
          [ResourceAttributes.FAAS_ID]: context.invokedFunctionArn,
          [ResourceAttributes.CLOUD_ACCOUNT_ID]:
            AwsLambdaInstrumentation._extractAccountId(
              context.invokedFunctionArn
            ),
        },
      });

      return otelcontext.with(setSpan(otelcontext.active(), span), () => {
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
              plugin._endSpan(span, error, () => {});
            }
          }
        ) as Promise<{}> | undefined;
        if (typeof maybePromise?.then === 'function') {
          return maybePromise.then(
            value =>
              new Promise(resolve =>
                plugin._endSpan(span, undefined, () => resolve(value))
              ),
            (err: Error | string) =>
              new Promise((resolve, reject) =>
                plugin._endSpan(span, err, () => reject(err))
              )
          );
        }
        return maybePromise;
      });
    };
  }

  setTracerProvider(tracerProvider: TracerProvider) {
    super.setTracerProvider(tracerProvider);
    this._tracerProvider = tracerProvider;
  }

  private _wrapCallback(original: Callback, span: Span): Callback {
    const plugin = this;
    return function wrappedCallback(this: never, err, res) {
      diag.debug('executing wrapped lookup callback function');

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
    if (this._tracerProvider instanceof BasicTracerProvider) {
      this._tracerProvider
        .getActiveSpanProcessor()
        .forceFlush()
        .then(
          () => callback(),
          () => callback()
        );
    } else {
      callback();
    }
  }

  private static _extractAccountId(arn: string): string | undefined {
    const parts = arn.split(':');
    if (parts.length >= 5) {
      return parts[4];
    }
    return undefined;
  }
}
