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
import { logs, Logger, SeverityNumber } from '@opentelemetry/api-logs';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { PinoInstrumentationConfig } from './types';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

const pinoVersions = ['>=5.14.0 <10'];

const DEFAULT_LOG_KEYS = {
  traceId: 'trace_id',
  spanId: 'span_id',
  traceFlags: 'trace_flags',
};

// XXX maybe move levels stuff out to separate utility file

// This block is a copy (modulo code style and TypeScript types) of the Pino
// code that defines log level value and names. This file is part of
// *instrumenting* Pino, so we want to avoid a dependency on the library.
const DEFAULT_LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const OTEL_SEV_NUM_FROM_PINO_LEVEL: { [level: number]: SeverityNumber } = {
  [DEFAULT_LEVELS.trace]: SeverityNumber.TRACE,
  [DEFAULT_LEVELS.debug]: SeverityNumber.DEBUG,
  [DEFAULT_LEVELS.info]: SeverityNumber.INFO,
  [DEFAULT_LEVELS.warn]: SeverityNumber.WARN,
  [DEFAULT_LEVELS.error]: SeverityNumber.ERROR,
  [DEFAULT_LEVELS.fatal]: SeverityNumber.FATAL,
};

const EXTRA_SEV_NUMS = [
  SeverityNumber.TRACE2,
  SeverityNumber.TRACE3,
  SeverityNumber.TRACE4,
  SeverityNumber.DEBUG2,
  SeverityNumber.DEBUG3,
  SeverityNumber.DEBUG4,
  SeverityNumber.INFO2,
  SeverityNumber.INFO3,
  SeverityNumber.INFO4,
  SeverityNumber.WARN2,
  SeverityNumber.WARN3,
  SeverityNumber.WARN4,
  SeverityNumber.ERROR2,
  SeverityNumber.ERROR3,
  SeverityNumber.ERROR4,
  SeverityNumber.FATAL2,
  SeverityNumber.FATAL3,
  SeverityNumber.FATAL4,
];

function severityNumberFromPinoLevel(lvl: number) {
  // Fast common case: one of the known levels
  const sev = OTEL_SEV_NUM_FROM_PINO_LEVEL[lvl];
  if (sev !== undefined) {
    return sev;
  }

  // Otherwise, scale the Pino level range -- 10 (trace) to 70 (fatal+10)
  // -- onto the extra OTel severity numbers (TRACE2, TRACE3, ..., FATAL4).
  // Values below trace (10) map to SeverityNumber.TRACE2, which may be
  // considered a bit weird, but it means the unnumbered levels are always
  // just for exactly matching values.
  const relativeLevelWeight = (lvl - 10) / (70 - 10);
  const otelSevIdx = Math.floor(relativeLevelWeight * EXTRA_SEV_NUMS.length);
  const cappedOTelIdx = Math.min(
    EXTRA_SEV_NUMS.length - 1,
    Math.max(0, otelSevIdx)
  );
  const otelSevValue = EXTRA_SEV_NUMS[cappedOTelIdx];
  return otelSevValue;
}

// let patchCounter = 0 // XXX

// const PINO_IS_WRAPPED = Symbol('opentelemetry.instrumentation-pino.is-wrapped');

