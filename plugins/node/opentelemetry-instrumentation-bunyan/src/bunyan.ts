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

import { context, getSpan, isSpanContextValid } from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { BunyanInstrumentationConfig } from './types';
import { VERSION } from './version';
import type * as BunyanLogger from 'bunyan';

function defaultHook() {}

export class BunyanInstrumentation extends InstrumentationBase<
  typeof BunyanLogger
> {
  constructor(config: BunyanInstrumentationConfig = { logHook: defaultHook }) {
    super('@opentelemetry/instrumentation-bunyan', VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof BunyanLogger>(
        'bunyan',
        ['*'],
        logger => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const proto = logger.prototype as any;
          if (isWrapped(proto['_emit'])) {
            this._unwrap(proto, '_emit');
          }

          this._wrap(
            proto,
            '_emit',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this._getPatchedEmit() as any
          );
          return logger;
        },
        logger => {
          if (logger === undefined) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this._unwrap(logger.prototype as any, '_emit');
        }
      ),
    ];
  }

  getConfig(): BunyanInstrumentationConfig {
    return this._config;
  }

  setConfig(config: BunyanInstrumentationConfig) {
    this._config = Object.assign({ logHook: defaultHook }, config);
  }

  private _getPatchedEmit() {
    return (original: (...args: unknown[]) => void) => {
      const instrumentation = this;
      return function patchedEmit(this: BunyanLogger, ...args: unknown[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const record = args[0] as any;
        const span = getSpan(context.active());

        if (!span) {
          return original.apply(this, args);
        }

        const spanContext = span.context();

        if (!isSpanContextValid(spanContext)) {
          return original.apply(this, args);
        }

        record['trace_id'] = spanContext.traceId;
        record['span_id'] = spanContext.spanId;
        record['trace_flags'] = `0${spanContext.traceFlags.toString(16)}`;

        instrumentation.getConfig().logHook!(record, span);

        return original.apply(this, args);
      };
    };
  }
}
