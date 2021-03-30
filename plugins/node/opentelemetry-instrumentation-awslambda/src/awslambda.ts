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

import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { VERSION } from './version';
import { Callback, Context, Handler } from 'aws-lambda';
import { diag, Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { FaasAttribute } from '@opentelemetry/semantic-conventions';
import { LambdaModule } from './types';

export class AwsLambdaInstrumentation extends InstrumentationBase {
  constructor() {
    super('@opentelemetry/instrumentation-awslambda', VERSION);
  }

  init() {
    // _HANDLER is always defined in Lambda.
    const handler = process.env._HANDLER!;
    const dotIndex = handler.lastIndexOf('.');
    const module = handler.substring(0, dotIndex);
    const functionName = handler.substring(dotIndex + 1);

    return [
      new InstrumentationNodeModuleDefinition(
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
        (moduleExports: LambdaModule) => {
          if (moduleExports == undefined) return;
          diag.debug('Removing patch for lambdatest handler');
          this._unwrap(moduleExports, functionName);
        }
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

      if (typeof callback === 'function') {
        // Callback form
        const wrapped = plugin._wrapCallback(callback, span);
        return safeExecuteInTheMiddle(
          () => original.apply(this, [event, context, wrapped]),
          error => {
            if (error != null) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: typeof error === 'string' ? error : error.message,
              });
              span.end();
            }
          }
        );
      } else {
        const promise = safeExecuteInTheMiddle(
          () => original.apply(this, [event, context, callback]),
          error => {
            if (error != null) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: typeof error === 'string' ? error : error.message,
              });
              span.end();
            }
          }
        ) as Promise<{}>;
        promise.then(
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
        return promise;
      }
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
