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
import type * as Hapi from '@hapi/hapi';
import { VERSION } from './version';
import {
  HapiComponentName,
  HapiServerRouteInput,
  handlerPatched,
  PatchableServerRoute,
  HapiServerRouteInputMethod,
  HapiPluginInput,
  RegisterFunction,
  PatchableExtMethod,
} from './types';
import * as shimmer from 'shimmer';
import {
  getRouteMetadata,
  getPluginName,
  isLifecycleExtType,
  getExtMetadata,
} from './utils';

/** Hapi instrumentation for OpenTelemetry */
export class HapiInstrumentation extends BasePlugin<typeof Hapi> {
  static readonly component = HapiComponentName;

  constructor(readonly moduleName: string) {
    super('@opentelemetry/hapi-instrumentation', VERSION);
  }

  /**
   * Patches Hapi operations by wrapping the Hapi.server and Hapi.Server functions
   */
  protected patch(): typeof Hapi {
    this._logger.debug('Patching Hapi');
    if (this._moduleExports == null) {
      return this._moduleExports;
    }

    this._logger.debug('Patching Hapi.server');
    shimmer.wrap(
      this._moduleExports,
      'server',
      this._getServerPatch.bind(this)
    );

    // Casting as any is necessary here due to an issue with the @types/hapi__hapi
    // type definition for Hapi.Server. Hapi.Server (note the uppercase) can also function
    // as a factory function, similarly to Hapi.server (lowercase), and so should
    // also be supported and instrumented. This is an issue with the DefinitelyTyped repo.
    // Function is defined at: https://github.com/hapijs/hapi/blob/master/lib/index.js#L9
    this._logger.debug('Patching Hapi.Server');
    shimmer.wrap(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this._moduleExports as any,
      'Server',
      this._getServerPatch.bind(this)
    );

    return this._moduleExports;
  }

  /**
   * Unpatches all Hapi operations
   */
  protected unpatch(): void {
    this._logger.debug('Unpatching Hapi');
    shimmer.massUnwrap([this._moduleExports], ['server', 'Server']);
  }

  /**
   * Patches the Hapi.server and Hapi.Server functions in order to instrument
   * the server.route, server.ext, and server.register functions via calls to the
   * @function _getServerRoutePatch, @function _getServerExtPatch, and
   * @function _getServerRegisterPatch functions
   * @param original - the original Hapi Server creation function
   */
  private _getServerPatch(
    original: (options?: Hapi.ServerOptions) => Hapi.Server
  ) {
    const instrumentation = this;
    return function server(this: Hapi.Server, opts?: Hapi.ServerOptions) {
      const newServer: Hapi.Server = original.apply(this, [opts]);

      shimmer.wrap(newServer, 'route', original => {
        return instrumentation._getServerRoutePatch.bind(instrumentation)(
          original
        );
      });

      shimmer.wrap(newServer, 'ext', original => {
        return instrumentation._getServerExtPatch.bind(instrumentation)(
          original
        );
      });

      // Casting as any is necessary here due to multiple overloads on the Hapi.Server.register
      // function, which requires supporting a variety of different types of Plugin inputs
      shimmer.wrap(
        newServer,
        'register',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        instrumentation._getServerRegisterPatch.bind(instrumentation) as any
      );
      return newServer;
    };
  }

  /**
   * Patches the plugin register function used by the Hapi Server. This function
   * goes through each plugin that is being registered and adds instrumentation
   * via a call to the @function _wrapRegisterHandler function.
   * @param {RegisterFunction<T>} original - the original register function which
   * registers each plugin on the server
   */
  private _getServerRegisterPatch<T>(
    original: RegisterFunction<T>
  ): RegisterFunction<T> {
    const instrumentation = this;
    this._logger.debug('Patching Hapi.Server register function');
    return async function register(
      this: Hapi.Server,
      pluginInput: HapiPluginInput<T>,
      options?: Hapi.ServerRegisterOptions
    ) {
      if (Array.isArray(pluginInput)) {
        for (let i = 0; i < pluginInput.length; i++) {
          instrumentation._wrapRegisterHandler(pluginInput[i].plugin);
        }
      } else {
        instrumentation._wrapRegisterHandler(pluginInput.plugin);
      }
      await original.call(this, pluginInput, options);
    };
  }

