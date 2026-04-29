/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export const MODULE_NAME = 'router';

export interface RouterConstants {
  requestHandlerName: string;
  errorHandlerName: string;
  routeFunctionBody: string;
  handleFunctionBody: string;
}

export const V1_CONSTANTS: RouterConstants = {
  requestHandlerName: 'handle_request',
  errorHandlerName: 'handle_error',
  routeFunctionBody: `function router(req, res, next) {
    router.handle(req, res, next)
  }`,
  handleFunctionBody: `function handle(req, res, next) {
    route.dispatch(req, res, next)
  }`,
};

export const V2_CONSTANTS: RouterConstants = {
  requestHandlerName: 'handleRequest',
  errorHandlerName: 'handleError',
  routeFunctionBody: `function router (req, res, next) {
    router.handle(req, res, next)
  }`,
  handleFunctionBody: `function handle (req, res, next) {
    route.dispatch(req, res, next)
  }`,
};
