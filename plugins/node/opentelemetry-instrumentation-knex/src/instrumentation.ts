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
import * as types from './types';

import type * as knex from 'knex';

const contextSymbol = Symbol('opentelemetry.instrumentation-knex.context');
const DEFAULT_CONFIG: types.KnexInstrumentationConfig = {
  maxQueryLength: 1022,
};

export class KnexInstrumentation extends InstrumentationBase<any> {
  constructor(config: types.KnexInstrumentationConfig = {}) {
    super(
      `@opentelemetry/instrumentation-${constants.MODULE_NAME}`,
      VERSION,
      Object.assign({}, DEFAULT_CONFIG, config)
    );
  }

  init() {
    const module = new InstrumentationNodeModuleDefinition<any>(
      constants.MODULE_NAME,
      constants.SUPPORTED_VERSIONS
    );

    module.files.push(
      this.getClientNodeModuleFileInstrumentation('src'),
      this.getClientNodeModuleFileInstrumentation('lib'),
      this.getRunnerNodeModuleFileInstrumentation('src'),
      this.getRunnerNodeModuleFileInstrumentation('lib'),
      this.getRunnerNodeModuleFileInstrumentation('lib/execution')
    );

    return module;
  }

  private getRunnerNodeModuleFileInstrumentation(basePath: string) {
    return new InstrumentationNodeModuleFile<typeof knex>(
      `knex/${basePath}/runner.js`,
      constants.SUPPORTED_VERSIONS,
      (Runner: any, moduleVersion) => {
        api.diag.debug(
          `Applying ${basePath}/runner.js patch for ${constants.MODULE_NAME}@${moduleVersion}`
        );
        this.ensureWrapped(
          moduleVersion,
          Runner.prototype,
          'query',
          this.createQueryWrapper(moduleVersion)
        );
        return Runner;
      },
      (Runner: any, moduleVersion) => {
        api.diag.debug(
          `Removing ${basePath}/runner.js patch for ${constants.MODULE_NAME}@${moduleVersion}`
        );
        this._unwrap(Runner.prototype, 'query');
        return Runner;
      }
    );
  }

  private getClientNodeModuleFileInstrumentation(basePath: string) {
    return new InstrumentationNodeModuleFile<typeof knex>(
      `knex/${basePath}/client.js`,
      constants.SUPPORTED_VERSIONS,
      (Client: any, moduleVersion) => {
        api.diag.debug(
          `Applying ${basePath}/client.js patch for ${constants.MODULE_NAME}@${moduleVersion}`
        );
        this.ensureWrapped(
          moduleVersion,
          Client.prototype,
          'queryBuilder',
          this.storeContext.bind(this)
        );
        this.ensureWrapped(
          moduleVersion,
          Client.prototype,
          'schemaBuilder',
          this.storeContext.bind(this)
        );
        this.ensureWrapped(
          moduleVersion,
          Client.prototype,
          'raw',
          this.storeContext.bind(this)
        );
        return Client;
      },
      (Client: any, moduleVersion) => {
        api.diag.debug(
          `Removing ${basePath}/client.js patch for ${constants.MODULE_NAME}@${moduleVersion}`
        );
        this._unwrap(Client.prototype, 'queryBuilder');
        this._unwrap(Client.prototype, 'schemaBuilder');
        this._unwrap(Client.prototype, 'raw');
        return Client;
      }
    );
  }

  private createQueryWrapper(moduleVersion?: string) {
    const instrumentation = this;
    return function wrapQuery(original: () => any) {
      return function wrapped_logging_method(this: any, query: any) {
        const config = this.client.config;

        const table = this.builder?._single?.table;
        // `method` actually refers to the knex API method - Not exactly "operation"
        // in the spec sense, but matches most of the time.
        const operation = query?.method;
        const name =
          config?.connection?.filename || config?.connection?.database;
        const maxLen = (
          instrumentation._config as types.KnexInstrumentationConfig
        ).maxQueryLength!;

        const attributes: api.SpanAttributes = {
          'knex.version': moduleVersion,
          [SemanticAttributes.DB_SYSTEM]: utils.mapSystem(config.client),
          [SemanticAttributes.DB_SQL_TABLE]: table,
          [SemanticAttributes.DB_OPERATION]: operation,
          [SemanticAttributes.DB_USER]: config?.connection?.user,
          [SemanticAttributes.DB_NAME]: name,
          [SemanticAttributes.NET_PEER_NAME]: config?.connection?.host,
          [SemanticAttributes.NET_PEER_PORT]: config?.connection?.port,
          [SemanticAttributes.NET_TRANSPORT]:
            config?.connection?.filename === ':memory:' ? 'inproc' : undefined,
        };
        if (maxLen !== 0) {
          attributes[SemanticAttributes.DB_STATEMENT] = utils.limitLength(
            query?.sql,
            maxLen
          );
        }

        const parent = this.builder[contextSymbol];
        const span = instrumentation.tracer.startSpan(
          utils.getName(name, operation, table),
          {
            attributes,
          },
          parent
        );
        const spanContext = api.trace.setSpan(api.context.active(), span);

        return api.context
          .with(spanContext, original, this, ...arguments)
          .then((result: unknown) => {
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
            span.setStatus({ code: api.SpanStatusCode.ERROR, message });
            span.end();
            throw err;
          });
      };
    };
  }

  private storeContext(original: Function) {
    return function wrapped_logging_method(this: any) {
      const builder = original.apply(this, arguments);
      // Builder is a custom promise type and when awaited it fails to propagate context.
      // We store the parent context at the moment of initiating the builder
      // otherwise we'd have nothing to attach the span as a child for in `query`.
      Object.defineProperty(builder, contextSymbol, {
        value: api.context.active(),
      });
      return builder;
    };
  }

  ensureWrapped(
    moduleVersion: string | undefined,
    obj: any,
    methodName: string,
    wrapper: (original: any) => any
  ) {
    api.diag.debug(
      `Applying ${methodName} patch for ${constants.MODULE_NAME}@${moduleVersion}`
    );
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}
