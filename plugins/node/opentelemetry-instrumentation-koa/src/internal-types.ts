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
import { KoaMiddleware } from './types';

/**
 * This symbol is used to mark a Koa layer as being already instrumented
 * since its possible to use a given layer multiple times (ex: middlewares)
 */
export const kLayerPatched: unique symbol = Symbol('koa-layer-patched');

export type KoaPatchedMiddleware = KoaMiddleware & {
  [kLayerPatched]?: boolean;
};

export const KoaComponentName = 'koa';
