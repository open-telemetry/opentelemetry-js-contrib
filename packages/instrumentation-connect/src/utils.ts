/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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

// generate route from existing stack on request object.
// splash between stack layer will be deduped
// ["/first/", "/second", "/third/"] => /first/second/third/
export const generateRoute = (request: PatchedRequest) => {
  return request[_LAYERS_STORE_PROPERTY].reduce(
    (acc, sub) => acc.replace(/\/+$/, '') + sub
  );
};
