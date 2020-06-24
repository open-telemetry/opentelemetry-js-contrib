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
import { Middleware, ParameterizedContext, DefaultState } from 'koa';
import { RouterParamContext } from '@koa/router';
import Router = require('@koa/router');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Parameters<T> = T extends (...args: infer T) => any ? T : unknown[];

/**
 * This symbol is used to mark a Koa layer as being already instrumented
 * since its possible to use a given layer multiple times (ex: middlewares)
 */
export const kLayerPatched: unique symbol = Symbol('koa-layer-patched');

export type KoaMiddleware = Middleware<DefaultState, KoaContext> & {
  [kLayerPatched]?: boolean;
  router?: Router;
};

export type KoaContext = ParameterizedContext<DefaultState, RouterParamContext>;

export enum AttributeNames {
  COMPONENT = 'component',
  HTTP_ROUTE = 'http.route',
  KOA_TYPE = 'koa.type',
  KOA_NAME = 'koa.name',
}

export enum KoaLayerType {
  ROUTER = 'router',
  MIDDLEWARE = 'middleware',
}

export const KoaComponentName = 'koa';
