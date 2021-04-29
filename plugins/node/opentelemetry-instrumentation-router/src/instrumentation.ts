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
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

import * as http from 'http';
import * as Router from 'router';

import * as types from './types';
import { VERSION } from './version';
import * as constants from './constants';
import * as utils from './utils';

const { diag } = api;

export default class RouterInstrumentation extends InstrumentationBase<
  typeof Router
> {
  constructor() {
    super(`@opentelemetry/instrumentation-${constants.MODULE_NAME}`, VERSION);
  }

  private _moduleVersion?: string;

  init() {
    const module = new InstrumentationNodeModuleDefinition<typeof Router>(
      constants.MODULE_NAME,
      constants.SUPPORTED_VERSIONS,
      (moduleExports, moduleVersion) => {
        diag.debug(
          `Applying patch for ${constants.MODULE_NAME}@${moduleVersion}`
        );
        this._moduleVersion = moduleVersion;
        return moduleExports;
      },
      (moduleExports, moduleVersion) => {
        diag.debug(
          `Removing patch for ${constants.MODULE_NAME}@${moduleVersion}`
        );
        return moduleExports;
      }
    );

    module.files.push(
      new InstrumentationNodeModuleFile<typeof Router>(
        'router/lib/layer.js',
        constants.SUPPORTED_VERSIONS,
        (moduleExports, moduleVersion) => {
          diag.debug(
            `Applying patch for "lib/layer.js" of ${constants.MODULE_NAME}@${moduleVersion}`
          );
          const Layer: any = moduleExports;
          if (isWrapped(Layer.prototype.handle_request)) {
            this._unwrap(Layer.prototype, 'handle_request');
          }
          this._wrap(
            Layer.prototype,
            'handle_request',
            this._requestHandlerPatcher.bind(this)
          );
          if (isWrapped(Layer.prototype.handle_error)) {
            this._unwrap(Layer.prototype, 'handle_error');
          }
          this._wrap(
            Layer.prototype,
            'handle_error',
            this._errorHandlerPatcher.bind(this)
          );
          return moduleExports;
        },
        (moduleExports, moduleVersion) => {
          diag.debug(
            `Removing patch for "lib/layer.js" of ${constants.MODULE_NAME}@${moduleVersion}`
          );
          const Layer: any = moduleExports;
          this._unwrap(Layer.prototype, 'handle_request');
          this._unwrap(Layer.prototype, 'handle_error');
          return moduleExports;
        }
      )
    );

    return module;
  }

  // Define handle_request wrapper separately to ensure the signature has the correct length
  private _requestHandlerPatcher(original: types.Layer['handle_request']) {
    const instrumentation = this;
    return function wrapped_handle_request(
      this: types.Layer,
      req: types.RouterIncomingMessage,
      res: http.ServerResponse,
      next: types.Next
    ) {
      if (utils.isInternal(this.handle) || this.handle.length > 3) {
        return original.call(this, req, res, next);
      }
      const { span, wrappedNext } = instrumentation._setupSpan(
        this.handle,
        this.method,
        req,
        res,
        next
      );
      return api.context.with(
        api.setSpan(api.context.active(), span),
        original,
        this,
        req,
        res,
        wrappedNext
      );
    };
  }

  // Define handle_error wrapper separately to ensure the signature has the correct length
  private _errorHandlerPatcher(original: types.Layer['handle_error']) {
    const instrumentation = this;
    return function wrapped_handle_request(
      this: types.Layer,
      error: Error,
      req: types.RouterIncomingMessage,
      res: http.ServerResponse,
      next: types.Next
    ) {
      if (utils.isInternal(this.handle) || this.handle.length !== 4) {
        return original.call(this, error, req, res, next);
      }
      const { span, wrappedNext } = instrumentation._setupSpan(
        this.handle,
        this.method,
        req,
        res,
        next
      );
      return api.context.with(
        api.setSpan(api.context.active(), span),
        original,
        this,
        error,
        req,
        res,
        wrappedNext
      );
    };
  }

  private _setupSpan(
    handle: Function,
    method: string | undefined,
    req: types.RouterIncomingMessage,
    res: http.ServerResponse,
    next: types.Next
  ) {
    // Router sets "<anonymous>" as the default
    const fnName = handle.name;
    const type = method
      ? types.LayerType.REQUEST_HANDLER
      : types.LayerType.MIDDLEWARE;
    const route = utils.getRoute(req);
    const spanName =
      type === types.LayerType.REQUEST_HANDLER
        ? `request handler - ${route}`
        : `middleware - ${fnName || '<anonymous>'}`;
    const attributes = {
      [types.CustomAttributeNames.NAME]: fnName,
      [types.CustomAttributeNames.VERSION]: this._moduleVersion || 'n/a',
      [types.CustomAttributeNames.TYPE]: type,
      [SemanticAttributes.HTTP_ROUTE]: route,
    };
    const span = this.tracer.startSpan(
      spanName,
      {
        attributes,
      },
      api.context.active()
    );

    let called = false;
    const endSpan = () => {
      if (!called) {
        called = true;
        utils.renameHttpSpan(api.getSpan(api.context.active()), method, route);
        return span.end();
      }
    };
    // prependListener fires correctly, if syncronous internal handlers would be tracked as well
    // TODO: define what "correctly" means here. Also affects the renaming of http span.
    res.prependOnceListener('finish', endSpan);

    const wrappedNext: types.Next = (...args) => {
      endSpan();
      return next(...args);
    };

    return {
      span,
      wrappedNext,
    };
  }
}
