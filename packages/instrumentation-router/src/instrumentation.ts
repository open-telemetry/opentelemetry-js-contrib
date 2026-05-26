/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as api from '@opentelemetry/api';
import {
  InstrumentationConfig,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';

import * as http from 'http';
import type * as Router from 'router';

import * as types from './internal-types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import {
  RouterConstants,
  MODULE_NAME,
  V1_CONSTANTS,
  V2_CONSTANTS,
} from './constants';
import * as utils from './utils';
import AttributeNames from './enums/AttributeNames';
import LayerType from './enums/LayerType';

const supportedVersions = ['>=1.0.0 <3'];

export class RouterInstrumentation extends InstrumentationBase {
  constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  private _moduleVersion?: string;
  private _constants?: RouterConstants;

  init() {
    const module = new InstrumentationNodeModuleDefinition(
      MODULE_NAME,
      supportedVersions,
      (moduleExports, moduleVersion) => {
        this._moduleVersion = moduleVersion;
        return moduleExports;
      }
    );

    module.files.push(
      new InstrumentationNodeModuleFile(
        'router/lib/layer.js',
        supportedVersions,
        (moduleExports, moduleVersion) => {
          const Layer: any = moduleExports;
          const isV2 = moduleVersion?.startsWith('2.');
          this._constants ??= isV2 ? V2_CONSTANTS : V1_CONSTANTS;
          const requestHandlerName = this._constants.requestHandlerName;
          const errorHandlerName = this._constants.errorHandlerName;
          if (isWrapped(Layer.prototype[requestHandlerName])) {
            this._unwrap(Layer.prototype, requestHandlerName);
          }
          this._wrap(
            Layer.prototype,
            requestHandlerName,
            this._requestHandlerPatcher.bind(this)
          );
          if (isWrapped(Layer.prototype[errorHandlerName])) {
            this._unwrap(Layer.prototype, errorHandlerName);
          }
          this._wrap(
            Layer.prototype,
            errorHandlerName,
            this._errorHandlerPatcher.bind(this)
          );
          return moduleExports;
        },
        moduleExports => {
          const Layer: any = moduleExports;
          if (this._constants !== undefined) {
            this._unwrap(Layer.prototype, this._constants.requestHandlerName);
            this._unwrap(Layer.prototype, this._constants.errorHandlerName);
          }
          return moduleExports;
        }
      )
    );

    return module;
  }

  // Define handle_request wrapper separately to ensure the signature has the correct length
  private _requestHandlerPatcher(original: Router.RequestHandler) {
    const instrumentation = this;
    return function wrapped_handle_request(
      this: Router.Layer,
      req: Router.RoutedRequest,
      res: http.ServerResponse,
      next: Router.NextFunction
    ) {
      // Skip creating spans if the registered handler is of invalid length, because
      // we know router will ignore those
      if (
        this.handle.length > 3 ||
        utils.isInternal(this.handle, instrumentation._constants)
      ) {
        return original.call(this, req, res, next);
      }
      const { context, wrappedNext, ensureFallbackListener } =
        instrumentation._setupSpan(this, req, res, next);
      try {
        return api.context.with(context, original, this, req, res, wrappedNext);
      } finally {
        ensureFallbackListener();
      }
    };
  }

  // Define handle_error wrapper separately to ensure the signature has the correct length
  private _errorHandlerPatcher(original: Router.ErrorRequestHandler) {
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
      if (
        this.handle.length !== 4 ||
        utils.isInternal(this.handle, instrumentation._constants)
      ) {
        return original.call(this, error, req, res, next);
      }
      const { context, wrappedNext, ensureFallbackListener } =
        instrumentation._setupSpan(this, req, res, next);
      try {
        return api.context.with(
          context,
          original,
          this,
          error,
          req,
          res,
          wrappedNext
        );
      } finally {
        ensureFallbackListener();
      }
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
      [ATTR_HTTP_ROUTE]: route,
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

    utils.renameHttpSpan(parentSpan, layer.method, route);

    // Span lifecycle:
    //   - Normal path: the layer calls `next(err?)`, which runs `wrappedNext`,
    //     ending the span and removing the fallback `close` listener (if one
    //     was attached).
    //   - Layer ends the response itself (e.g. `res.send(...)` and never
    //     calls `next`): the `close` listener fires when the underlying
    //     connection closes and ends the span.
    //
    // The fallback listener is only attached AFTER the original handler
    // returns, and only if `next` wasn't already called synchronously. For
    // the overwhelmingly common case (synchronous `next()`) NO listener is
    // registered at all, so listener count never approaches Node's default
    // MaxListeners=10 even with dozens of middleware (issue #3458). This
    // mirrors the pattern adopted by `instrumentation-express` in #3462.
    let spanEnded = false;
    let listenerAttached = false;
    const onClose = () => {
      if (!spanEnded) {
        spanEnded = true;
        span.end();
      }
    };

    const wrappedNext: Router.NextFunction = err => {
      if (err) {
        span.recordException(err);
      }
      if (!spanEnded) {
        spanEnded = true;
        if (listenerAttached) {
          res.removeListener('close', onClose);
        }
        span.end();
      }
      if (parent) {
        return api.context.with(parent, next, undefined, err);
      }
      return next(err);
    };

    const ensureFallbackListener = () => {
      if (!spanEnded && !listenerAttached) {
        listenerAttached = true;
        res.once('close', onClose);
      }
    };

    return {
      context: api.trace.setSpan(parent, span),
      wrappedNext,
      ensureFallbackListener,
    };
  }
}
