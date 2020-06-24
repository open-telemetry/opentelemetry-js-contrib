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

import { BasePlugin } from '@opentelemetry/core';
import * as koa from 'koa';
import * as shimmer from 'shimmer';
import {
  Parameters,
  KoaMiddleware,
  KoaContext,
  KoaComponentName,
  kLayerPatched,
} from './types';
import { VERSION } from './version';
import { getMiddlewareMetadata } from './utils';

/** Koa instrumentation for OpenTelemetry */
export class KoaInstrumentation extends BasePlugin<typeof koa> {
  static readonly component = KoaComponentName;
  readonly supportedVersions = ['^2.0.0'];

  constructor(readonly moduleName: string) {
    super('@opentelemetry/koa-instrumentation', VERSION);
  }

  /**
   * Patches Koa operations by wrapping the Koa.use function
   */
  protected patch(): typeof koa {
    this._logger.debug('Patching Koa');

    if (this._moduleExports === undefined || this._moduleExports === null) {
      return this._moduleExports;
    }
    this._logger.debug('Patching Koa.use');
    const appProto = this._moduleExports.prototype;
    shimmer.wrap(appProto, 'use', this._getKoaUsePatch.bind(this));

    return this._moduleExports;
  }

  /**
   * Unpatches all Koa operations
   */
  protected unpatch(): void {
    const appProto = this._moduleExports.prototype;
    shimmer.unwrap(appProto, 'use');
  }

  /**
   * Patches the Koa.use function in order to instrument each original
   * middleware layer which is introduced
   * @param {KoaMiddleware} middleware - the original middleware function
   */
  private _getKoaUsePatch(original: (middleware: KoaMiddleware) => koa) {
    return function use(
      this: koa,
      middlewareFunction: KoaMiddleware,
      ...args: Parameters<typeof original>
    ) {
      let patchedFunction;
      if (middlewareFunction.router) {
        patchedFunction = plugin._patchRouterDispatch(middlewareFunction);
      } else {
        patchedFunction = plugin._patchLayer(middlewareFunction, false);
      }

      args[0] = patchedFunction;
      const res = original.apply(this, args);

      return res;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  /**
   * Patches the dispatch function used by @koa/router. This function
   * goes through each routed middleware and adds instrumentation via a call
   * to the @function _patchLayer function.
   * @param {KoaMiddleware} dispatchLayer - the original dispatch function which dispatches
   * routed middleware
   */
  private _patchRouterDispatch(dispatchLayer: KoaMiddleware) {
    this._logger.debug('Patching @koa/router dispatch');

    const router = dispatchLayer.router;

    const routesStack = router?.stack ?? [];
    for (const pathLayer of routesStack) {
      const path = pathLayer.path;
      const pathStack = pathLayer.stack;
      for (let j = 0; j < pathStack.length; j++) {
        const routedMiddleware: KoaMiddleware = pathStack[j];
        pathStack[j] = this._patchLayer(routedMiddleware, true, path);
      }
    }
    const dispatcher = (context: KoaContext, next: koa.Next) => {
      const result = dispatchLayer(context, next);
      return result;
    };
    return dispatcher;
  }

  /**
   * Patches each individual @param middlewareLayer function in order to create the
   * span and propagate context. It does not create spans when there is no parent span.
   * @param {KoaMiddleware} middlewareLayer - the original middleware function.
   * @param {boolean} isRouter - tracks whether the original middleware function
   * was dispatched by the router originally
   * @param {string?} layerPath - if present, provides additional data from the
   * router about the routed path which the middleware is attached to
   */
  private _patchLayer(
    middlewareLayer: KoaMiddleware,
    isRouter: boolean,
    layerPath?: string
  ): KoaMiddleware {
    if (middlewareLayer[kLayerPatched] === true) return middlewareLayer;
    middlewareLayer[kLayerPatched] = true;
    this._logger.debug('patching Koa middleware layer');
    return async (context: KoaContext, next: koa.Next) => {
      if (this._tracer.getCurrentSpan() === undefined) {
        return await middlewareLayer(context, next);
      }
      const metadata = getMiddlewareMetadata(
        context,
        middlewareLayer,
        isRouter,
        layerPath
      );
      const span = this._tracer.startSpan(metadata.name, {
        attributes: metadata.attributes,
      });
      const result = await middlewareLayer(context, next);
      span.end();
      return result;
    };
  }
}

export const plugin = new KoaInstrumentation(KoaComponentName);
