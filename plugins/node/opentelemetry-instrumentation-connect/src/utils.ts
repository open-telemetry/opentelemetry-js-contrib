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
import { diag } from '@opentelemetry/api';
import { _LAYERS_STORE_PROPERTY, PatchedRequest } from './internal-types';

export const addNewStackLayer = (request: PatchedRequest) => {
  if (Array.isArray(request[_LAYERS_STORE_PROPERTY]) === false) {
    Object.defineProperty(request, _LAYERS_STORE_PROPERTY, {
      enumerable: false,
      value: [],
    });
  }
  request[_LAYERS_STORE_PROPERTY].push('/');

  const stackLength = request[_LAYERS_STORE_PROPERTY].length;

  return () => {
    if (stackLength === request[_LAYERS_STORE_PROPERTY].length) {
      request[_LAYERS_STORE_PROPERTY].pop();
    } else {
      diag.warn('Connect: Trying to pop the stack multiple time');
    }
  };
};

export const replaceCurrentStackRoute = (
  request: PatchedRequest,
  newRoute?: string
) => {
  if (newRoute) {
    request[_LAYERS_STORE_PROPERTY].splice(-1, 1, newRoute);
  }
};

// generage route from existing stack on request object.
// splash between stack layer will be dedup
// ["/first/", "/second", "/third/"] => /first/second/thrid/
export const generateRoute = (request: PatchedRequest) => {
  return request[_LAYERS_STORE_PROPERTY].reduce(
    (acc, sub) => acc.replace(/\/+$/, '') + sub
  );
};
