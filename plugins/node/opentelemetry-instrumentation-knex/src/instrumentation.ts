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
import { VERSION } from './version';
import * as constants from './constants';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
// import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
// import { isPromise, isAsyncFunction } from './utils';

import * as knex from 'knex';

export interface Exception extends Error {
    errno?: number;
    code?: string;
    stack?: string;
}

const contextSymbol = Symbol('knexContextSymbol');
const getFormatter = (runner: any) => {
  if (runner?.client?._formatQuery) {
    return runner.client._formatQuery.bind(runner.client);
  } else if (runner?.client?.SqlString) {
    return runner.client.SqlString.format.bind(runner.client.SqlString);
  }
  return () => '';
};
const cloneErrorWithNewMessage = (err: Exception, message: string) => {
  if (err && err instanceof Error) {
    // @ts-ignore
    const clonedError: any = new err.constructor(message);
    clonedError.code = err.code;
    clonedError.stack = err.stack;
    clonedError.errno = err.errno;
    return clonedError;
  }
  return err;
}

export class KnexInstrumentation extends InstrumentationBase<
  typeof knex
> {
  constructor() {
    super(`@opentelemetry/instrumentation-${constants.MODULE_NAME}`, VERSION);
  }

  private _moduleVersion?: string;

  init() {
    const module = new InstrumentationNodeModuleDefinition<typeof knex>(
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
      }
    );

    module.files.push(
      new InstrumentationNodeModuleFile<typeof knex>(
        'knex/lib/client.js',
        constants.SUPPORTED_VERSIONS,
        (Client: any, moduleVersion) => {
          api.diag.debug(
            `Applying client.js patch for ${constants.MODULE_NAME}@${moduleVersion}`
          );
          this.ensureWrapped(moduleVersion, Client.prototype, 'queryBuilder', this.storeContext.bind(this));
          this.ensureWrapped(moduleVersion, Client.prototype, 'schemaBuilder', this.storeContext.bind(this));
          this.ensureWrapped(moduleVersion, Client.prototype, 'raw', this.storeContext.bind(this));
          return Client;
        },
        (Client: any, moduleVersion) => {
          api.diag.debug(
            `Removing patch for ${constants.MODULE_NAME}@${moduleVersion}`
          );
          this._unwrap(Client.prototype, 'queryBuilder');
          this._unwrap(Client.prototype, 'schemaBuilder');
          this._unwrap(Client.prototype, 'raw');
          return Client;
        }
      )
    );

    module.files.push(
      new InstrumentationNodeModuleFile<typeof knex>(
        'knex/lib/runner.js',
        constants.SUPPORTED_VERSIONS,
        (Runner: any, moduleVersion) => {
          api.diag.debug(
            `Applying runner.js patch for ${constants.MODULE_NAME}@${moduleVersion}`
          );
          this.ensureWrapped(moduleVersion, Runner.prototype, 'query', this.wrapQuery.bind(this));
          return Runner;
        },
        (Runner: any, moduleVersion) => {
          api.diag.debug(
            `Removing patch for ${constants.MODULE_NAME}@${moduleVersion}`
          );
          this._unwrap(Runner.prototype, 'query');
          return Runner;
        }
      )
    );

    return module;
  }

  private wrapQuery(original: any, methodName: string) {
    const instrumentation = this;
    return function wrapped_logging_method(this: any, query: any) {
      const config = this.client.config;

      const attributes: any = {
        'knex.version': instrumentation._moduleVersion,
        'db.type': config.client,
        'db.statement': query?.sql,
      };
      if (query?.method) {
        attributes['knex.method'] = query.method;
      }
      if (config.connection) {
        if (config.connection.user) {
          attributes['db.user'] = config.connection.user;
        }
        const instance = config.connection.filename || config.connection.database;
        if (instance) {
          attributes['db.instance'] = instance;
        }
      }

      const parent = this.builder[contextSymbol];
      const span = instrumentation.tracer.startSpan(
        'knex.client.runner',
        {
          attributes,
        },
        parent
      );

      return original.apply(this, arguments)
        .then((result: any) => {
          span.end();
          return result;
        })
        .catch((err: any) => {
          // knex puts full query to the message, we want to undo that without
          // changing the original error
          const formatter = getFormatter(this);
          const sensitive = formatter(query.sql, query.bindings || []) + ' - ';
          const message = err.message.replace(sensitive, '');
          const clonedError = cloneErrorWithNewMessage(err, message);
          span.recordException(clonedError);
          span.end();
          throw err;
        });
    }
  }

  private storeContext(original: any, methodName: string) {
    return function wrapped_logging_method(this: any) {
      const builder = original.apply(this, arguments);
      Object.defineProperty(builder, contextSymbol, { value: api.context.active() });
      return builder;
    }
  }

  ensureWrapped(moduleVersion: string | undefined, obj: any, methodName: string, wrapper: any) {
    api.diag.debug(
      `Applying patch for ${constants.MODULE_NAME}@${moduleVersion || this._moduleVersion}`
    );
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(
      obj,
      methodName,
      wrapper
    );
  }
}
