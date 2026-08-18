/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AnyValue,
  AnyValueMap,
  LogAttributes,
  LogRecord,
  Logger,
  SeverityNumber,
} from '@opentelemetry/api-logs';
import { ATTR_OTEL_EVENT_NAME } from '@opentelemetry/semantic-conventions';

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

const OTEL_CONTEXT_SYMBOL = Symbol.for(
  'opentelemetry.js.contrib.winston.context'
);
const LOG_CORRELATION_FIELDS = new Set([
  'trace_id',
  'span_id',
  'trace_flags',
]);

function getSeverityNumber(level: string): SeverityNumber | undefined {
  return npmLevels[level] ?? sysLoglevels[level] ?? cliLevels[level];
}

const CIRCULAR_REFERENCE_VALUE = '[Circular]';
const ERROR_PROPERTY_NAMES = [
  'name',
  'message',
  'stack',
  'code',
  'cause',
  'errors',
];

function isPlainObject(value: object): value is Record<string, unknown> {
  const constructor = (value as { constructor?: unknown }).constructor;
  return constructor === Object || constructor === undefined;
}

function serializeError(error: Error, ancestors: Set<object>): AnyValueMap {
  const serialized: AnyValueMap = {};
  const propertyNames = new Set([
    ...ERROR_PROPERTY_NAMES,
    ...Object.getOwnPropertyNames(error),
  ]);

  ancestors.add(error);
  for (const propertyName of propertyNames) {
    const propertyValue = (error as unknown as Record<string, unknown>)[
      propertyName
    ];
    if (propertyValue !== undefined) {
      serialized[propertyName] = normalizeAttributeValue(
        propertyValue,
        ancestors,
        true
      );
    }
  }
  ancestors.delete(error);

  return serialized;
}

function normalizeAttributeValue(
  value: unknown,
  ancestors = new Set<object>(),
  stringifyUnsupported = false
): AnyValue {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Uint8Array
  ) {
    return value;
  }

  if (typeof value !== 'object') {
    return stringifyUnsupported ? String(value) : (value as AnyValue);
  }

  if (ancestors.has(value)) {
    return CIRCULAR_REFERENCE_VALUE;
  }

  if (value instanceof Error) {
    return serializeError(value, ancestors);
  }

  if (Array.isArray(value)) {
    ancestors.add(value);
    const normalized = value.map(item =>
      normalizeAttributeValue(item, ancestors, stringifyUnsupported)
    );
    ancestors.delete(value);
    return normalized;
  }

  if (isPlainObject(value)) {
    ancestors.add(value);
    const normalized: AnyValueMap = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        normalized[key] = normalizeAttributeValue(
          value[key],
          ancestors,
          stringifyUnsupported
        );
      }
    }
    ancestors.delete(value);
    return normalized;
  }

  return stringifyUnsupported ? String(value) : (value as AnyValue);
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
  const { [ATTR_OTEL_EVENT_NAME]: eventName, ...rest } = splat;
  const attributes: LogAttributes = {};
  // Ensures the log level is read from a symbol property, avoiding any
  // accidental inclusion of ANSI color codes that may be present in the string
  // property.
  const levelSym = record[Symbol.for('level')];
  const exceptionPayload = getExceptionPayload(record);
  const excludedAttributes = new Set(
    exceptionPayload?.excludedAttributes ?? []
  );
  for (const key in rest) {
    if (
      Object.prototype.hasOwnProperty.call(rest, key) &&
      !excludedAttributes.has(key) &&
      !LOG_CORRELATION_FIELDS.has(key)
    ) {
      attributes[key] = normalizeAttributeValue(rest[key]);
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
  const normalizedEventName =
    typeof eventName === 'string' ? eventName : undefined;
  const context = record[OTEL_CONTEXT_SYMBOL];

  const logRecord: LogRecord = {
    severityNumber: getSeverityNumber(levelSym),
    severityText: levelSym,
    body: message,
    attributes: attributes,
    ...(context ? { context } : {}),
    ...(exceptionPayload ? { exception: exceptionPayload.exception } : {}),
    ...(normalizedEventName !== undefined
      ? { eventName: normalizedEventName }
      : {}),
  };
  logger.emit(logRecord);
}
