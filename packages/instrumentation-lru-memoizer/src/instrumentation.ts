/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

export class LruMemoizerInstrumentation extends InstrumentationBase {
  constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  init(): InstrumentationNodeModuleDefinition[] {
    return [
      new InstrumentationNodeModuleDefinition(
        'lru-memoizer',
        ['>=1.3 <4'],
        moduleExports => {
          // moduleExports is a function which receives an options object,
          // and returns a "memoizer" function upon invocation.
          // We want to patch this "memoizer's" internal function
          const asyncMemoizer = function (this: unknown) {
            // This following function is invoked every time the user wants to get a (possible) memoized value
            // We replace it with another function in which we bind the current context to the last argument (callback)
            const origMemoizer = moduleExports.apply(this, arguments);
            return function (this: unknown) {
              const modifiedArguments = [...arguments];
              // last argument is the callback
              const origCallback = modifiedArguments.pop();
              const callbackWithContext =
                typeof origCallback === 'function'
                  ? context.bind(context.active(), origCallback)
                  : origCallback;
              modifiedArguments.push(callbackWithContext);
              return origMemoizer.apply(this, modifiedArguments);
            };
          };

          // sync function preserves context, but we still need to export it
          // as the lru-memoizer package does
          asyncMemoizer.sync = moduleExports.sync;
          return asyncMemoizer;
        },
        undefined // no need to disable as this instrumentation does not create any spans
      ),
    ];
  }
}
