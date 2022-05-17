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
import type * as Router from 'router';

import * as types from './types';
import { VERSION } from './version';
import * as constants from './constants';
import * as utils from './utils';
import AttributeNames from './enums/AttributeNames';
import LayerType from './enums/LayerType';

export default class RouterInstrumentation extends InstrumentationBase<any> {
  constructor() {
    super(`@opentelemetry/instrumentation-${constants.MODULE_NAME}`, VERSION);
  }

  private _moduleVersion?: string;

  init() {
    const module = new InstrumentationNodeModuleDefinition<any>(
      constants.MODULE_NAME,
      constants.SUPPORTED_VERSIONS,
      (moduleExports, moduleVersion) => {
        api.diag.debug(
          `Applying patch for ${constants.MODULE_NAME}@${moduleVersion}`
        );
        this._moduleVersion = moduleVersion;
        return moduleExports;
      },
      (moduleExports, moduleVersion) => {
        api.diag.debug(
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
          api.diag.debug(
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
          api.diag.debug(
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
  private _requestHandlerPatcher(original: Router.Layer['handle_request']) {
    const instrumentation = this;
    return function wrapped_handle_request(
      this: Router.Layer,
      req: Router.RoutedRequest,
      res: http.ServerResponse,
      next: Router.NextFunction
    ) {
      // Skip creating spans if the registered handler is of invalid length, because
      // we know router will ignore those
      if (utils.isInternal(this.handle) || this.handle.length > 3) {
        return original.call(this, req, res, next);
      }
      const { context, wrappedNext } = instrumentation._setupSpan(
        this,
        req,
        res,
        next
      );
      return api.context.with(context, original, this, req, res, wrappedNext);
    };
  }

  // Define handle_error wrapper separately to ensure the signature has the correct length
  private _errorHandlerPatcher(original: Router.Layer['handle_error']) {
    const instrumentation = this;
    return function wrapped_handle_request(
      this: Router.Layer,
      error: Error,
      req: Router.RoutedRequest,
      res: http.ServerResponse,
      next: Router.NextFunction
    ) {
      // Skip creating spans if the registered handler is of invalid length, because
      // we know router will ignore those
      if (utils.isInternal(this.handle) || this.handle.length !== 4) {
        return original.call(this, error, req, res, next);
      }
      const { context, wrappedNext } = instrumentation._setupSpan(
        this,
        req,
        res,
        next
      );
      return api.context.with(
        context,
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
    layer: Router.Layer,
    req: Router.RoutedRequest,
    res: http.ServerResponse,
    next: Router.NextFunction
  ) {
    const fnName = layer.handle.name || '<anonymous>';
    const type = layer.method
      ? LayerType.REQUEST_HANDLER
      : LayerType.MIDDLEWARE;
    const route = req.baseUrl + (req.route?.path ?? '') || '/';
    const spanName =
      type === LayerType.REQUEST_HANDLER
        ? `request handler - ${route}`
        : `middleware - ${fnName}`;
    const attributes = {
      [AttributeNames.NAME]: fnName,
      [AttributeNames.VERSION]: this._moduleVersion,
      [AttributeNames.TYPE]: type,
      [SemanticAttributes.HTTP_ROUTE]: route,
    };

    const parent = api.context.active();
    const parentSpan = api.trace.getSpan(parent) as types.InstrumentationSpan;
    const span = this.tracer.startSpan(
      spanName,
      {
        attributes,
      },
      parent
    ) as types.InstrumentationSpan;
    const endSpan = utils.once(span.end.bind(span));

    utils.renameHttpSpan(parentSpan, layer.method, route);
    // make sure spans are ended at least when response is finished
    res.prependOnceListener('finish', endSpan);

    const wrappedNext: Router.NextFunction = err => {
      if (err) {
        span.recordException(err);
      }
      endSpan();
      if (parent) {
        return api.context.with(parent, next, undefined, err);
      }
      return next(err);
    };

    return {
      context: api.trace.setSpan(parent, span),
      wrappedNext,
    };
  }
}
