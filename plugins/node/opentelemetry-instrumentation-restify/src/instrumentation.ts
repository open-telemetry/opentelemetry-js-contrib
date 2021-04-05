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

import api from '@opentelemetry/api';
import { getSpan } from '@opentelemetry/api';
import * as restify from 'restify';
import { Server } from 'restify';
import { VERSION } from './version';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { HttpAttribute } from '@opentelemetry/semantic-conventions';

const { diag } = api;
const RESTIFY_HANDLERS = ['use', 'pre'];
const RESTIFY_METHODS = ['del', 'get', 'head', 'opts', 'post', 'put', 'patch'];
const RESTIFY_VERSION_ATTRIBUTE = 'restify.version'

const MODULE_NAME = 'restify';
const SUPPORTED_VERSIONS = ['^4.0.0'];

export class RestifyInstrumentation extends InstrumentationBase<
  typeof restify
> {
  constructor() {
    super(
      `@opentelemetry/instrumentation-${MODULE_NAME}`,
      VERSION
    );
  }

  private _moduleVersion: string | undefined;

  init() {
    const module = new InstrumentationNodeModuleDefinition<typeof restify>(
        MODULE_NAME,
        SUPPORTED_VERSIONS,
        (moduleExports, moduleVersion) => {
          this._moduleVersion = moduleVersion;
          return moduleExports;
        }
      );

    module.files.push(new InstrumentationNodeModuleFile<typeof restify>(
      'restify/lib/server.js',
      SUPPORTED_VERSIONS,
      (moduleExports, moduleVersion) => {
        diag.debug(`Applying patch for ${MODULE_NAME}@${moduleVersion}`);
        const Server: any = moduleExports;
        for (const name of RESTIFY_METHODS) {
          if (isWrapped(Server.prototype[name])) {
            this._unwrap(Server.prototype, name);
          }
          this._wrap(Server.prototype, name as keyof Server, this._methodPatcher.bind(this));
        }
        for (const name of RESTIFY_HANDLERS) {
          if (isWrapped(Server.prototype[name])) {
            this._unwrap(Server.prototype, name);
          }
          this._wrap(Server.prototype, name as keyof Server, this._handlerPatcher.bind(this));
        }
        return moduleExports;
      },
      (moduleExports, moduleVersion) => {
        diag.debug(`Removing patch for ${MODULE_NAME}@${moduleVersion}`);
        if (moduleExports) {
          const Server: any = moduleExports;
          for (const name of RESTIFY_METHODS) {
            this._unwrap(Server.prototype, name as keyof Server);
          }
          for (const name of RESTIFY_HANDLERS) {
            this._unwrap(Server.prototype, name as keyof Server);
          }
        }
      }
    ));

    return module;
  }

  private _handlerPatcher (original: Function) {
    const instrumentation = this;
    return function (this: Server, handler: Function) {
      return original.call(this, (req: any, res: any, next: Function) => {
        const span = getSpan(api?.context?.active());
        if (span) {
          span.setAttribute(RESTIFY_VERSION_ATTRIBUTE, instrumentation._moduleVersion || 'n/a');
        }
        return handler(req, res, next);
      });
    };
  }

  private _methodPatcher (original: Function) {
    const instrumentation = this;
    return function (this: Server, path: any, handler: Function) {
      return original.call(this, path, (req: any, res: any, next: Function) => {
        const span = getSpan(api?.context?.active());
        if (span && req?.route?.path) {
          span.setAttribute(HttpAttribute.HTTP_ROUTE, req.route.path);
          span.setAttribute(RESTIFY_VERSION_ATTRIBUTE, instrumentation._moduleVersion || 'n/a');
        }
        return handler(req, res, next);
      });
    };
  }
}
