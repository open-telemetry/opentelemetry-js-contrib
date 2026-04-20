/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RouterConstants } from './constants';
import * as types from './internal-types';

// Detect whether a function is a router package internal plumbing handler
export const isInternal = (fn: Function, constants?: RouterConstants) => {
  // Note that both of those functions are sync
  if (fn.name === 'handle' && fn.toString() === constants?.handleFunctionBody) {
    return true;
  }
  if (fn.name === 'router' && fn.toString() === constants?.routeFunctionBody) {
    return true;
  }
  return false;
};

export const renameHttpSpan = (
  span?: types.InstrumentationSpan,
  method?: string,
  route?: string
) => {
  if (
    typeof method === 'string' &&
    typeof route === 'string' &&
    span?.name?.startsWith('HTTP ')
  ) {
    span.updateName(`${method.toUpperCase()} ${route}`);
  }
};

export const once = (fn: Function) => {
  let run = true;
  return () => {
    if (run) {
      run = false;
      fn();
    }
  };
};