export class PinoInstrumentation extends InstrumentationBase {
  constructor(config: PinoInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  protected init() {
    // console.warn('XXX returning from PinoInstrumentation.init', )
    return [
      new InstrumentationNodeModuleDefinition('pino', pinoVersions, module => {
        // console.warn('XXX calling InstrumentationNodeModuleDefinition(pino) patch()')
        const isESM = module[Symbol.toStringTag] === 'Module';
        const moduleExports = isESM ? module.default : module;
        const instrumentation = this;

        // // Pino instrumentation patches the default export, so the usual
        // // `instrumentation.{_wrap,_unwrap}` cannot be used. This instr must
        // // then avoid duplicate wrapping itself.
        // // XXX first config wins then. Hrm.
        // if (moduleExports[PINO_IS_WRAPPED]) {
        //   return moduleExports;
        // }

        // Cannot use `instrumentation.logger` until have delegating LoggerProvider:
        // https://github.com/open-telemetry/opentelemetry-js/issues/4399
        const otelLogger = logs.getLogger(PACKAGE_NAME, PACKAGE_VERSION);

        // const patchId = patchCounter++
        const patchedPino = Object.assign((...args: unknown[]) => {
          // console.warn('XXX [patchId=%s] calling patchedPino(...)', patchId)

          // XXX instrumentatin.getConfig(); usage
          // const config = instrumentation.getConfig();
          const optLogCorrelation = true;
          const optLogSending = true;
          const isEnabled = instrumentation.isEnabled();

          const logger = moduleExports(...args);

          // XXX
          // if (isEnabled && optLogCorrelation) {
          if (optLogCorrelation) {
            // Note: If the Pino logger is configured with `nestedKey`, then
            // the `trace_id` et al fields added by `otelMixin` will be nested
            // as well. https://getpino.io/#/docs/api?id=mixin-function
            const otelMixin = instrumentation._getMixinFunction();
            const mixinSym = moduleExports.symbols.mixinSym;
            const origMixin = logger[mixinSym];
            if (origMixin === undefined) {
              // console.warn('XXX adding otelMixin', )
              logger[mixinSym] = otelMixin;
            } else {
              logger[mixinSym] = (ctx: object, level: number) => {
                return Object.assign(
                  otelMixin(ctx, level),
                  origMixin(ctx, level)
                );
              };
            }
          }
          // patchedPino[PINO_IS_WRAPPED] = true;

          if (isEnabled && optLogSending) {
            // Shim the Pino logger's `stream.write` for log sending.
            const stream = logger[moduleExports.symbols.streamSym];
            if (typeof stream.write !== 'function') {
              instrumentation._diag.debug(
                'cannot setup log-sending: Pino logger stream.write is not a function'
              );
            } else {
              const messageKey = logger[moduleExports.symbols.messageKeySym];
              stream[Symbol.for('pino.metadata')] = true; // for `stream.lastLevel`

              // How to convert the serialized "time" on a Pino log record
              // depends on the Logger's `Symbol(pino.time)` attr, configurable
              // via https://getpino.io/#/docs/api?id=timestamp-boolean-function
              // For example:
              //    const logger = pino({timestamp: pino.stdTimeFunctions.isoTime})
              // results in log record entries of the form:
              //    ,"time":"2024-05-17T22:03:25.969Z"
              // `otelTimestampFromTime` will be given the value of the "time" field:
              //    "2024-05-17T22:03:25.969Z"
              // which should be parsed to a number of milliseconds since the epoch.
              const otelTimestampFromTime = (() => {
                const stdTimeFns = moduleExports.stdTimeFunctions;
                const loggerTimeFn = logger[moduleExports.symbols.timeSym];
                if (loggerTimeFn === stdTimeFns.epochTime) {
                  return (time: number) => time;
                } else if (loggerTimeFn === stdTimeFns.unixTime) {
                  return (time: number) => time * 1e3;
                } else if (loggerTimeFn === stdTimeFns.isoTime) {
                  return (time: string) => new Date(time).getTime();
                } else if (loggerTimeFn === stdTimeFns.nullTime) {
                  return () => Date.now();
                } else {
                  // The logger has a custom time function. Don't guess.
                  return () => NaN;
                }
              })();

              const origWrite = stream.write;
              stream.write = function otelWrite(...args: unknown[]) {
                // To gather the log record fields, we *almost* could use the
                // `stream.last*` fields from https://getpino.io/#/docs/api?id=metadata
                // However, that gets raw data before being passed through
                // possible user-provided serializers. Therefore, the only way
                // is to `JSON.parse(args[0])` -- which is unfortunate parsing
                // overhead. The alternative for users is to use
                // `pino-opentelemetry-transport` or similar to move log-sending
                // processing to a worker-thread.
                emitOTelLogRecord(
                  logger,
                  stream,
                  args[0] as string,
                  messageKey,
                  otelTimestampFromTime,
                  otelLogger
                );
                return origWrite.apply(stream, args);
              };
            }
          }

          return logger;
        }, moduleExports);

        if (typeof patchedPino.pino === 'function') {
          patchedPino.pino = patchedPino;
        }
        if (typeof patchedPino.default === 'function') {
          patchedPino.default = patchedPino;
        }
        if (isESM) {
          if (module.pino) {
            // This was added in pino@6.8.0 (https://github.com/pinojs/pino/pull/936).
            module.pino = patchedPino;
          }
          module.default = patchedPino;
        }

        // console.warn('XXX returning patchedPino', )
        return patchedPino;
      }),
    ];
  }

  override getConfig(): PinoInstrumentationConfig {
    return this._config;
  }

  override setConfig(config: PinoInstrumentationConfig = {}) {
    this._config = config;
  }

  private _callHook(span: Span, record: Record<string, string>, level: number) {
    const hook = this.getConfig().logHook;

    if (!hook) {
      return;
    }

    safeExecuteInTheMiddle(
      () => hook(span, record, level),
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
      // XXX drop this in favour of higher up
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

function emitOTelLogRecord(
  pinoLogger: any,
  stream: any,
  s: string,
  messageKey: string,
  otelTimestampFromTime: (time: any) => number,
  otelLogger: Logger
) {
  if (!s) {
    return;
  }

  // Parse, and handle edge cases similar to how `pino-abtract-transport` does:
  // https://github.com/pinojs/pino-abstract-transport/blob/v1.2.0/index.js#L28-L45
  let recObj;
  try {
    recObj = JSON.parse(s);
  } catch (_err) {
    // Invalid JSON suggests a bug in Pino, or a logger configuration bug
    // (a bogus `options.timestamp` or serializer). diag.warn *once* for the
    // first error on the assumption subsequent ones stem from the same bug.
    // XXX test for this.
    // TODO: possibly emit a simple LogRecord using the full `s` as the body?
    return;
  }
  if (recObj === null) {
    return;
  }
  if (typeof recObj !== 'object') {
    recObj = {
      data: recObj,
    };
  }
  // console.log('XXX recObj: ', recObj)

  const {
    time,
    level, // eslint-disable-line @typescript-eslint/no-unused-vars
    [messageKey]: body,
    hostname, // eslint-disable-line @typescript-eslint/no-unused-vars
    pid, // eslint-disable-line @typescript-eslint/no-unused-vars
    trace_id, // eslint-disable-line @typescript-eslint/no-unused-vars
    span_id, // eslint-disable-line @typescript-eslint/no-unused-vars
    trace_flags, // eslint-disable-line @typescript-eslint/no-unused-vars
    ...attributes
  } = recObj;

  let timestamp = otelTimestampFromTime(time);
  if (isNaN(timestamp)) {
    timestamp = Date.now();
  }

  const logRec = {
    timestamp: timestamp,
    observedTimestamp: timestamp,
    // Prefer using `stream.lastLevel`, because `recObj.level` can be customized
    // to anything via `formatters.level`
    // (https://getpino.io/#/docs/api?id=formatters-object).
    severityNumber: severityNumberFromPinoLevel(stream.lastLevel),
    severityText: pinoLogger.levels.labels[stream.lastLevel],
    body,
    attributes,
  };
  // console.log('XXX logRec: ', logRec)

  otelLogger.emit(logRec);
}
