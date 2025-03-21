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

import { Writable } from 'stream';

import { logs, Logger, SeverityNumber } from '@opentelemetry/api-logs';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { millisToHrTime } from '@opentelemetry/core';

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

/**
 * Return a function that knows how to convert the "time" field value on a
 * Pino log record to an OTel LogRecord timestamp value.
 *
 * How to convert the serialized "time" on a Pino log record
 * depends on the Logger's `Symbol(pino.time)` prop, configurable
 * via https://getpino.io/#/docs/api?id=timestamp-boolean-function
 *
 * For example:
 *    const logger = pino({timestamp: pino.stdTimeFunctions.isoTime})
 * results in log record entries of the form:
 *    ,"time":"2024-05-17T22:03:25.969Z"
 * `otelTimestampFromTime` will be given the value of the "time" field:
 *   "2024-05-17T22:03:25.969Z"
 * which should be parsed to a number of milliseconds since the epoch.
 */
export function getTimeConverter(pinoLogger: any, pinoMod: any) {
  const stdTimeFns = pinoMod.stdTimeFunctions;
  const loggerTimeFn = pinoLogger[pinoMod.symbols.timeSym];
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
}

interface OTelPinoStreamOptions {
  messageKey: string;
  levels: any; // Pino.LevelMapping
  otelTimestampFromTime: (time: any) => number;
}

/**
 * A Pino stream for sending records to the OpenTelemetry Logs API.
 *
 * - This stream emits an 'unknown' event on an unprocessable pino record.
 *   The event arguments are: `logLine: string`, `err: string | Error`.
 */
export class OTelPinoStream extends Writable {
  private declare _otelLogger: Logger;
  private declare _messageKey: string;
  private declare _levels;
  private declare _otelTimestampFromTime;

  constructor(options: OTelPinoStreamOptions) {
    super();

    // Note: A PINO_CONFIG event was added to pino (2024-04-04) to send config
    // to transports. Eventually OTelPinoStream might be able to use this
    // for auto-configuration in newer pino versions. The event currently does
    // not include the `timeSym` value that is needed here, however.
    this._messageKey = options.messageKey;
    this._levels = options.levels;
    this._otelTimestampFromTime = options.otelTimestampFromTime;

    // Cannot use `instrumentation.logger` until have delegating LoggerProvider:
    // https://github.com/open-telemetry/opentelemetry-js/issues/4399
    this._otelLogger = logs.getLogger(PACKAGE_NAME, PACKAGE_VERSION);
  }

  override _write(s: string, _encoding: string, callback: Function) {
    /* istanbul ignore if */
    if (!s) {
      return;
    }

    // Parse, and handle edge cases similar to how `pino-abtract-transport` does:
    // https://github.com/pinojs/pino-abstract-transport/blob/v1.2.0/index.js#L28-L45
    // - Emitting an 'unknown' event on parse error mimicks pino-abstract-transport.
    let recObj;
    try {
      recObj = JSON.parse(s);
    } catch (parseErr) {
      // Invalid JSON suggests a bug in Pino, or a logger configuration bug
      // (a bogus `options.timestamp` or serializer).
      this.emit('unknown', s.toString(), parseErr);
      callback();
      return;
    }
    /* istanbul ignore if */
    if (recObj === null) {
      this.emit('unknown', s.toString(), 'Null value ignored');
      callback();
      return;
    }
    /* istanbul ignore if */
    if (typeof recObj !== 'object') {
      recObj = {
        data: recObj,
      };
    }

    const {
      time,
      [this._messageKey]: body,
      level, // eslint-disable-line @typescript-eslint/no-unused-vars

      // The typical Pino `hostname` and `pid` fields are removed because they
      // are redundant with the OpenTelemetry `host.name` and `process.pid`
      // Resource attributes, respectively. This code cannot change the
      // LoggerProvider's `resource`, so getting the OpenTelemetry equivalents
      // depends on the user using the OpenTelemetry HostDetector and
      // ProcessDetector.
      // https://getpino.io/#/docs/api?id=opt-base
      hostname, // eslint-disable-line @typescript-eslint/no-unused-vars
      pid, // eslint-disable-line @typescript-eslint/no-unused-vars

      // The `trace_id` et al fields that may have been added by the
      // "log correlation" feature are stripped, because they are redundant.
      trace_id, // eslint-disable-line @typescript-eslint/no-unused-vars
      span_id, // eslint-disable-line @typescript-eslint/no-unused-vars
      trace_flags, // eslint-disable-line @typescript-eslint/no-unused-vars

      ...attributes
    } = recObj;

    let timestamp = this._otelTimestampFromTime(time);
    if (isNaN(timestamp)) {
      attributes['time'] = time; // save the unexpected "time" field to attributes
      timestamp = Date.now();
    }

    // This avoids a possible subtle bug when a Pino logger uses
    // `time: pino.stdTimeFunctions.unixTime` and logs in the first half-second
    // since process start. The rounding involved results in:
    //    timestamp < performance.timeOrigin
    // If that is passed to Logger.emit() it will be misinterpreted by
    // `timeInputToHrTime` as a `performance.now()` value.
    const timestampHrTime = millisToHrTime(timestamp);

    // Prefer using `stream.lastLevel`, because `recObj.level` can be customized
    // to anything via `formatters.level`
    // (https://getpino.io/#/docs/api?id=formatters-object).
    const lastLevel = (this as any).lastLevel;

    const otelRec = {
      timestamp: timestampHrTime,
      observedTimestamp: timestampHrTime,
      severityNumber: severityNumberFromPinoLevel(lastLevel),
      severityText: this._levels.labels[lastLevel],
      body,
      attributes,
    };

    this._otelLogger.emit(otelRec);
    callback();
  }
}
