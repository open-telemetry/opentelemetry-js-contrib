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
  trace,
  isSpanContextValid,
  Span,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { OgmaInstrumentationConfig } from './types';
import { VERSION } from './version';

const ogmaVersions = ['>=3.2.0'];

export class OgmaInstrumentation extends InstrumentationBase {
  constructor(config: OgmaInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-ogma', VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<any>(
        '@ogma/logger',
        ogmaVersions,
        (ogmaModule, moduleVersion) => {
          diag.debug(`Applying patch for @ogma/logger@${moduleVersion}`);
          const instrumentation = this;
          Object.assign(ogmaModule.OgmaDefaults, {
            ...ogmaModule.OgmaDefaults,
            mixin: instrumentation._getMixinFunction(),
          });

          return ogmaModule;
        }
      ),
    ];
  }

  override getConfig(): OgmaInstrumentationConfig {
    return this._config;
  }

  override setConfig(config: OgmaInstrumentationConfig) {
    this._config = config;
  }

  private _callHook(span: Span, record: Record<string, string>, level: string) {
    const hook = this.getConfig().logHook;

    if (!hook) {
      return;
    }

    safeExecuteInTheMiddle(
      () => hook(span, record, level),
      err => {
        if (err) {
          diag.error(
            '@ogma/logger instrumentation: error calling logHook',
            err
          );
        }
      },
      true
    );
  }

  private _getMixinFunction() {
    const instrumentation = this;
    return function otelMixin(level: string) {
      if (!instrumentation.isEnabled()) {
        return {};
      }

      const span = trace.getSpan(context.active());

      if (!span) {
        return {};
      }

      const spanContext = span.spanContext();

      if (!isSpanContextValid(spanContext)) {
        return {};
      }

      const record = {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
        trace_flags: `0${spanContext.traceFlags.toString(16)}`,
      };

      instrumentation._callHook(span, record, level);

      return record;
    };
  }
}
