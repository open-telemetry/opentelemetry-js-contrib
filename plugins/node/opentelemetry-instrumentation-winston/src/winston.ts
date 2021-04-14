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
  context,
  diag,
  getSpan,
  isSpanContextValid,
  Span,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { WinstonInstrumentationConfig } from './types';
import { VERSION } from './version';
import type { Logger as WinstonLogger } from 'winston';

export class WinstonInstrumentation extends InstrumentationBase {
  constructor(config: WinstonInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-winston', VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<{}>(
        'winston',
        ['*'],
        moduleExports => moduleExports,
        () => {},
        [
          new InstrumentationNodeModuleFile<WinstonLogger>(
            'winston/lib/winston/logger.js',
            ['>=3.0'],
            logger => {
              if (isWrapped(logger.prototype['write'])) {
                this._unwrap(logger.prototype, 'write');
              }

              this._wrap(
                logger.prototype,
                'write',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this._getPatchedWrite() as any
              );
              return logger;
            },
            logger => {
              if (logger === undefined) return;
              this._unwrap(logger.prototype, 'write');
            }
          ),
          new InstrumentationNodeModuleFile<{}>(
            'winston/lib/winston/logger.js',
            ['<3'],
            logger => {
              return logger;
            },
            logger => {
              console.log(logger);
            }
          ),
        ]
      ),
    ];
  }

  getConfig(): WinstonInstrumentationConfig {
    return this._config;
  }

  setConfig(config: WinstonInstrumentationConfig) {
    this._config = config;
  }

  private _callHook(span: Span, record: Record<string, string>) {
    const hook = this.getConfig().logHook;

    if (!hook) {
      return;
    }

    safeExecuteInTheMiddle(
      () => hook(span, record),
      err => {
        if (err) {
          diag.error('winston instrumentation: error calling logHook', err);
        }
      },
      true
    );
  }

  private _getPatchedWrite() {
    return (original: (...args: unknown[]) => void) => {
      const instrumentation = this;
      return function patchedWrite(this: WinstonLogger, ...args: unknown[]) {
        const span = getSpan(context.active());

        if (!span) {
          return original.apply(this, args);
        }

        const spanContext = span.context();

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
}
