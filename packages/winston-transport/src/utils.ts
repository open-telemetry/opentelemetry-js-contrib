/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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

/**
 * Mirrors the exception shapes handled by sdk-logs `LogRecordImpl._setException`.
 * We cannot reuse that internal method directly from this package.
 */
function isSdkLogsExceptionCandidate(value: unknown): boolean {
  if (typeof value === 'string' || typeof value === 'number') {
    return true;
  }

  if (value == null || typeof value !== 'object') {
    return false;
  }

  const exception = value as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
    stack?: unknown;
  };

  return (
    exception.code != null ||
    exception.name != null ||
    exception.message != null ||
    exception.stack != null
  );
}

function extractCauseAttributes(
  key: 'err' | 'error',
  value: unknown
): LogAttributes {
  if (value == null || typeof value !== 'object' || !('cause' in value)) {
    return {};
  }

  const cause = (value as { cause: unknown }).cause;
  if (cause == null) {
    return {};
  }

  const attributes: LogAttributes = {};
  if (typeof cause === 'string' || typeof cause === 'number') {
    attributes[`${key}.cause`] = cause as AnyValue;
    return attributes;
  }

  if (typeof cause !== 'object') {
    attributes[`${key}.cause`] = String(cause);
    return attributes;
  }

  const exceptionCause = cause as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
    stack?: unknown;
  };
  if (
    typeof exceptionCause.code === 'string' ||
    typeof exceptionCause.code === 'number'
  ) {
    attributes[`${key}.cause.code`] = exceptionCause.code;
  }
  if (typeof exceptionCause.name === 'string') {
    attributes[`${key}.cause.type`] = exceptionCause.name;
  }
  if (typeof exceptionCause.message === 'string') {
    attributes[`${key}.cause.message`] = exceptionCause.message;
  }
  if (typeof exceptionCause.stack === 'string') {
    attributes[`${key}.cause.stacktrace`] = exceptionCause.stack;
  }

  if (Object.keys(attributes).length === 0) {
    attributes[`${key}.cause`] = String(cause);
  }
  return attributes;
}

/**
 * Attempts to extract an exception/error from a Winston log record.
 *
 * Winston records can carry error information in several ways depending on
 * how the user logged and which formats are configured. This function checks
 * three sources in priority order:
 *
 * 1. Named fields ('err', 'error') used by user code and Winston internals.
 * 2. Splat args (Symbol.for('splat')) used for extra positional log args.
 * 3. Flattened stack fields produced by format.errors({ stack: true }).
 *
 * @returns The extracted exception, record keys that should be excluded from
 *          OTel attributes to avoid duplication, and optional extra attributes
 *          derived from the source error (for example `error.cause.*`).
 *          Returns null if no error was found.
 */
function getExceptionPayload(record: Record<string | symbol, any>): {
  exception: unknown;
  excludedAttributes: string[];
  additionalAttributes?: LogAttributes;
} | null {
  for (const key of ['err', 'error'] as const) {
    const value = record[key];
    if (isSdkLogsExceptionCandidate(value)) {
      return {
        exception: value,
        excludedAttributes: [key],
        additionalAttributes: extractCauseAttributes(key, value),
      };
    }
  }

  const splat = record[Symbol.for('splat')];
  if (Array.isArray(splat)) {
    const splatException = splat.find(isSdkLogsExceptionCandidate);
    if (splatException !== undefined) {
      return {
        exception: splatException,
        excludedAttributes: [],
      };
    }
  }

  if (typeof record.stack === 'string') {
    const stackTypeMatch = /^([^:\n]+):/.exec(record.stack);
    const exception: {
      code?: string | number;
      name?: string;
      message?: string;
      stack: string;
    } = {
      stack: record.stack,
    };
    if (typeof record.code === 'string' || typeof record.code === 'number') {
      exception.code = record.code;
    }
    if (typeof record.name === 'string') {
      exception.name = record.name;
    } else if (stackTypeMatch) {
      exception.name = stackTypeMatch[1];
    }
    if (typeof record.message === 'string') {
      exception.message = record.message;
    }
    return {
      exception,
      excludedAttributes: ['code', 'name', 'stack'],
    };
  }

  return null;
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
  const exceptionPayload = getExceptionPayload(record);
  const excludedAttributes = new Set(
    exceptionPayload?.excludedAttributes ?? []
  );
  for (const key in splat) {
    if (
      Object.prototype.hasOwnProperty.call(splat, key) &&
      !excludedAttributes.has(key)
    ) {
      attributes[key] = splat[key];
    }
  }
  if (exceptionPayload?.additionalAttributes) {
    for (const key in exceptionPayload.additionalAttributes) {
      if (
        Object.prototype.hasOwnProperty.call(
          exceptionPayload.additionalAttributes,
          key
        )
      ) {
        attributes[key] = exceptionPayload.additionalAttributes[key];
      }
    }
  }
  const logRecord: LogRecord = {
    severityNumber: getSeverityNumber(levelSym),
    severityText: levelSym,
    body: message,
    attributes: attributes,
    ...(exceptionPayload ? { exception: exceptionPayload.exception } : {}),
  };
  logger.emit(logRecord);
}
