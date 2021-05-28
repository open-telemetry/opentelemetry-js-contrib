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
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import * as utils from './utils';

import * as knex from 'knex';

const contextSymbol = Symbol('knexContextSymbol');

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
          this.ensureWrapped(Client.prototype, 'queryBuilder', this.storeContext.bind(this));
          this.ensureWrapped(Client.prototype, 'schemaBuilder', this.storeContext.bind(this));
          this.ensureWrapped(Client.prototype, 'raw', this.storeContext.bind(this));
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
          this.ensureWrapped(Runner.prototype, 'query', this.wrapQuery.bind(this));
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
        [SemanticAttributes.DB_SYSTEM]: utils.mapSystem(config.client),
        [SemanticAttributes.DB_STATEMENT]: query?.sql,
      };
      const table = this.builder?._single?.table;
      if (table) {
        attributes[SemanticAttributes.DB_SQL_TABLE] = table;
      }
      // `method` actually refers to the knex API method - Not exactly "operation" in the spec sense, but matches most of the time.
      const operation = query?.method;
      if (operation) {
        attributes[SemanticAttributes.DB_OPERATION] = operation;
      }
      const user = config?.connection?.user;
      if (user) {
        attributes[SemanticAttributes.DB_USER] = config.connection.user;
      }
      const name = config?.connection?.filename || config?.connection?.database;
      if (name) {
        attributes[SemanticAttributes.DB_NAME] = name;
      }

      const parent = this.builder[contextSymbol];
      const span = instrumentation.tracer.startSpan(
        utils.getName(name, operation, table),
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
          // knex adds full query with all the binding values to the message,
          // we want to undo that without changing the original error
          const formatter = utils.getFormatter(this);
          const fullQuery = formatter(query.sql, query.bindings || []);
          const message = err.message.replace(fullQuery + ' - ', '');
          const clonedError = utils.cloneErrorWithNewMessage(err, message);
          span.recordException(clonedError);
          span.end();
          throw err;
        });
    }
  }

  private storeContext(original: any, methodName: string) {
    return function wrapped_logging_method(this: any) {
      const builder = original.apply(this, arguments);
      // Builder is a custom promise type and when awaited it fails to propagate context. We store the parent context at the moment of initiating the builder otherwise we'd have nothing to attach the span as a child for in `query`.
      Object.defineProperty(builder, contextSymbol, { value: api.context.active() });
      return builder;
    }
  }

  ensureWrapped(obj: any, methodName: string, wrapper: any) {
    api.diag.debug(
      `Applying patch for ${constants.MODULE_NAME}@${this._moduleVersion ?? '?'}`
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
