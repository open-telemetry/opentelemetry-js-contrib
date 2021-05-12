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
import {
  isWrapped,
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';

import {
  context,
  diag,
  getSpan,
  Span,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import * as pgTypes from 'pg';
import * as pgPoolTypes from 'pg-pool';
import {
  PgClientExtended,
  NormalizedQueryConfig,
  PostgresCallback,
  PgPoolExtended,
  PgPoolCallback,
} from './types';
import * as utils from './utils';
import { AttributeNames } from './enums';
import {
  SemanticAttributes,
  DbSystemValues,
} from '@opentelemetry/semantic-conventions';
import { VERSION } from './version';

export interface PgInstrumentationConfig extends InstrumentationConfig {
  /**
   * If true, additional information about query parameters and
   * results will be attached (as `attributes`) to spans representing
   * database operations.
   */
  enhancedDatabaseReporting?: boolean;
}

const PG_POOL_COMPONENT = 'pg-pool';

export class PgInstrumentation extends InstrumentationBase {
  static readonly COMPONENT = 'pg';

  static readonly BASE_SPAN_NAME = PgInstrumentation.COMPONENT + '.query';

  constructor(config: PgInstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-pg',
      VERSION,
      Object.assign({}, config)
    );
  }

  protected init() {
    const modulePG = new InstrumentationNodeModuleDefinition<typeof pgTypes>(
      'pg',
      ['7.*', '8.*'],
      moduleExports => {
        if (isWrapped(moduleExports.Client.prototype.query)) {
          this._unwrap(moduleExports.Client.prototype, 'query');
        }
        this._wrap(
          moduleExports.Client.prototype,
          'query',
          this._getClientQueryPatch() as never
        );
        return moduleExports;
      },
      moduleExports => {
        if (isWrapped(moduleExports.Client.prototype.query)) {
          this._unwrap(moduleExports.Client.prototype, 'query');
        }
      }
    );

    const modulePGPool = new InstrumentationNodeModuleDefinition<
      typeof pgPoolTypes
    >(
      'pg-pool',
      ['2.*', '3.*'],
      moduleExports => {
        if (isWrapped(moduleExports.prototype.connect)) {
          this._unwrap(moduleExports.prototype, 'connect');
        }
        this._wrap(
          moduleExports.prototype,
          'connect',
          this._getPoolConnectPatch() as never
        );
        return moduleExports;
      },
      moduleExports => {
        if (isWrapped(moduleExports.prototype.connect)) {
          this._unwrap(moduleExports.prototype, 'connect');
        }
      }
    );

    return [modulePG, modulePGPool];
  }

  private _getClientQueryPatch() {
    const plugin = this;
    return (original: typeof pgTypes.Client.prototype.query) => {
      diag.debug(
        `Patching ${PgInstrumentation.COMPONENT}.Client.prototype.query`
      );
      return function query(this: PgClientExtended, ...args: unknown[]) {
        let span: Span;

        // Handle different client.query(...) signatures
        if (typeof args[0] === 'string') {
          const query = args[0];
          if (args.length > 1 && args[1] instanceof Array) {
            const params = args[1];
            span = utils.handleParameterizedQuery.call(
              this,
              plugin.tracer,
              plugin._config as InstrumentationConfig & PgInstrumentationConfig,
              query,
              params
            );
          } else {
            span = utils.handleTextQuery.call(this, plugin.tracer, query);
          }
        } else if (typeof args[0] === 'object') {
          const queryConfig = args[0] as NormalizedQueryConfig;
          span = utils.handleConfigQuery.call(
            this,
            plugin.tracer,
            plugin._config as InstrumentationConfig & PgInstrumentationConfig,
            queryConfig
          );
        } else {
          return utils.handleInvalidQuery.call(
            this,
            plugin.tracer,
            original,
            ...args
          );
        }

        // Bind callback to parent span
        if (args.length > 0) {
          const parentSpan = getSpan(context.active());
          if (typeof args[args.length - 1] === 'function') {
            // Patch ParameterQuery callback
            args[args.length - 1] = utils.patchCallback(
              span,
              args[args.length - 1] as PostgresCallback
            );
            // If a parent span exists, bind the callback
            if (parentSpan) {
              args[args.length - 1] = context.bind(args[args.length - 1]);
            }
          } else if (
            typeof (args[0] as NormalizedQueryConfig).callback === 'function'
          ) {
            // Patch ConfigQuery callback
            let callback = utils.patchCallback(
              span,
              (args[0] as NormalizedQueryConfig).callback!
            );
            // If a parent span existed, bind the callback
            if (parentSpan) {
              callback = context.bind(callback);
            }

            // Copy the callback instead of writing to args.callback so that we don't modify user's
            // original callback reference
            args[0] = { ...(args[0] as object), callback };
          }
        }

        // Perform the original query
        const result: unknown = original.apply(this, args as never);

        // Bind promise to parent span and end the span
        if (result instanceof Promise) {
          return result
            .then((result: unknown) => {
              // Return a pass-along promise which ends the span and then goes to user's orig resolvers
              return new Promise(resolve => {
                span.end();
                resolve(result);
              });
            })
            .catch((error: Error) => {
              return new Promise((_, reject) => {
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                span.end();
                reject(error);
              });
            });
        }

        // else returns void
        return result; // void
      };
    };
  }

  private _getPoolConnectPatch() {
    const plugin = this;
    return (originalConnect: typeof pgPoolTypes.prototype.connect) => {
      return function connect(this: PgPoolExtended, callback?: PgPoolCallback) {
        const jdbcString = utils.getJDBCString(this.options);
        // setup span
        const span = plugin.tracer.startSpan(`${PG_POOL_COMPONENT}.connect`, {
          kind: SpanKind.CLIENT,
          attributes: {
            [SemanticAttributes.DB_SYSTEM]: DbSystemValues.POSTGRESQL,
            [SemanticAttributes.DB_NAME]: this.options.database, // required
            [SemanticAttributes.NET_PEER_NAME]: this.options.host, // required
            [SemanticAttributes.DB_CONNECTION_STRING]: jdbcString, // required
            [SemanticAttributes.NET_PEER_PORT]: this.options.port,
            [SemanticAttributes.DB_USER]: this.options.user,
            [AttributeNames.IDLE_TIMEOUT_MILLIS]:
              this.options.idleTimeoutMillis,
            [AttributeNames.MAX_CLIENT]: this.options.maxClient,
          },
        });

        if (callback) {
          const parentSpan = getSpan(context.active());
          callback = utils.patchCallbackPGPool(
            span,
            callback
          ) as PgPoolCallback;
          // If a parent span exists, bind the callback
          if (parentSpan) {
            callback = context.bind(callback);
          }
        }

        const connectResult: unknown = originalConnect.call(
          this,
          callback as never
        );

        // No callback was provided, return a promise instead
        if (connectResult instanceof Promise) {
          const connectResultPromise = connectResult as Promise<unknown>;
          return context.bind(
            connectResultPromise
              .then(result => {
                // Return a pass-along promise which ends the span and then goes to user's orig resolvers
                return new Promise(resolve => {
                  span.end();
                  resolve(result);
                });
              })
              .catch((error: Error) => {
                return new Promise((_, reject) => {
                  span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: error.message,
                  });
                  span.end();
                  reject(error);
                });
              })
          );
        }

        // Else a callback was provided, so just return the result
        return connectResult;
      };
    };
  }
}