  /**
   * Patches the Server.ext function which adds extension methods to the specified
   * point along the request lifecycle. This function accepts the full range of
   * accepted input into the standard Hapi `server.ext` function. For each extension,
   * it adds instrumentation to the handler via a call to the @function _wrapExtMethods
   * function.
   * @param original - the original ext function which adds the extension method to the server
   * @param {string} [pluginName] - if present, represents the name of the plugin responsible
   * for adding this server extension. Else, signifies that the extension was added directly
   */
  private _getServerExtPatch(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    original: (...args: any) => void,
    pluginName?: string
  ) {
    const instrumentation = this;
    this._logger.debug('Patching Hapi.Server ext function');
    return async function ext(
      this: Hapi.Server,
      ...args: Parameters<typeof original>
    ) {
      if (Array.isArray(args[0])) {
        const eventsList:
          | Hapi.ServerExtEventsObject[]
          | Hapi.ServerExtEventsRequestObject[] = args[0];
        for (let i = 0; i < eventsList.length; i++) {
          const eventObj:
            | Hapi.ServerExtEventsObject
            | Hapi.ServerExtEventsRequestObject = eventsList[i];
          if (isLifecycleExtType(eventObj.type)) {
            const lifecycleEventObj = eventObj as Hapi.ServerExtEventsRequestObject;
            const handler = instrumentation._wrapExtMethods(
              lifecycleEventObj.method,
              eventObj.type,
              pluginName
            );
            lifecycleEventObj.method = handler;
            eventsList[i] = lifecycleEventObj;
          }
        }
      } else if (args.length == 1) {
        const eventObj:
          | Hapi.ServerExtEventsObject
          | Hapi.ServerExtEventsRequestObject = args[0];
        if (isLifecycleExtType(eventObj.type)) {
          const lifecycleEventObj = eventObj as Hapi.ServerExtEventsRequestObject;
          const handler = instrumentation._wrapExtMethods(
            lifecycleEventObj.method,
            eventObj.type,
            pluginName
          );
          lifecycleEventObj.method = handler;
          args[0] = lifecycleEventObj;
        }
      } else {
        const type = args[0];
        if (isLifecycleExtType(type)) {
          const method: PatchableExtMethod = args[1];
          args[1] = instrumentation._wrapExtMethods(method, type, pluginName);
        }
      }
      await original.apply(this, args);
    };
  }

  /**
   * Patches the Server.route function. This function accepts either one or an array
   * of Hapi.ServerRoute objects and adds instrumentation on each route via a call to
   * the @function _wrapRouteHandler function.
   * @param {HapiServerRouteInputMethod} original - the original route function which adds
   * the route to the server
   * @param {string} [pluginName] - if present, represents the name of the plugin responsible
   * for adding this server route. Else, signifies that the route was added directly
   */
  private _getServerRoutePatch(
    original: HapiServerRouteInputMethod,
    pluginName?: string
  ) {
    const instrumentation = this;
    this._logger.debug('Patching Hapi.Server route function');
    return function route(
      this: Hapi.Server,
      route: HapiServerRouteInput
    ): void {
      if (Array.isArray(route)) {
        for (let i = 0; i < route.length; i++) {
          const newRoute = instrumentation._wrapRouteHandler.call(
            instrumentation,
            route[i],
            pluginName
          );
          route[i] = newRoute;
        }
      } else {
        route = instrumentation._wrapRouteHandler.call(
          instrumentation,
          route,
          pluginName
        );
      }
      original.apply(this, [route]);
    };
  }

