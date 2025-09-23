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
  LogAttributes,
  LogRecord,
  Logger,
  SeverityNumber,
} from '@opentelemetry/api-logs';

const npmLevels: Record<string, number> = {
  error: SeverityNumber.ERROR,
  warn: SeverityNumber.WARN,
  info: SeverityNumber.INFO,
  http: SeverityNumber.DEBUG3,
  verbose: SeverityNumber.DEBUG2,
  debug: SeverityNumber.DEBUG,
  silly: SeverityNumber.TRACE,
};

const sysLoglevels: Record<string, number> = {
  emerg: SeverityNumber.FATAL3,
  alert: SeverityNumber.FATAL2,
  crit: SeverityNumber.FATAL,
  error: SeverityNumber.ERROR,
  warning: SeverityNumber.WARN,
  notice: SeverityNumber.INFO2,
  info: SeverityNumber.INFO,
  debug: SeverityNumber.DEBUG,
};

const cliLevels: Record<string, number> = {
  error: SeverityNumber.ERROR,
  warn: SeverityNumber.WARN,
  help: SeverityNumber.INFO3,
  data: SeverityNumber.INFO2,
  info: SeverityNumber.INFO,
  debug: SeverityNumber.DEBUG,
  prompt: SeverityNumber.TRACE4,
  verbose: SeverityNumber.TRACE3,
  input: SeverityNumber.TRACE2,
  silly: SeverityNumber.TRACE,
};

function getSeverityNumber(level: string): SeverityNumber | undefined {
  return npmLevels[level] ?? sysLoglevels[level] ?? cliLevels[level];
}

export function emitLogRecord(
  record: Record<string | symbol, any>,
  logger: Logger
): void {
  const { message, level, ...splat } = record;
  const attributes: LogAttributes = {};
  // Ensures the log level is read from a symbol property, avoiding any
  // accidental inclusion of ANSI color codes that may be present in the string
  // property.
  const levelSym = record[Symbol.for('level')];
  for (const key in splat) {
    if (Object.prototype.hasOwnProperty.call(splat, key)) {
      attributes[key] = splat[key];
    }
  }
  const logRecord: LogRecord = {
    severityNumber: getSeverityNumber(levelSym),
    severityText: levelSym,
    body: message,
    attributes: attributes,
  };
  logger.emit(logRecord);
}
