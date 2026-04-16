/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HandleFunction, IncomingMessage, Server } from 'connect';

export const _LAYERS_STORE_PROPERTY: unique symbol = Symbol(
  'opentelemetry.instrumentation-connect.request-route-stack'
);

export type UseArgs1 = [HandleFunction];
export type UseArgs2 = [string, HandleFunction];
export type UseArgs = UseArgs1 | UseArgs2;
export type Use = (...args: UseArgs) => Server;
export type PatchedRequest = {
  [_LAYERS_STORE_PROPERTY]: string[];
} & IncomingMessage;
