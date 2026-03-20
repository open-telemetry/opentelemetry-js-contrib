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
