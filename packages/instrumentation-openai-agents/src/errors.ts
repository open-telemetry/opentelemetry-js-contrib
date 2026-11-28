/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OpenAIAgentsSpanError } from './internal-types';
import type { InvocationError } from './semconv';

const BOUNDED_ERROR_NAME_RE =
  /^(?:Error|Exception|[A-Za-z_$][A-Za-z0-9_$.]{0,127}(?:Error|Exception|TripwireTriggered))$/;

function boundedErrorName(name: string): string {
  const value = name.trim();
  return BOUNDED_ERROR_NAME_RE.test(value) ? value : '_OTHER';
}

export function extractErrorType(error: unknown): string {
  if (error instanceof Error) {
    return boundedErrorName(error.name);
  }
  if (typeof error !== 'string') {
    return '_OTHER';
  }
  const value = error.trim();
  const prefix = /^([A-Za-z_$][A-Za-z0-9_$.]{0,127}):/.exec(value)?.[1];
  return boundedErrorName(prefix ?? value);
}

export function extractErrorDetail(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return typeof error === 'string' && error ? error : fallback;
}

function makeNamedError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  err.stack = undefined;
  return err;
}

export function toInvocationError(
  spanError: OpenAIAgentsSpanError
): InvocationError {
  const errorType = extractErrorType(spanError.data?.error);
  const detail = extractErrorDetail(spanError.data?.error, spanError.message);
  return {
    errorType,
    statusDescription: spanError.message,
    exception: makeNamedError(errorType, detail),
  };
}

export function toRunInvocationError(
  error: unknown,
  fallbackDetail: string
): InvocationError {
  const errorType = extractErrorType(error);
  const detail = extractErrorDetail(error, fallbackDetail);
  return {
    errorType,
    statusDescription: detail,
    exception:
      error instanceof Error ? error : makeNamedError(errorType, detail),
  };
}
