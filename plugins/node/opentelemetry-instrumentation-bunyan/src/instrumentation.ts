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

import { inherits } from 'util';
import { context, trace, isSpanContextValid, Span } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { BunyanInstrumentationConfig } from './types';
import { VERSION } from './version';
import { OpenTelemetryBunyanStream } from './OpenTelemetryBunyanStream';
import type * as BunyanLogger from 'bunyan';

const DEFAULT_CONFIG: BunyanInstrumentationConfig = {
  disableLogsBridge: false,
  disableInjection: false,
};

export class BunyanInstrumentation extends InstrumentationBase<
  typeof BunyanLogger
> {
  constructor(config: BunyanInstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-bunyan',
      VERSION,
      Object.assign({}, DEFAULT_CONFIG, config)
    );
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof BunyanLogger>(
        'bunyan',
        ['<2.0'],
        (module: any, moduleVersion) => {
          this._diag.debug(`Applying patch for bunyan@${moduleVersion}`);
          const instrumentation = this;
          const Logger =
            module[Symbol.toStringTag] === 'Module'
              ? module.default // ESM
              : module; // CommonJS

          this._wrap(
            Logger.prototype,
            '_emit',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this._getPatchedEmit() as any
          );

          function LoggerTraced(this: any, ...args: unknown[]) {
            let inst;
            let retval = undefined;
            if (this instanceof LoggerTraced) {
              // called with `new Logger()`
              inst = this;
              Logger.apply(this, args);
            } else {
              // called without `new`
              inst = Logger.apply(null, args);
              retval = inst;
            }
            // If `_childOptions` is defined, this is a `Logger#child(...)`
            // call. We must not add an OTel stream again.
            if (args[1] /* _childOptions */ === undefined) {
              instrumentation._addStream(inst);
            }
            return retval;
          }
          // Must use the deprecated `inherits` to support this style:
          //    const log = require('bunyan')({name: 'foo'});
          // i.e. calling the constructor function without `new`.
          inherits(LoggerTraced, Logger);

          const patchedExports = Object.assign(LoggerTraced, Logger);

          this._wrap(
            patchedExports,
            'createLogger',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this._getPatchedCreateLogger() as any
          );

          return patchedExports;
        }
      ),
    ];
  }

  override getConfig(): BunyanInstrumentationConfig {
    return this._config;
  }

  override setConfig(config: BunyanInstrumentationConfig) {
    this._config = Object.assign({}, DEFAULT_CONFIG, config);
  }

  private _getPatchedEmit() {
    return (original: (...args: unknown[]) => void) => {
      const instrumentation = this;
      return function patchedEmit(this: BunyanLogger, ...args: unknown[]) {
        const config = instrumentation.getConfig();
        if (!instrumentation.isEnabled() || config.disableInjection) {
          return original.apply(this, args);
        }

        const span = trace.getSpan(context.active());
        if (!span) {
          return original.apply(this, args);
        }

        const spanContext = span.spanContext();
        if (!isSpanContextValid(spanContext)) {
          return original.apply(this, args);
        }

        const record = args[0] as Record<string, string>;
        record['trace_id'] = spanContext.traceId;
        record['span_id'] = spanContext.spanId;
        record['trace_flags'] = `0${spanContext.traceFlags.toString(16)}`;

        instrumentation._callHook(span, record);

        return original.apply(this, args);
      };
    };
  }

  private _getPatchedCreateLogger() {
    return (original: (...args: unknown[]) => void) => {
      const instrumentation = this;
      return function patchedCreateLogger(...args: unknown[]) {
        const logger = original(...args);
        instrumentation._addStream(logger);
        return logger;
      };
    };
  }

  private _addStream(logger: any) {
    const config: BunyanInstrumentationConfig = this.getConfig();
    if (!this.isEnabled() || config.disableLogsBridge) {
      return;
    }
    this._diag.debug('Adding OpenTelemetryBunyanStream to logger');
    logger.addStream({
      type: 'raw',
      stream: new OpenTelemetryBunyanStream(),
      level: logger.level(),
    });
  }

  private _callHook(span: Span, record: Record<string, string>) {
    const hook = this.getConfig().logHook;

    if (typeof hook !== 'function') {
      return;
    }

    safeExecuteInTheMiddle(
      () => hook(span, record),
      err => {
        if (err) {
          this._diag.error('error calling logHook', err);
        }
      },
      true
    );
  }
}
