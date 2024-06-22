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

import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import {
  trace,
  context,
  diag,
  Attributes,
  SpanStatusCode,
} from '@opentelemetry/api';
import type * as express from 'express';
import { ExpressInstrumentationConfig, ExpressRequestInfo } from './types';
import { ExpressLayerType } from './enums/ExpressLayerType';
import { AttributeNames } from './enums/AttributeNames';
import {
  asErrorAndMessage,
  getLayerMetadata,
  getLayerPath,
  isLayerIgnored,
  storeLayerPath,
} from './utils';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { SEMATTRS_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  ExpressLayer,
  ExpressRouter,
  kLayerPatched,
  PatchedRequest,
  _LAYERS_STORE_PROPERTY,
} from './internal-types';

/** Express instrumentation for OpenTelemetry */
export class ExpressInstrumentation extends InstrumentationBase {
  constructor(config: ExpressInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  override setConfig(config: ExpressInstrumentationConfig = {}) {
    this._config = Object.assign({}, config);
  }

  override getConfig(): ExpressInstrumentationConfig {
    return this._config as ExpressInstrumentationConfig;
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition(
        'express',
        ['>=4.0.0 <5'],
        moduleExports => {
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
        moduleExports => {
          if (moduleExports === undefined) return;
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
        instrumentation._applyPatch(layer, getLayerPath(args));
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
        instrumentation._applyPatch(layer, getLayerPath(args));
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
        instrumentation._applyPatch(layer, getLayerPath(args));
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

    this._wrap(layer, 'handle', original => {
      // TODO: instrument error handlers
      if (original.length === 4) return original;

      const patched = function (
        this: ExpressLayer,
        req: PatchedRequest,
        res: express.Response
      ) {
        storeLayerPath(req, layerPath);
        const route = (req[_LAYERS_STORE_PROPERTY] as string[])
          .filter(path => path !== '/' && path !== '/*')
          .join('')
          // remove duplicate slashes to normalize route
          .replace(/\/{2,}/g, '/');

        const attributes: Attributes = {
          [SEMATTRS_HTTP_ROUTE]: route.length > 0 ? route : '/',
        };
        const metadata = getLayerMetadata(layer, layerPath);
        const type = metadata.attributes[
          AttributeNames.EXPRESS_TYPE
        ] as ExpressLayerType;

        const rpcMetadata = getRPCMetadata(context.active());
        if (rpcMetadata?.type === RPCType.HTTP) {
          rpcMetadata.route = route || '/';
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

        if (instrumentation.getConfig().requestHook) {
          safeExecuteInTheMiddle(
            () =>
              instrumentation.getConfig().requestHook!(span, {
                request: req,
                layerType: type,
                route,
              }),
            e => {
              if (e) {
                diag.error('express instrumentation: request hook failed', e);
              }
            },
            true
          );
        }

        let spanHasEnded = false;
        if (
          metadata.attributes[AttributeNames.EXPRESS_TYPE] !==
          ExpressLayerType.MIDDLEWARE
        ) {
          span.end();
          spanHasEnded = true;
        }
        // listener for response.on('finish')
        const onResponseFinish = () => {
          if (spanHasEnded === false) {
            spanHasEnded = true;
            span.end();
          }
        };

        // verify we have a callback
        const args = Array.from(arguments);
        const callbackIdx = args.findIndex(arg => typeof arg === 'function');
        if (callbackIdx >= 0) {
          arguments[callbackIdx] = function () {
            // express considers anything but an empty value, "route" or "router"
            // passed to its callback to be an error
            const maybeError = arguments[0];
            const isError = ![undefined, null, 'route', 'router'].includes(
              maybeError
            );
            if (!spanHasEnded && isError) {
              const [error, message] = asErrorAndMessage(maybeError);
              span.recordException(error);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message,
              });
            }

            if (spanHasEnded === false) {
              spanHasEnded = true;
              req.res?.removeListener('finish', onResponseFinish);
              span.end();
            }
            if (!(req.route && isError)) {
              (req[_LAYERS_STORE_PROPERTY] as string[]).pop();
            }
            const callback = args[callbackIdx] as Function;
            return callback.apply(this, arguments);
          };
        }

        try {
          return original.apply(this, arguments);
        } catch (anyError) {
          const [error, message] = asErrorAndMessage(anyError);
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message,
          });
          throw anyError;
        } finally {
          /**
           * At this point if the callback wasn't called, that means either the
           * layer is asynchronous (so it will call the callback later on) or that
           * the layer directly end the http response, so we'll hook into the "finish"
           * event to handle the later case.
           */
          if (!spanHasEnded) {
            res.once('finish', onResponseFinish);
          }
        }
      };

      // `handle` isn't just a regular function in some cases. It also contains
      // some properties holding metadata and state so we need to proxy them
      // through through patched function
      // ref: https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1950
      // Also some apps/libs do their own patching before OTEL and have these properties
      // in the proptotype. So we use a `for...in` loop to get own properties and also
      // any enumerable prop in the prototype chain
      // ref: https://github.com/open-telemetry/opentelemetry-js-contrib/issues/2271
      for (let key in original) {
        Object.defineProperty(patched, key, {
          get() {
            return original[key];
          },
          set(value) {
            original[key] = value;
          },
        });
      }
      return patched;
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
