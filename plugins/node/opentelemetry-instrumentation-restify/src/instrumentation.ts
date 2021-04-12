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
import once = require('lodash.once');
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { HttpAttribute } from '@opentelemetry/semantic-conventions';

const { diag } = api;
const RESTIFY_MW_METHODS = ['use', 'pre'];
const RESTIFY_METHODS = ['del', 'get', 'head', 'opts', 'post', 'put', 'patch'];

const MODULE_NAME = 'restify';
const SUPPORTED_VERSIONS = ['>=4.0.0'];

export class RestifyInstrumentation extends InstrumentationBase<
  typeof restify
> {
  constructor() {
    super(`@opentelemetry/instrumentation-${MODULE_NAME}`, VERSION);
  }

  private _moduleVersion?: string;
  private _isDisabled = false;

  init() {
    const module = new InstrumentationNodeModuleDefinition<typeof restify>(
      MODULE_NAME,
      SUPPORTED_VERSIONS,
      (moduleExports, moduleVersion) => {
        this._moduleVersion = moduleVersion;
        return moduleExports;
      }
    );

    module.files.push(
      new InstrumentationNodeModuleFile<typeof restify>(
        'restify/lib/server.js',
        SUPPORTED_VERSIONS,
        (moduleExports, moduleVersion) => {
          diag.debug(`Applying patch for ${MODULE_NAME}@${moduleVersion}`);
          this._isDisabled = false;
          const Server: any = moduleExports;
          for (const name of RESTIFY_METHODS) {
            if (isWrapped(Server.prototype[name])) {
              this._unwrap(Server.prototype, name);
            }
            this._wrap(
              Server.prototype,
              name as keyof Server,
              this._methodPatcher.bind(this)
            );
          }
          for (const name of RESTIFY_MW_METHODS) {
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
          diag.debug(`Removing patch for ${MODULE_NAME}@${moduleVersion}`);
          this._isDisabled = true;
          if (moduleExports) {
            const Server: any = moduleExports;
            for (const name of RESTIFY_METHODS) {
              this._unwrap(Server.prototype, name as keyof Server);
            }
            for (const name of RESTIFY_MW_METHODS) {
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
        // const parentSpan = api.getSpan(api?.context?.active());
        const route =
          typeof req.getRoute === 'function'
            ? req.getRoute()?.path
            : req.route?.path;
        const spanName = route || metadata.methodName || metadata.type;
        const attributes = {
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
        ); // TODO: <- with this I intend to find and attach all consecutive handlers to HTTP span
        // .. but instead all spans are attached to the previous handler's span.
        const endSpan = once(span.end.bind(span));
        const patchedNext = (err?: any) => {
          endSpan();
          next(err);
        };
        patchedNext.ifError = next.ifError;

        return api.context.with(
          api.setSpan(api.context.active(), span),
          (req: types.Request, res: restify.Response, next: restify.Next) => {
            try {
              return handler(req, res, next);
            } catch (err) {
              span.recordException(err);
              throw err;
            } finally {
              endSpan();
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
