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
import { PinoInstrumentationConfig } from './types';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { getTimeConverter, OTelPinoStream } from './log-sending-utils';

const pinoVersions = ['>=5.14.0 <10'];

const DEFAULT_LOG_KEYS = {
  traceId: 'trace_id',
  spanId: 'span_id',
  traceFlags: 'trace_flags',
};

export class PinoInstrumentation extends InstrumentationBase<PinoInstrumentationConfig> {
  constructor(config: PinoInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition('pino', pinoVersions, module => {
        const isESM = module[Symbol.toStringTag] === 'Module';
        const moduleExports = isESM ? module.default : module;
        const instrumentation = this;

        const patchedPino = Object.assign((...args: unknown[]) => {
          const config = instrumentation.getConfig();
          const isEnabled = instrumentation.isEnabled();

          const logger = moduleExports(...args);

          // Setup "log correlation" -- injection of `trace_id` et al fields.
          // Note: If the Pino logger is configured with `nestedKey`, then
          // the `trace_id` et al fields added by `otelMixin` will be nested
          // as well. https://getpino.io/#/docs/api?id=mixin-function
          const otelMixin = instrumentation._getMixinFunction();
          const mixinSym = moduleExports.symbols.mixinSym;
          const origMixin = logger[mixinSym];
          if (origMixin === undefined) {
            logger[mixinSym] = otelMixin;
          } else {
            logger[mixinSym] = (ctx: object, level: number) => {
              return Object.assign(
                otelMixin(ctx, level),
                origMixin(ctx, level)
              );
            };
          }

          // Setup "log sending" -- sending log records to the Logs API.
          // This depends on `pino.multistream`, which was added in v7.0.0.
          if (
            isEnabled &&
            !config.disableLogSending &&
            typeof moduleExports.multistream === 'function'
          ) {
            const otelTimestampFromTime = getTimeConverter(
              logger,
              moduleExports
            );
            const otelStream = new OTelPinoStream({
              messageKey: logger[moduleExports.symbols.messageKeySym],
              levels: logger.levels,
              otelTimestampFromTime,
            });
            (otelStream as any)[Symbol.for('pino.metadata')] = true; // for `stream.lastLevel`

            // An error typically indicates a Pino bug, or logger configuration
            // bug. `diag.warn` *once* for the first error on the assumption
            // subsequent ones stem from the same bug.
            otelStream.once('unknown', (line, err) => {
              instrumentation._diag.warn(
                'could not send pino log line (will only log first occurrence)',
                { line, err }
              );
            });

            // Use pino's own `multistream` to send to the original stream and
            // to the OTel Logs API/SDK.
            // https://getpino.io/#/docs/api?id=pinomultistreamstreamsarray-opts-gt-multistreamres
            const origStream = logger[moduleExports.symbols.streamSym];
            logger[moduleExports.symbols.streamSym] = moduleExports.multistream(
              [
                { level: logger.level, stream: origStream },
                { level: logger.level, stream: otelStream },
              ],
              { levels: logger.levels.values }
            );
          }

          return logger;
        }, moduleExports);

        if (typeof patchedPino.pino === 'function') {
          patchedPino.pino = patchedPino;
        }
        if (typeof patchedPino.default === 'function') {
          patchedPino.default = patchedPino;
        }
        /* istanbul ignore if */
        if (isESM) {
          if (module.pino) {
            // This was added in pino@6.8.0 (https://github.com/pinojs/pino/pull/936).
            module.pino = patchedPino;
          }
          module.default = patchedPino;
        }

        return patchedPino;
      }),
    ];
  }

  private _callHook(span: Span, record: Record<string, string>, level: number) {
    const { logHook } = this.getConfig();

    if (!logHook) {
      return;
    }

    safeExecuteInTheMiddle(
      () => logHook(span, record, level),
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
    return function otelMixin(_context: object, level: number) {
      if (
        !instrumentation.isEnabled() ||
        instrumentation.getConfig().disableLogCorrelation
      ) {
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

      const logKeys = instrumentation.getConfig().logKeys ?? DEFAULT_LOG_KEYS;

      const record = {
        [logKeys.traceId]: spanContext.traceId,
        [logKeys.spanId]: spanContext.spanId,
        [logKeys.traceFlags]: `0${spanContext.traceFlags.toString(16)}`,
      };

      instrumentation._callHook(span, record, level);

      return record;
    };
  }
}
