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

import * as api from '@opentelemetry/api';
import { BasePlugin } from '@opentelemetry/core';
import type * as koa from 'koa';
import * as shimmer from 'shimmer';
import {
  KoaMiddleware,
  KoaContext,
  KoaComponentName,
  kLayerPatched,
  KoaLayerType,
  AttributeNames,
  KoaPluginSpan,
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
    if (this._moduleExports === null) {
      return this._moduleExports;
    }
    this._logger.debug('Patching Koa.use');
    shimmer.wrap(this._moduleExports.prototype, 'use', this._getKoaUsePatch);

    return this._moduleExports;
  }

  /**
   * Unpatches all Koa operations
   */
  protected unpatch(): void {
    this._logger.debug('Unpatching Koa');
    shimmer.unwrap(this._moduleExports.prototype, 'use');
  }

  /**
   * Patches the Koa.use function in order to instrument each original
   * middleware layer which is introduced
   * @param {KoaMiddleware} middleware - the original middleware function
   */
  private _getKoaUsePatch(original: (middleware: KoaMiddleware) => koa) {
    return function use(this: koa, middlewareFunction: KoaMiddleware) {
      let patchedFunction: KoaMiddleware;
      if (middlewareFunction.router) {
        patchedFunction = plugin._patchRouterDispatch(middlewareFunction);
      } else {
        patchedFunction = plugin._patchLayer(middlewareFunction, false);
      }
      return original.apply(this, [patchedFunction]);
    };
  }

  /**
   * Patches the dispatch function used by @koa/router. This function
   * goes through each routed middleware and adds instrumentation via a call
   * to the @function _patchLayer function.
   * @param {KoaMiddleware} dispatchLayer - the original dispatch function which dispatches
   * routed middleware
   */
  private _patchRouterDispatch(dispatchLayer: KoaMiddleware): KoaMiddleware {
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

    return dispatchLayer;
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
      const parent = api.getSpan(api.context.active()) as KoaPluginSpan;
      if (parent === undefined) {
        return middlewareLayer(context, next);
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

      if (!parent?.parentSpanId) {
        context.request.ctx.parentSpan = parent;
      }

      if (
        metadata.attributes[AttributeNames.KOA_TYPE] === KoaLayerType.ROUTER
      ) {
        if (context.request.ctx.parentSpan.name) {
          const parentRoute = context.request.ctx.parentSpan.name.split(' ')[1];
          if (
            context._matchedRoute &&
            !context._matchedRoute.toString().includes(parentRoute)
          ) {
            context.request.ctx.parentSpan.updateName(
              `${context.method} ${context._matchedRoute}`
            );
          }
        }
      }

      return api.context.with(
        api.setSpan(api.context.active(), span),
        async () => {
          try {
            return await middlewareLayer(context, next);
          } catch (err) {
            span.recordException(err);
            throw err;
          } finally {
            span.end();
          }
        }
      );
    };
  }
}

export const plugin = new KoaInstrumentation(KoaComponentName);
