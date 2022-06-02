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

import {
  hrTime,
  setRPCMetadata,
  getRPCMetadata,
  RPCType,
} from '@opentelemetry/core';
import { trace, context, diag, SpanAttributes } from '@opentelemetry/api';
import type * as express from 'express';
import {
  ExpressLayer,
  ExpressRouter,
  PatchedRequest,
  _LAYERS_STORE_PROPERTY,
  ExpressInstrumentationConfig,
  ExpressRequestInfo,
} from './types';
import { ExpressLayerType } from './enums/ExpressLayerType';
import { AttributeNames } from './enums/AttributeNames';
import { getLayerMetadata, storeLayerPath, isLayerIgnored } from './utils';
import { VERSION } from './version';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

/**
 * This symbol is used to mark express layer as being already instrumented
 * since its possible to use a given layer multiple times (ex: middlewares)
 */
export const kLayerPatched: unique symbol = Symbol('express-layer-patched');

/** Express instrumentation for OpenTelemetry */
export class ExpressInstrumentation extends InstrumentationBase<
  typeof express
> {
  constructor(config: ExpressInstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-express',
      VERSION,
      Object.assign({}, config)
    );
  }

  override setConfig(config: ExpressInstrumentationConfig = {}) {
    this._config = Object.assign({}, config);
  }

  override getConfig(): ExpressInstrumentationConfig {
    return this._config as ExpressInstrumentationConfig;
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition<typeof express>(
        'express',
        ['^4.0.0'],
        (moduleExports, moduleVersion) => {
          diag.debug(`Applying patch for express@${moduleVersion}`);
          const routerProto = moduleExports.Router as unknown as express.Router;
          // patch express.Router.route
          if (isWrapped(routerProto.route)) {
            this._unwrap(routerProto, 'route');
          }
          this._wrap(routerProto, 'route', this._getRoutePatch());
          // patch express.Router.use
          if (isWrapped(routerProto.use)) {
            this._unwrap(routerProto, 'use');
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this._wrap(routerProto, 'use', this._getRouterUsePatch() as any);
          // patch express.Application.use
          if (isWrapped(moduleExports.application.use)) {
            this._unwrap(moduleExports.application, 'use');
          }
          this._wrap(
            moduleExports.application,
            'use',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this._getAppUsePatch() as any
          );
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          if (moduleExports === undefined) return;
          diag.debug(`Removing patch for express@${moduleVersion}`);
          const routerProto = moduleExports.Router as unknown as express.Router;
          this._unwrap(routerProto, 'route');
          this._unwrap(routerProto, 'use');
          this._unwrap(moduleExports.application, 'use');
        }
      ),
    ];
  }

  /**
   * Get the patch for Router.route function
   */
  private _getRoutePatch() {
    const instrumentation = this;
    return function (original: express.Router['route']) {
      return function route_trace(
        this: ExpressRouter,
        ...args: Parameters<typeof original>
      ) {
        const route = original.apply(this, args);
        const layer = this.stack[this.stack.length - 1] as ExpressLayer;
        instrumentation._applyPatch(
          layer,
          typeof args[0] === 'string' ? args[0] : undefined
        );
        return route;
      };
    };
  }

  /**
   * Get the patch for Router.use function
   */
  private _getRouterUsePatch() {
    const instrumentation = this;
    return function (original: express.Router['use']) {
      return function use(
        this: express.Application,
        ...args: Parameters<typeof original>
      ) {
        const route = original.apply(this, args);
        const layer = this.stack[this.stack.length - 1] as ExpressLayer;
        instrumentation._applyPatch(
          layer,
          typeof args[0] === 'string' ? args[0] : undefined
        );
        return route;
      };
    };
  }

  /**
   * Get the patch for Application.use function
   */
  private _getAppUsePatch() {
    const instrumentation = this;
    return function (original: express.Application['use']) {
      return function use(
        this: { _router: ExpressRouter },
        ...args: Parameters<typeof original>
      ) {
        const route = original.apply(this, args);
        const layer = this._router.stack[this._router.stack.length - 1];
        instrumentation._applyPatch.call(
          instrumentation,
          layer,
          typeof args[0] === 'string' ? args[0] : undefined
        );
        return route;
      };
    };
  }

  /** Patch each express layer to create span and propagate context */
  private _applyPatch(
    this: ExpressInstrumentation,
    layer: ExpressLayer,
    layerPath?: string
  ) {
    const instrumentation = this;
    // avoid patching multiple times the same layer
    if (layer[kLayerPatched] === true) return;
    layer[kLayerPatched] = true;

    this._wrap(layer, 'handle', (original: Function) => {
      if (original.length === 4) return original;
      return function (
        this: ExpressLayer,
        req: PatchedRequest,
        res: express.Response
      ) {
        storeLayerPath(req, layerPath);
        const route = (req[_LAYERS_STORE_PROPERTY] as string[])
          .filter(path => path !== '/' && path !== '/*')
          .join('');
        const attributes: SpanAttributes = {
          [SemanticAttributes.HTTP_ROUTE]: route.length > 0 ? route : '/',
        };
        const metadata = getLayerMetadata(layer, layerPath);
        const type = metadata.attributes[
          AttributeNames.EXPRESS_TYPE
        ] as ExpressLayerType;

        // Rename the root http span in case we haven't done it already
        // once we reach the request handler
        const rpcMetadata = getRPCMetadata(context.active());
        if (
          metadata.attributes[AttributeNames.EXPRESS_TYPE] ===
            ExpressLayerType.REQUEST_HANDLER &&
          rpcMetadata?.type === RPCType.HTTP
        ) {
          const name = instrumentation._getSpanName(
            {
              request: req,
              route,
            },
            `${req.method} ${route.length > 0 ? route : '/'}`
          );
          rpcMetadata.span.updateName(name);
        }

        // verify against the config if the layer should be ignored
        if (isLayerIgnored(metadata.name, type, instrumentation._config)) {
          if (type === ExpressLayerType.MIDDLEWARE) {
            (req[_LAYERS_STORE_PROPERTY] as string[]).pop();
          }
          return original.apply(this, arguments);
        }
        if (trace.getSpan(context.active()) === undefined) {
          return original.apply(this, arguments);
        }

        const spanName = instrumentation._getSpanName(
          {
            request: req,
            layerType: type,
            route,
          },
          metadata.name
        );
        const span = instrumentation.tracer.startSpan(spanName, {
          attributes: Object.assign(attributes, metadata.attributes),
        });
        const startTime = hrTime();
        let spanHasEnded = false;
        // If we found anything that isnt a middleware, there no point of measuring
        // their time since they dont have callback.
        if (
          metadata.attributes[AttributeNames.EXPRESS_TYPE] !==
          ExpressLayerType.MIDDLEWARE
        ) {
          span.end(startTime);
          spanHasEnded = true;
        }
        // listener for response.on('finish')
        const onResponseFinish = () => {
          if (spanHasEnded === false) {
            spanHasEnded = true;
            span.end(startTime);
          }
        };
        // verify we have a callback
        const args = Array.from(arguments);
        const callbackIdx = args.findIndex(arg => typeof arg === 'function');
        const newContext =
          rpcMetadata?.type === RPCType.HTTP
            ? setRPCMetadata(
                context.active(),
                Object.assign(rpcMetadata, { route: route })
              )
            : context.active();
        if (callbackIdx >= 0) {
          arguments[callbackIdx] = function () {
            if (spanHasEnded === false) {
              spanHasEnded = true;
              req.res?.removeListener('finish', onResponseFinish);
              span.end();
            }
            if (!(req.route && arguments[0] instanceof Error)) {
              (req[_LAYERS_STORE_PROPERTY] as string[]).pop();
            }
            const callback = args[callbackIdx] as Function;
            return context.bind(newContext, callback).apply(this, arguments);
          };
        }
        const result = original.apply(this, arguments);
        /**
         * At this point if the callback wasn't called, that means either the
         * layer is asynchronous (so it will call the callback later on) or that
         * the layer directly end the http response, so we'll hook into the "finish"
         * event to handle the later case.
         */
        if (!spanHasEnded) {
          res.once('finish', onResponseFinish);
        }
        return result;
      };
    });
  }

  _getSpanName(info: ExpressRequestInfo, defaultName: string) {
    const hook = this.getConfig().spanNameHook;

    if (!(hook instanceof Function)) {
      return defaultName;
    }

    try {
      return hook(info, defaultName) ?? defaultName;
    } catch (err) {
      diag.error(
        'express instrumentation: error calling span name rewrite hook',
        err
      );
      return defaultName;
    }
  }
}
