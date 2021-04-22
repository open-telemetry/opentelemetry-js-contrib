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
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { Pino, PinoInstrumentationConfig } from './types';
import { VERSION } from './version';
import type * as pino from 'pino';

const pinoVersions = ['>=5.14.0 <7'];

export class PinoInstrumentation extends InstrumentationBase {
  // TODO: https://github.com/open-telemetry/opentelemetry-js/issues/2131
  _isEnabled: boolean = false;

  constructor(config: PinoInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-pino', VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<Pino>(
        'pino',
        pinoVersions,
        pinoModule => {
          const instrumentation = this;
          const patchedPino = Object.assign((...args: unknown[]) => {
            if (args.length == 0) {
              return pinoModule({ mixin: instrumentation._getMixinFunction() });
            }

            if (args.length == 1) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const optsOrStream = args[0] as any;
              if (
                typeof optsOrStream === 'string' ||
                typeof optsOrStream?.write === 'function'
              ) {
                args.splice(0, 0, {
                  mixin: instrumentation._getMixinFunction(),
                });
                return pinoModule(...(args as Parameters<Pino>));
              }
            }

            args[0] = instrumentation._combineOptions(
              args[0] as pino.LoggerOptions
            );

            return pinoModule(...(args as Parameters<Pino>));
          }, pinoModule);

          return patchedPino;
        },
        () => {
          this._isEnabled = false;
        }
      ),
    ];
  }

  getConfig(): PinoInstrumentationConfig {
    return this._config;
  }

  setConfig(config: PinoInstrumentationConfig) {
    this._config = config;
  }

  enable() {
    super.enable();
    this._isEnabled = true;
  }

  disable() {
    super.disable();
    this._isEnabled = false;
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
          diag.error('pino instrumentation: error calling logHook', err);
        }
      },
      true
    );
  }

  private _getMixinFunction() {
    const instrumentation = this;
    return function otelMixin() {
      if (!instrumentation._isEnabled) {
        return {};
      }

      const span = getSpan(context.active());

      if (!span) {
        return {};
      }

      const spanContext = span.context();

      if (!isSpanContextValid(spanContext)) {
        return {};
      }

      const record = {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
        trace_flags: `0${spanContext.traceFlags.toString(16)}`,
      };

      instrumentation._callHook(span, record);

      return record;
    };
  }

  private _combineOptions(options?: pino.LoggerOptions) {
    if (options === undefined) {
      return { mixin: this._getMixinFunction() };
    }

    if (options.mixin === undefined) {
      options.mixin = this._getMixinFunction();
      return options;
    }

    const originalMixin = options.mixin;
    const otelMixin = this._getMixinFunction();

    options.mixin = () => {
      return Object.assign(otelMixin(), originalMixin());
    };

    return options;
  }
}
