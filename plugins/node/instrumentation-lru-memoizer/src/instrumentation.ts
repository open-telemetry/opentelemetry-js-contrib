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

import { context } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
import { VERSION } from './version';

export default class LruMemoizerInstrumentation extends InstrumentationBase {
  constructor(config?: InstrumentationConfig) {
    super('@opentelemetry/instrumentation-lru-memoizer', VERSION, config);
  }

  init(): InstrumentationNodeModuleDefinition<any>[] {
    return [
      new InstrumentationNodeModuleDefinition<any>(
        'lru-memoizer',
        ['>1.2 <=2'],
        moduleExports => {
          this._diag.debug('applying patch for lru-memoizer');

          // moduleExports is a function which receives an options object,
          // and return a "memoizer" function upon invocation
          // we want to patch this "memoizer" internal function
          const asyncMemoizer = function (this: unknown) {
            // this function is invoked every time the user want to read something from the cache
            // we replace it with another function which bind the current context to the last argument (callback)
            const origMemoizer = moduleExports.apply(this, arguments);
            return function (this: unknown) {
              const modifiedArguments = [...arguments];
              // last argument is the callback
              const origCallback = modifiedArguments.pop();
              modifiedArguments.push(
                context.bind(context.active(), origCallback)
              );
              return origMemoizer.apply(this, modifiedArguments);
            };
          };

          // sync function preserve context, but we still need to export it
          // as the instrumented package does
          asyncMemoizer.sync = moduleExports.sync;
          return asyncMemoizer;
        },
        undefined // no need to disable as this instrumentation does not create any spans
      ),
    ];
  }
}
