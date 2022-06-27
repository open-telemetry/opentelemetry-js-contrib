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

import * as constants from './constants';
import * as types from './types';

// Detect whether a function is a router package internal plumming handler
export const isInternal = (fn: Function) => {
  // Note that both of those functions are sync
  if (fn.name === 'handle' && fn.toString() === constants.ROUTER_HANDLE_FN) {
    return true;
  }
  if (fn.name === 'router' && fn.toString() === constants.ROUTE_ROUTER_FN) {
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
