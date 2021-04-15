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
import * as restify from 'restify';
import { Server } from 'restify';
import * as types from './types';
import { VERSION } from './version';
import * as constants from './constants';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { HttpAttribute } from '@opentelemetry/semantic-conventions';
import { types as checkType } from 'util';

const { diag } = api;

export class RestifyInstrumentation extends InstrumentationBase<
  typeof restify
> {
  constructor() {
    super(`@opentelemetry/instrumentation-${constants.MODULE_NAME}`, VERSION);
  }

  private _moduleVersion?: string;
  private _isDisabled = false;

  init() {
    const module = new InstrumentationNodeModuleDefinition<typeof restify>(
      constants.MODULE_NAME,
      constants.SUPPORTED_VERSIONS,
      (moduleExports, moduleVersion) => {
        this._moduleVersion = moduleVersion;
        return moduleExports;
      }
    );

    module.files.push(
      new InstrumentationNodeModuleFile<typeof restify>(
        'restify/lib/server.js',
        constants.SUPPORTED_VERSIONS,
        (moduleExports, moduleVersion) => {
          diag.debug(`Applying patch for ${constants.MODULE_NAME}@${moduleVersion}`);
          this._isDisabled = false;
          const Server: any = moduleExports;
          for (const name of constants.RESTIFY_METHODS) {
            if (isWrapped(Server.prototype[name])) {
              this._unwrap(Server.prototype, name);
            }
            this._wrap(
              Server.prototype,
              name as keyof Server,
              this._methodPatcher.bind(this)
            );
          }
          for (const name of constants.RESTIFY_MW_METHODS) {
            if (isWrapped(Server.prototype[name])) {
              this._unwrap(Server.prototype, name);
            }
            this._wrap(
              Server.prototype,
              name as keyof Server,
              this._middlewarePatcher.bind(this)
            );
          }
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          diag.debug(`Removing patch for ${constants.MODULE_NAME}@${moduleVersion}`);
          this._isDisabled = true;
          if (moduleExports) {
            const Server: any = moduleExports;
            for (const name of constants.RESTIFY_METHODS) {
              this._unwrap(Server.prototype, name as keyof Server);
            }
            for (const name of constants.RESTIFY_MW_METHODS) {
              this._unwrap(Server.prototype, name as keyof Server);
            }
          }
        }
      )
    );

    return module;
  }

  private _middlewarePatcher(original: Function, methodName?: string) {
    const instrumentation = this;
    return function (this: Server, ...handler: types.NestedRequestHandlers) {
      return original.call(
        this,
        instrumentation._handlerPatcher(
          { type: types.LayerType.MIDDLEWARE, methodName },
          handler
        )
      );
    };
  }

  private _methodPatcher(original: Function, methodName?: string) {
    const instrumentation = this;
    return function (
      this: Server,
      path: any,
      ...handler: types.NestedRequestHandlers
    ) {
      return original.call(
        this,
        path,
        ...instrumentation._handlerPatcher(
          { type: types.LayerType.REQUEST_HANDLER, path, methodName },
          handler
        )
      );
    };
  }

  // will return the same type as `handler`, but all functions recusively patched
  private _handlerPatcher(
    metadata: types.Metadata,
    handler: restify.RequestHandler | types.NestedRequestHandlers
  ): any {
    if (Array.isArray(handler)) {
      return handler.map(handler => this._handlerPatcher(metadata, handler));
    }
    if (typeof handler === 'function') {
      return (
        req: types.Request,
        res: restify.Response,
        next: restify.Next
      ) => {
        if (this._isDisabled) {
          return handler(req, res, next);
        }
        const route =
          typeof req.getRoute === 'function'
            ? req.getRoute()?.path
            : req.route?.path;

        // replace HTTP instrumentations name with one that contains a route
        // in first handlers, we might not now the route yet, in which case the HTTP
        // span has to be stored and fixed in later handler.
        // https://github.com/open-telemetry/opentelemetry-specification/blob/a44d863edcdef63b0adce7b47df001933b7a158a/specification/trace/semantic_conventions/http.md#name
        if (req[constants.REQ_SPAN] === undefined) {
          req[constants.REQ_SPAN] = api.getSpan(
            api.context.active()
          ) as types.InstrumentationSpan;
        }
        if (
          route &&
          req[constants.REQ_SPAN] &&
          req[constants.REQ_SPAN]?.name?.startsWith('HTTP ')
        ) {
          (req[constants.REQ_SPAN] as types.InstrumentationSpan).updateName(
            `${req.method} ${route}`
          );
          req[constants.REQ_SPAN] = false;
        }

        const fnName = handler.name || undefined;
        const spanName =
          metadata.type === types.LayerType.REQUEST_HANDLER
            ? `request handler - ${route}`
            : `middleware - ${fnName || 'anonymous'}`;
        const attributes = {
          [types.CustomAttributeNames.NAME]: fnName,
          [types.CustomAttributeNames.VERSION]: this._moduleVersion || 'n/a',
          [types.CustomAttributeNames.TYPE]: metadata.type,
          [types.CustomAttributeNames.METHOD]: metadata.methodName,
          [HttpAttribute.HTTP_ROUTE]: route,
        };
        const span = this.tracer.startSpan(
          spanName,
          {
            attributes,
          },
          api.context.active()
        );
        const patchedNext = (err?: any) => {
          span.end();
          next(err);
        };
        patchedNext.ifError = next.ifError;

        const wrapPromise = (promise: Promise<unknown>) => {
          return promise
            .catch((err) => {
              span.recordException(err);
              throw err;
            })
            .finally(() => {
              span.end();
            });
        }

        return api.context.with(
          api.setSpan(api.context.active(), span),
          (req: types.Request, res: restify.Response, next: restify.Next) => {
            if (checkType.isAsyncFunction(handler)) {
              return wrapPromise(handler(req, res, next));
            }
            try {
              const result = handler(req, res, next);
              if (checkType.isPromise(result)) {
                return wrapPromise(result);
              }
              span.end();
              return result;
            } catch (err) {
              span.recordException(err);
              span.end();
              throw err;
            }
          },
          this,
          req,
          res,
          patchedNext
        );
      };
    }

    return handler;
  }
}
