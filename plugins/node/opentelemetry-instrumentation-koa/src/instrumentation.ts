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
import {
  isWrapped,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';

import type * as koa from 'koa';
import {
  KoaMiddleware,
  KoaContext,
  KoaLayerType,
  KoaInstrumentationConfig,
} from './types';
import { AttributeNames } from './enums/AttributeNames';
import { VERSION } from './version';
import { getMiddlewareMetadata, isLayerIgnored } from './utils';
import { getRPCMetadata, RPCType, setRPCMetadata } from '@opentelemetry/core';
import {
  kLayerPatched,
  KoaComponentName,
  KoaPatchedMiddleware,
} from './internal-types';

/** Koa instrumentation for OpenTelemetry */
export class KoaInstrumentation extends InstrumentationBase<typeof koa> {
  static readonly component = KoaComponentName;
  constructor(config: KoaInstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-koa',
      VERSION,
      Object.assign({}, config)
    );
  }

  override setConfig(config: KoaInstrumentationConfig = {}) {
    this._config = Object.assign({}, config);
  }

  override getConfig(): KoaInstrumentationConfig {
    return this._config as KoaInstrumentationConfig;
  }

  protected init() {
    return new InstrumentationNodeModuleDefinition<typeof koa>(
      'koa',
      ['^2.0.0'],
      moduleExports => {
        if (moduleExports == null) {
          return moduleExports;
        }
        api.diag.debug('Patching Koa');
        if (isWrapped(moduleExports.prototype.use)) {
          this._unwrap(moduleExports.prototype, 'use');
        }
        this._wrap(
          moduleExports.prototype,
          'use',
          this._getKoaUsePatch.bind(this)
        );
        return moduleExports;
      },
      moduleExports => {
        api.diag.debug('Unpatching Koa');
        if (isWrapped(moduleExports.prototype.use)) {
          this._unwrap(moduleExports.prototype, 'use');
        }
      }
    );
  }

  /**
   * Patches the Koa.use function in order to instrument each original
   * middleware layer which is introduced
   * @param {KoaMiddleware} middleware - the original middleware function
   */
  private _getKoaUsePatch(original: (middleware: KoaMiddleware) => koa) {
    const plugin = this;
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
    api.diag.debug('Patching @koa/router dispatch');

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
    middlewareLayer: KoaPatchedMiddleware,
    isRouter: boolean,
    layerPath?: string
  ): KoaMiddleware {
    const layerType = isRouter ? KoaLayerType.ROUTER : KoaLayerType.MIDDLEWARE;
    // Skip patching layer if its ignored in the config
    if (
      middlewareLayer[kLayerPatched] === true ||
      isLayerIgnored(layerType, this.getConfig())
    )
      return middlewareLayer;

    if (
      middlewareLayer.constructor.name === 'GeneratorFunction' ||
      middlewareLayer.constructor.name === 'AsyncGeneratorFunction'
    ) {
      api.diag.debug('ignoring generator-based Koa middleware layer');
      return middlewareLayer;
    }

    middlewareLayer[kLayerPatched] = true;

    api.diag.debug('patching Koa middleware layer');
    return async (context: KoaContext, next: koa.Next) => {
      const parent = api.trace.getSpan(api.context.active());
      if (parent === undefined) {
        return middlewareLayer(context, next);
      }
      const metadata = getMiddlewareMetadata(
        context,
        middlewareLayer,
        isRouter,
        layerPath
      );
      const span = this.tracer.startSpan(metadata.name, {
        attributes: metadata.attributes,
      });

      const rpcMetadata = getRPCMetadata(api.context.active());

      if (
        metadata.attributes[AttributeNames.KOA_TYPE] === KoaLayerType.ROUTER &&
        rpcMetadata?.type === RPCType.HTTP
      ) {
        rpcMetadata.span.updateName(
          `${context.method} ${context._matchedRoute}`
        );
      }

      let newContext = api.trace.setSpan(api.context.active(), span);
      if (rpcMetadata?.type === RPCType.HTTP) {
        newContext = setRPCMetadata(
          newContext,
          Object.assign(rpcMetadata, { route: context._matchedRoute })
        );
      }

      if (this.getConfig().requestHook) {
        safeExecuteInTheMiddle(
          () =>
            this.getConfig().requestHook!(span, {
              context,
              middlewareLayer,
              layerType,
            }),
          e => {
            if (e) {
              api.diag.error('koa instrumentation: request hook failed', e);
            }
          },
          true
        );
      }

      return api.context.with(newContext, async () => {
        try {
          return await middlewareLayer(context, next);
        } catch (err) {
          span.recordException(err);
          throw err;
        } finally {
          span.end();
        }
      });
    };
  }
}
