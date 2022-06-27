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
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';

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
  ServerExtDirectInput,
} from './types';
import {
  getRouteMetadata,
  getPluginName,
  isLifecycleExtType,
  isLifecycleExtEventObj,
  getExtMetadata,
  isDirectExtInput,
  isPatchableExtMethod,
  getRootSpanMetadata,
} from './utils';

/** Hapi instrumentation for OpenTelemetry */
export class HapiInstrumentation extends InstrumentationBase {
  constructor(config?: InstrumentationConfig) {
    super('@opentelemetry/instrumentation-hapi', VERSION, config);
  }

  protected init() {
    return new InstrumentationNodeModuleDefinition<typeof Hapi>(
      HapiComponentName,
      ['>=17.0.0'],
      moduleExports => {
        if (!isWrapped(moduleExports.server)) {
          api.diag.debug('Patching Hapi.server');
          this._wrap(moduleExports, 'server', this._getServerPatch.bind(this));
        }

        // Casting as any is necessary here due to an issue with the @types/hapi__hapi
        // type definition for Hapi.Server. Hapi.Server (note the uppercase) can also function
        // as a factory function, similarly to Hapi.server (lowercase), and so should
        // also be supported and instrumented. This is an issue with the DefinitelyTyped repo.
        // Function is defined at: https://github.com/hapijs/hapi/blob/main/lib/index.js#L9
        if (!isWrapped(moduleExports.Server)) {
          api.diag.debug('Patching Hapi.Server');
          this._wrap(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            moduleExports as any,
            'Server',
            this._getServerPatch.bind(this)
          );
        }
        return moduleExports;
      },
      moduleExports => {
        api.diag.debug('Unpatching Hapi');
        this._massUnwrap([moduleExports], ['server', 'Server']);
      }
    );
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
    const instrumentation: HapiInstrumentation = this;
    const self = this;
    return function server(this: Hapi.Server, opts?: Hapi.ServerOptions) {
      const newServer: Hapi.Server = original.apply(this, [opts]);

      self._wrap(newServer, 'route', originalRouter => {
        return instrumentation._getServerRoutePatch.bind(instrumentation)(
          originalRouter
        );
      });

      // Casting as any is necessary here due to multiple overloads on the Hapi.ext
      // function, which requires supporting a variety of different parameters
      // as extension inputs
      self._wrap(newServer, 'ext', originalExtHandler => {
        return instrumentation._getServerExtPatch.bind(instrumentation)(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          originalExtHandler as any
        );
      });

      // Casting as any is necessary here due to multiple overloads on the Hapi.Server.register
      // function, which requires supporting a variety of different types of Plugin inputs
      self._wrap(
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
    const instrumentation: HapiInstrumentation = this;
    api.diag.debug('Patching Hapi.Server register function');
    return function register(
      this: Hapi.Server,
      pluginInput: HapiPluginInput<T>,
      options?: Hapi.ServerRegisterOptions
    ) {
      if (Array.isArray(pluginInput)) {
        for (const pluginObj of pluginInput) {
          instrumentation._wrapRegisterHandler(
            pluginObj.plugin?.plugin ?? pluginObj.plugin
          );
        }
      } else {
        instrumentation._wrapRegisterHandler(
          pluginInput.plugin?.plugin ?? pluginInput.plugin ?? pluginInput
        );
      }
      return original.apply(this, [pluginInput, options]);
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
    original: (...args: unknown[]) => unknown,
    pluginName?: string
  ) {
    const instrumentation: HapiInstrumentation = this;
    api.diag.debug('Patching Hapi.Server ext function');

    return function ext(
      this: ThisParameterType<typeof original>,
      ...args: Parameters<typeof original>
    ) {
      if (Array.isArray(args[0])) {
        const eventsList:
          | Hapi.ServerExtEventsObject[]
          | Hapi.ServerExtEventsRequestObject[] = args[0];
        for (let i = 0; i < eventsList.length; i++) {
          const eventObj = eventsList[i];
          if (isLifecycleExtType(eventObj.type)) {
            const lifecycleEventObj =
              eventObj as Hapi.ServerExtEventsRequestObject;
            const handler = instrumentation._wrapExtMethods(
              lifecycleEventObj.method,
              eventObj.type,
              pluginName
            );
            lifecycleEventObj.method = handler;
            eventsList[i] = lifecycleEventObj;
          }
        }
        return original.apply(this, args);
      } else if (isDirectExtInput(args)) {
        const extInput: ServerExtDirectInput = args;
        const method: PatchableExtMethod = extInput[1];
        const handler = instrumentation._wrapExtMethods(
          method,
          extInput[0],
          pluginName
        );
        return original.apply(this, [extInput[0], handler, extInput[2]]);
      } else if (isLifecycleExtEventObj(args[0])) {
        const lifecycleEventObj = args[0];
        const handler = instrumentation._wrapExtMethods(
          lifecycleEventObj.method,
          lifecycleEventObj.type,
          pluginName
        );
        lifecycleEventObj.method = handler;
        return original.call(this, lifecycleEventObj);
      }
      return original.apply(this, args);
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
    const instrumentation: HapiInstrumentation = this;
    api.diag.debug('Patching Hapi.Server route function');
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
      return original.apply(this, [route]);
    };
  }

  /**
   * Wraps newly registered plugins to add instrumentation to the plugin's clone of
   * the original server. Specifically, wraps the server.route and server.ext functions
   * via calls to @function _getServerRoutePatch and @function _getServerExtPatch
   * @param {Hapi.Plugin<T>} plugin - the new plugin which is being instrumented
   */
  private _wrapRegisterHandler<T>(plugin: Hapi.Plugin<T>): void {
    const instrumentation: HapiInstrumentation = this;
    const pluginName = getPluginName(plugin);
    const oldHandler = plugin.register;
    const self = this;
    const newRegisterHandler = function (server: Hapi.Server, options: T) {
      self._wrap(server, 'route', original => {
        return instrumentation._getServerRoutePatch.bind(instrumentation)(
          original,
          pluginName
        );
      });

      // Casting as any is necessary here due to multiple overloads on the Hapi.ext
      // function, which requires supporting a variety of different parameters
      // as extension inputs
      self._wrap(server, 'ext', originalExtHandler => {
        return instrumentation._getServerExtPatch.bind(instrumentation)(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          originalExtHandler as any,
          pluginName
        );
      });
      return oldHandler(server, options);
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
  private _wrapExtMethods<T extends PatchableExtMethod | PatchableExtMethod[]>(
    method: T,
    extPoint: Hapi.ServerRequestExtType,
    pluginName?: string
  ): T {
    const instrumentation: HapiInstrumentation = this;

    if (method instanceof Array) {
      for (let i = 0; i < method.length; i++) {
        method[i] = instrumentation._wrapExtMethods(
          method[i],
          extPoint
        ) as PatchableExtMethod;
      }
      return method;
    } else if (isPatchableExtMethod(method)) {
      if (method[handlerPatched] === true) return method;
      method[handlerPatched] = true;

      const newHandler: PatchableExtMethod = async function (
        ...params: Parameters<Hapi.Lifecycle.Method>
      ) {
        if (api.trace.getSpan(api.context.active()) === undefined) {
          return await method(...params);
        }
        const metadata = getExtMetadata(extPoint, pluginName);
        const span = instrumentation.tracer.startSpan(metadata.name, {
          attributes: metadata.attributes,
        });
        try {
          return await api.context.with<
            Parameters<Hapi.Lifecycle.Method>,
            Hapi.Lifecycle.Method
          >(
            api.trace.setSpan(api.context.active(), span),
            method,
            undefined,
            ...params
          );
        } catch (err) {
          span.recordException(err);
          span.setStatus({
            code: api.SpanStatusCode.ERROR,
            message: err.message,
          });
          throw err;
        } finally {
          span.end();
        }
      };
      return newHandler as T;
    }
    return method;
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
    const instrumentation: HapiInstrumentation = this;
    if (route[handlerPatched] === true) return route;
    route[handlerPatched] = true;
    const oldHandler = route.options?.handler ?? route.handler;
    if (typeof oldHandler === 'function') {
      const newHandler: Hapi.Lifecycle.Method = async function (
        request: Hapi.Request,
        h: Hapi.ResponseToolkit,
        err?: Error
      ) {
        if (api.trace.getSpan(api.context.active()) === undefined) {
          return await oldHandler(request, h, err);
        }
        const rpcMetadata = getRPCMetadata(api.context.active());
        if (rpcMetadata?.type === RPCType.HTTP) {
          const rootSpanMetadata = getRootSpanMetadata(route);
          rpcMetadata.span.updateName(rootSpanMetadata.name);
          rpcMetadata.span.setAttributes(rootSpanMetadata.attributes);
        }
        const metadata = getRouteMetadata(route, pluginName);
        const span = instrumentation.tracer.startSpan(metadata.name, {
          attributes: metadata.attributes,
        });
        try {
          return await oldHandler(request, h, err);
        } catch (err) {
          span.recordException(err);
          span.setStatus({
            code: api.SpanStatusCode.ERROR,
            message: err.message,
          });
          throw err;
        } finally {
          span.end();
        }
      };
      if (route.options?.handler) {
        route.options.handler = newHandler;
      } else {
        route.handler = newHandler;
      }
    }
    return route;
  }
}
