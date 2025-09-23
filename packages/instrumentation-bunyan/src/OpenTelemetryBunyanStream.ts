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

import { logs, SeverityNumber, Logger } from '@opentelemetry/api-logs';
import type { LogLevelString } from 'bunyan';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

const DEFAULT_INSTRUMENTATION_SCOPE_NAME = PACKAGE_NAME;
const DEFAULT_INSTRUMENTATION_SCOPE_VERSION = PACKAGE_VERSION;

// This block is a copy (modulo code style and TypeScript types) of the Bunyan
// code that defines log level value and names. These values won't ever change
// in bunyan@1. This file is part of *instrumenting* Bunyan, so we want to
// avoid a dependency on the library.
const TRACE = 10;
const DEBUG = 20;
const INFO = 30;
const WARN = 40;
const ERROR = 50;
const FATAL = 60;
const levelFromName: Record<LogLevelString, number> = {
  trace: TRACE,
  debug: DEBUG,
  info: INFO,
  warn: WARN,
  error: ERROR,
  fatal: FATAL,
};
const nameFromLevel: { [level: number]: string } = {};
Object.keys(levelFromName).forEach(function (name) {
  nameFromLevel[levelFromName[name as LogLevelString]] = name;
});

const OTEL_SEV_NUM_FROM_BUNYAN_LEVEL: { [level: number]: SeverityNumber } = {
  [TRACE]: SeverityNumber.TRACE,
  [DEBUG]: SeverityNumber.DEBUG,
  [INFO]: SeverityNumber.INFO,
  [WARN]: SeverityNumber.WARN,
  [ERROR]: SeverityNumber.ERROR,
  [FATAL]: SeverityNumber.FATAL,
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

function severityNumberFromBunyanLevel(lvl: number) {
  // Fast common case: one of the known levels
  const sev = OTEL_SEV_NUM_FROM_BUNYAN_LEVEL[lvl];
  if (sev !== undefined) {
    return sev;
  }

  // Otherwise, scale the Bunyan level range -- 10 (TRACE) to 70 (FATAL+10)
  // -- onto the extra OTel severity numbers (TRACE2, TRACE3, ..., FATAL4).
  // Values below bunyan.TRACE map to SeverityNumber.TRACE2, which may be
  // considered a bit weird, but it means the unnumbered levels are always
  // just for exactly values.
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
 * A Bunyan stream for sending log records to the OpenTelemetry Logs SDK.
 */
export class OpenTelemetryBunyanStream {
  private _otelLogger: Logger;

  constructor() {
    this._otelLogger = logs.getLogger(
      DEFAULT_INSTRUMENTATION_SCOPE_NAME,
      DEFAULT_INSTRUMENTATION_SCOPE_VERSION
    );
  }

  /**
   * Convert from https://github.com/trentm/node-bunyan#log-record-fields
   * to https://opentelemetry.io/docs/specs/otel/logs/data-model/
   *
   * Dev Notes:
   * - We drop the Bunyan 'v' field. It is meant to indicate the format
   *   of the Bunyan log record. FWIW, it has always been `0`.
   * - The standard Bunyan `hostname` and `pid` fields are removed because they
   *   are redundant with the OpenTelemetry `host.name` and `process.pid`
   *   Resource attributes, respectively. This code cannot change the
   *   LoggerProvider's `resource`, so getting the OpenTelemetry equivalents
   *   depends on the user using relevant OpenTelemetry resource detectors.
   *   "examples/telemetry.js" shows using HostDetector and ProcessDetector for
   *   this.
   * - The Bunyan `name` field *could* naturally map to OpenTelemetry's
   *   `service.name` resource attribute. However, that is debatable, as some
   *   users might use `name` more like a log4j logger name.
   * - Strip the `trace_id` et al fields that may have been added by the
   *   the _emit wrapper.
   */
  write(rec: Record<string, any>) {
    const {
      time,
      level,
      msg,
      v, // eslint-disable-line @typescript-eslint/no-unused-vars
      hostname, // eslint-disable-line @typescript-eslint/no-unused-vars
      pid, // eslint-disable-line @typescript-eslint/no-unused-vars
      trace_id, // eslint-disable-line @typescript-eslint/no-unused-vars
      span_id, // eslint-disable-line @typescript-eslint/no-unused-vars
      trace_flags, // eslint-disable-line @typescript-eslint/no-unused-vars
      ...fields
    } = rec;
    let timestamp = undefined;
    if (typeof time.getTime === 'function') {
      timestamp = time.getTime(); // ms
    } else {
      fields.time = time; // Expose non-Date "time" field on attributes.
    }
    const otelRec = {
      timestamp,
      observedTimestamp: timestamp,
      severityNumber: severityNumberFromBunyanLevel(level),
      severityText: nameFromLevel[level],
      body: msg,
      attributes: fields,
    };
    this._otelLogger.emit(otelRec);
  }
}
