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
import { diag, Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { FaasAttribute } from '@opentelemetry/semantic-conventions';

import { Callback, Context, Handler } from 'aws-lambda';

import { LambdaModule } from './types';
import { VERSION } from './version';

export class AwsLambdaInstrumentation extends InstrumentationBase {
  constructor() {
    super('@opentelemetry/instrumentation-awslambda', VERSION);
  }

  init() {
    // _HANDLER and LAMBDA_TASK_ROOT are always defined in Lambda.
    const taskRoot = process.env.LAMBDA_TASK_ROOT!;
    const handlerDef = process.env._HANDLER!;

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
              diag.debug('Applying patch for lambdatest handler');
              if (isWrapped(moduleExports[functionName])) {
                this._unwrap(moduleExports, functionName);
              }
              this._wrap(moduleExports, functionName, this._getHandler());
              return moduleExports;
            },
            (moduleExports?: LambdaModule) => {
              if (moduleExports == undefined) return;
              diag.debug('Removing patch for lambdatest handler');
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
      this: {},
      event: {},
      context: Context,
      callback: Callback
    ) {
      const name = context.functionName;
      const span = plugin.tracer.startSpan(name, {
        kind: SpanKind.SERVER,
        attributes: {
          [FaasAttribute.FAAS_EXECUTION]: context.awsRequestId,
          [FaasAttribute.FAAS_ID]: context.invokedFunctionArn,
          // TODO(anuraaga): Add cloud.account.id when there is a JS accessor for it.
        },
      });

      // Lambda seems to pass a callback even if handler is of Promise form, so we wrap all the time before calling
      // the handler and see if the result is a Promise or not. In such a case, the callback is usually ignored.
      const wrappedCallback = plugin._wrapCallback(callback, span);
      const maybePromise = safeExecuteInTheMiddle(
        () => original.apply(this, [event, context, wrappedCallback]),
        error => {
          if (error != null) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: typeof error === 'string' ? error : error.message,
            });
            span.end();
          }
        }
      ) as Promise<{}> | undefined;
      if (
        typeof maybePromise !== 'undefined' &&
        typeof maybePromise.then === 'function'
      ) {
        maybePromise.then(
          () => span.end(),
          (err: Error | string) => {
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
          }
        );
      }
      return maybePromise;
    };
  }

  private _wrapCallback(original: Callback, span: Span): Callback {
    return function wrappedCallback(this: {}, err, res) {
      diag.debug('executing wrapped lookup callback function');

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
      diag.debug('executing original lookup callback function');
      return original.apply(this, [err, res]);
    };
  }
}
