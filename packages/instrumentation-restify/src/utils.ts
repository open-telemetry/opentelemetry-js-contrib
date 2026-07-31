/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// util.types.isPromise is supported from 10.0.0
export const isPromise = (value?: any): value is Promise<unknown> => {
  return !!(
    value &&
    typeof value.then === 'function' &&
    typeof value.catch === 'function' &&
    value.toString() === '[object Promise]'
  );
};

// util.types.isAsyncFunction is supported from 10.0.0
export const isAsyncFunction = (value?: unknown) => {
  return !!(
    value &&
    typeof value === 'function' &&
    value.constructor?.name === 'AsyncFunction'
  );
};
