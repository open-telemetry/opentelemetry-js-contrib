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
  AnyValue,
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
  record: Record<string, any>,
  logger: Logger
): void {
  const { message, level, ...splat } = record;
  const attributes: LogAttributes = {};
  for (const key in splat) {
    if (Object.prototype.hasOwnProperty.call(splat, key)) {
      attributes[key] = serializeAttribute(splat[key]);
    }
  }
  const logRecord: LogRecord = {
    severityNumber: getSeverityNumber(level),
    severityText: level,
    body: message,
    attributes: attributes,
  };
  logger.emit(logRecord);
}

// Serialize objects and errors
function serializeAttribute(value: any): AnyValue {
  if (typeof value === 'object') {
    if (value instanceof Error) {
      return `[object Error] { message: "${value.message}", name: "${value.name}", stack: "${value.stack}"}`;
    }
    // TypedArrays
    else if (
      value instanceof Int8Array ||
      value instanceof Uint8Array ||
      value instanceof Uint8ClampedArray ||
      value instanceof Int16Array ||
      value instanceof Uint16Array ||
      value instanceof Int32Array ||
      value instanceof Uint32Array ||
      value instanceof Float32Array ||
      value instanceof Float64Array ||
      value instanceof BigInt64Array ||
      value instanceof BigUint64Array
    ) {
      return value as any; // TODO: Remove as any, when AnyValue type is updated to support TypedArrays
    } else {
      try {
        return JSON.stringify(value);
      } catch (err: unknown) {
        // Failed to serialize, return string cast
        return String(value);
      }
    }
  }
  // Return scalar and undefined values without serialization
  return value;
}
