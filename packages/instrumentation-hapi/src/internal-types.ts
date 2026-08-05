/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as Hapi from '@hapi/hapi';

export const HapiComponentName = '@hapi/hapi';

/**
 * This symbol is used to mark a Hapi route handler or server extension handler as
 * already patched, since its possible to use these handlers multiple times
 * i.e. when allowing multiple versions of one plugin, or when registering a plugin
 * multiple times on different servers.
 */
export const handlerPatched: unique symbol = Symbol('hapi-handler-patched');

export type HapiServerRouteInputMethod = (route: HapiServerRouteInput) => void;

export type HapiServerRouteInput =
  | PatchableServerRoute
  | PatchableServerRoute[];

export type PatchableServerRoute = Hapi.ServerRoute<any> & {
  [handlerPatched]?: boolean;
};

export type HapiPluginObject<T> = Hapi.ServerRegisterPluginObject<T>;

export type HapiPluginInput<T> =
  | HapiPluginObject<T>
  | Array<HapiPluginObject<T>>;

export type RegisterFunction<T> = (
  plugin: HapiPluginInput<T>,
  options?: Hapi.ServerRegisterOptions
) => Promise<void>;

export type PatchableExtMethod = Hapi.Lifecycle.Method & {
  [handlerPatched]?: boolean;
};

export type ServerExtDirectInput = [
  Hapi.ServerRequestExtType,
  Hapi.Lifecycle.Method,
  (Hapi.ServerExtOptions | undefined)?,
];

export const HapiLayerType = {
  ROUTER: 'router',
  PLUGIN: 'plugin',
  EXT: 'server.ext',
};

export const HapiLifecycleMethodNames = new Set([
  'onPreAuth',
  'onCredentials',
  'onPostAuth',
  'onPreHandler',
  'onPostHandler',
  'onPreResponse',
  'onRequest',
]);