  /**
   * Wraps newly registered plugins to add instrumentation to the plugin's clone of
   * the original server. Specifically, wraps the server.route and server.ext functions
   * via calls to @function _getServerRoutePatch and @function _getServerExtPatch
   * @param {Hapi.Plugin<T>} plugin - the new plugin which is being instrumented
   */
  private _wrapRegisterHandler<T>(plugin: Hapi.Plugin<T>): void {
    const instrumentation = this;
    const pluginName = getPluginName(plugin);
    const newRegisterHandler = async function (
      server: Hapi.Server,
      options: T
    ) {
      shimmer.wrap(server, 'route', original => {
        return instrumentation._getServerRoutePatch.bind(instrumentation)(
          original,
          pluginName
        );
      });
      shimmer.wrap(server, 'ext', original => {
        return instrumentation._getServerExtPatch.bind(instrumentation)(
          original,
          pluginName
        );
      });
      return await plugin.register(server, options);
    };
    plugin.register = newRegisterHandler;
  }

  /**
   * Wraps request extension methods to add instrumentation to each new extension handler.
   * Patches each individual extension in order to create the
   * span and propagate context. It does not create spans when there is no parent span.
   * @param {PatchableExtMethod | PatchableExtMethod[]} method - the request extension
   * handler which is being instrumented
   * @param {Hapi.ServerRequestExtType} extPoint - the point in the Hapi request lifecycle
   * which this extension targets
   * @param {string} [pluginName] - if present, represents the name of the plugin responsible
   * for adding this server route. Else, signifies that the route was added directly
   */
  private _wrapExtMethods(
    method: PatchableExtMethod | PatchableExtMethod[],
    extPoint: Hapi.ServerRequestExtType,
    pluginName?: string
  ): PatchableExtMethod | PatchableExtMethod[] {
    const instrumentation = this;

    if (Array.isArray(method)) {
      for (let i = 0; i < method.length; i++) {
        method[i] = instrumentation._wrapExtMethods(
          method[i],
          extPoint
        ) as PatchableExtMethod;
      }
      return method;
    }
    if (method[handlerPatched] === true) return method;
    method[handlerPatched] = true;

    const newHandler: PatchableExtMethod = async function (
      ...params: Parameters<Hapi.Lifecycle.Method>
    ) {
      if (instrumentation._tracer.getCurrentSpan() === undefined) {
        return await method(...params);
      }
      const metadata = getExtMetadata(extPoint, pluginName);
      const span = instrumentation._tracer.startSpan(metadata.name, {
        attributes: metadata.attributes,
      });
      let res;
      await instrumentation._tracer.withSpan(span, async () => {
        res = await method(...params);
      });
      span.end();
      return res;
    };
    return newHandler;
  }

  /**
   * Patches each individual route handler method in order to create the
   * span and propagate context. It does not create spans when there is no parent span.
   * @param {PatchableServerRoute} route - the route handler which is being instrumented
   * @param {string} [pluginName] - if present, represents the name of the plugin responsible
   * for adding this server route. Else, signifies that the route was added directly
   */
  private _wrapRouteHandler(
    route: PatchableServerRoute,
    pluginName?: string
  ): PatchableServerRoute {
    const instrumentation = this;
    if (route[handlerPatched] === true) return route;
    route[handlerPatched] = true;
    if (typeof route.handler === 'function') {
      const handler = route.handler as Hapi.Lifecycle.Method;
      const newHandler: Hapi.Lifecycle.Method = async function (
        request: Hapi.Request,
        h: Hapi.ResponseToolkit,
        err?: Error
      ) {
        if (instrumentation._tracer.getCurrentSpan() === undefined) {
          return await handler(request, h, err);
        }
        const metadata = getRouteMetadata(route, pluginName);
        const span = instrumentation._tracer.startSpan(metadata.name, {
          attributes: metadata.attributes,
        });
        const res = await handler(request, h, err);
        span.end();

        return res;
      };
      route.handler = newHandler;
    }
    return route;
  }
}

export const plugin = new HapiInstrumentation(HapiComponentName);
