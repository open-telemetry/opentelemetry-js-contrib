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

import * as api from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';

import type * as genericPool from 'generic-pool';

import { VERSION } from './version';

const MODULE_NAME = 'generic-pool';

export default class Instrumentation extends InstrumentationBase<
  typeof genericPool
> {
  // only used for v2 - v2.3)
  private _isDisabled = false;

  constructor(config: InstrumentationConfig = {}) {
    super(`@opentelemetry/instrumentation-${MODULE_NAME}`, VERSION);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof genericPool>(
        MODULE_NAME,
        ['>=3'],
        (moduleExports, moduleVersion) => {
          api.diag.debug(`Applying patch for ${MODULE_NAME}@${moduleVersion}`);
          const Pool: any = moduleExports.Pool;
          if (isWrapped(Pool.prototype.acquire)) {
            this._unwrap(Pool.prototype, 'acquire');
          }
          this._wrap(
            Pool.prototype,
            'acquire',
            this._acquirePatcher.bind(this)
          );
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          api.diag.debug(`Removing patch for ${MODULE_NAME}@${moduleVersion}`);
          const Pool: any = moduleExports.Pool;
          this._unwrap(Pool.prototype, 'acquire');
          return moduleExports;
        }
      ),
      new InstrumentationNodeModuleDefinition<typeof genericPool>(
        MODULE_NAME,
        ['^2.4'],
        (moduleExports, moduleVersion) => {
          api.diag.debug(`Applying patch for ${MODULE_NAME}@${moduleVersion}`);
          const Pool: any = moduleExports.Pool;
          if (isWrapped(Pool.prototype.acquire)) {
            this._unwrap(Pool.prototype, 'acquire');
          }
          this._wrap(
            Pool.prototype,
            'acquire',
            this._acquireWithCallbacksPatcher.bind(this)
          );
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          api.diag.debug(`Removing patch for ${MODULE_NAME}@${moduleVersion}`);
          const Pool: any = moduleExports.Pool;
          this._unwrap(Pool.prototype, 'acquire');
          return moduleExports;
        }
      ),
      new InstrumentationNodeModuleDefinition<any>(
        MODULE_NAME,
        ['2 - 2.3'],
        (moduleExports, moduleVersion) => {
          api.diag.debug(`Applying patch for ${MODULE_NAME}@${moduleVersion}`);
          this._isDisabled = false;
          if (isWrapped(moduleExports.Pool)) {
            this._unwrap(moduleExports, 'Pool');
          }
          this._wrap(moduleExports, 'Pool', this._poolWrapper.bind(this));
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          api.diag.debug(`Removing patch for ${MODULE_NAME}@${moduleVersion}`);
          // since the object is created on the fly every time, we need to use
          // a boolean switch here to disable the instrumentation
          this._isDisabled = true;
          return moduleExports;
        }
      ),
    ];
  }

  private _acquirePatcher(original: genericPool.Pool<unknown>['acquire']) {
    const instrumentation = this;
    return function wrapped_acquire(
      this: genericPool.Pool<unknown>,
      ...args: any[]
    ) {
      const parent = api.context.active();
      const span = instrumentation.tracer.startSpan(
        'generic-pool.aquire',
        {},
        parent
      );

      return api.context.with(api.trace.setSpan(parent, span), () => {
        return original.call(this, ...args).then(
          value => {
            span.end();
            return value;
          },
          err => {
            span.recordException(err);
            span.end();
            throw err;
          }
        );
      });
    };
  }

  private _poolWrapper(original: any) {
    const instrumentation = this;
    return function wrapped_pool(this: any) {
      const pool = original.apply(this, arguments);
      instrumentation._wrap(
        pool,
        'acquire',
        instrumentation._acquireWithCallbacksPatcher.bind(instrumentation)
      );
      return pool;
    };
  }

  private _acquireWithCallbacksPatcher(original: any) {
    const instrumentation = this;
    return function wrapped_acquire(
      this: genericPool.Pool<unknown>,
      cb: Function,
      priority: number
    ) {
      // only used for v2 - v2.3
      if (instrumentation._isDisabled) {
        return original.call(this, cb, priority);
      }
      const parent = api.context.active();
      const span = instrumentation.tracer.startSpan(
        'generic-pool.aquire',
        {},
        parent
      );

      return api.context.with(api.trace.setSpan(parent, span), () => {
        original.call(
          this,
          (err: unknown, client: unknown) => {
            span.end();
            // Not checking whether cb is a function because
            // the original code doesn't do that either.
            if (cb) {
              return cb(err, client);
            }
          },
          priority
        );
      });
    };
  }
}
