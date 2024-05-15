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

import type * as AzureFunctions from '@azure/functions';
import type { Disposable } from '@azure/functions';
import { context as otelContext, propagation } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import { VERSION } from './version';

export class AzureFunctionsInstrumentation extends InstrumentationBase {
  private _funcDisposable: Disposable | undefined;

  constructor(config: InstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-azure-functions', VERSION, config);
  }

  protected init() {
    return new InstrumentationNodeModuleDefinition(
      '@azure/functions',
      ['^4.0.0'],
      (moduleExports: typeof AzureFunctions) => this._patch(moduleExports),
      () => this._unPatch()
    );
  }

  private _patch(func: typeof AzureFunctions): typeof AzureFunctions {
    this._funcDisposable = func.app.hook.preInvocation(context => {
      const traceContext = context.invocationContext.traceContext;
      if (traceContext) {
        context.functionHandler = otelContext.bind(
          propagation.extract(otelContext.active(), {
            traceparent: traceContext.traceParent,
            tracestate: traceContext.traceState,
          }),
          context.functionHandler
        );
      }
    });

    return func;
  }

  private _unPatch(): void {
    this._funcDisposable?.dispose();
  }
}
