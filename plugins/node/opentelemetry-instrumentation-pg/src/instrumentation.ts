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
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';

import { context, diag, trace, Span, SpanStatusCode } from '@opentelemetry/api';
import * as pgTypes from 'pg';
import * as pgPoolTypes from 'pg-pool';
import {
  PgClientConnect,
  PgClientExtended,
  PgErrorCallback,
  NormalizedQueryConfig,
  PostgresCallback,
  PgPoolExtended,
  PgPoolCallback,
  PgInstrumentationConfig,
} from './types';
import * as utils from './utils';
import { AttributeNames } from './enums/AttributeNames';
import {
  SemanticAttributes,
  DbSystemValues,
} from '@opentelemetry/semantic-conventions';
import { VERSION } from './version';
import { startSpan } from './utils';

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

        if (isWrapped(moduleExports.Client.prototype.connect)) {
          this._unwrap(moduleExports.Client.prototype, 'connect');
        }

        this._wrap(
          moduleExports.Client.prototype,
          'query',
          this._getClientQueryPatch() as any
        );

        this._wrap(
          moduleExports.Client.prototype,
          'connect',
          this._getClientConnectPatch() as any
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
          this._getPoolConnectPatch() as any
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

  override setConfig(config: PgInstrumentationConfig = {}) {
    this._config = Object.assign({}, config);
  }

  override getConfig(): PgInstrumentationConfig {
    return this._config as PgInstrumentationConfig;
  }

  private _getClientConnectPatch() {
    const plugin = this;
    return (original: PgClientConnect) => {
      return function connect(
        this: pgTypes.Client,
        callback?: PgErrorCallback
      ) {
        const span = startSpan(
          plugin.tracer,
          plugin.getConfig(),
          `${PgInstrumentation.COMPONENT}.connect`,
          {
            [SemanticAttributes.DB_SYSTEM]: DbSystemValues.POSTGRESQL,
            [SemanticAttributes.DB_NAME]: this.database,
            [SemanticAttributes.NET_PEER_NAME]: this.host,
            [SemanticAttributes.DB_CONNECTION_STRING]:
              utils.getConnectionString(this),
            [SemanticAttributes.NET_PEER_PORT]: this.port,
            [SemanticAttributes.DB_USER]: this.user,
          }
        );

        if (callback) {
          const parentSpan = trace.getSpan(context.active());
          callback = utils.patchClientConnectCallback(span, callback);
          if (parentSpan) {
            callback = context.bind(context.active(), callback);
          }
        }

        const connectResult: unknown = context.with(
          trace.setSpan(context.active(), span),
          () => {
            return original.call(this, callback);
          }
        );

        return handleConnectResult(span, connectResult);
      };
    };
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
              plugin.getConfig(),
              query,
              params
            );
          } else {
            span = utils.handleTextQuery.call(
              this,
              plugin.tracer,
              plugin.getConfig(),
              query
            );
          }
        } else if (typeof args[0] === 'object') {
          const queryConfig = args[0] as NormalizedQueryConfig;
          span = utils.handleConfigQuery.call(
            this,
            plugin.tracer,
            plugin.getConfig(),
            queryConfig
          );
        } else {
          return utils.handleInvalidQuery.call(
            this,
            plugin.tracer,
            plugin.getConfig(),
            original,
            ...args
          );
        }

        // Bind callback to parent span
        if (args.length > 0) {
          const parentSpan = trace.getSpan(context.active());
          if (typeof args[args.length - 1] === 'function') {
            // Patch ParameterQuery callback
            args[args.length - 1] = utils.patchCallback(
              plugin.getConfig(),
              span,
              args[args.length - 1] as PostgresCallback
            );
            // If a parent span exists, bind the callback
            if (parentSpan) {
              args[args.length - 1] = context.bind(
                context.active(),
                args[args.length - 1]
              );
            }
          } else if (
            typeof (args[0] as NormalizedQueryConfig).callback === 'function'
          ) {
            // Patch ConfigQuery callback
            let callback = utils.patchCallback(
              plugin.getConfig(),
              span,
              (args[0] as NormalizedQueryConfig).callback!
            );
            // If a parent span existed, bind the callback
            if (parentSpan) {
              callback = context.bind(context.active(), callback);
            }

            // Copy the callback instead of writing to args.callback so that we don't modify user's
            // original callback reference
            args[0] = { ...(args[0] as object), callback };
          }
        }

        // Perform the original query
        const result: unknown = original.apply(this, args as any);

        // Bind promise to parent span and end the span
        if (result instanceof Promise) {
          return result
            .then((result: unknown) => {
              // Return a pass-along promise which ends the span and then goes to user's orig resolvers
              return new Promise(resolve => {
                utils.handleExecutionResult(plugin.getConfig(), span, result);
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
        const connString = utils.getConnectionString(this.options);
        // setup span
        const span = startSpan(
          plugin.tracer,
          plugin.getConfig(),
          `${PG_POOL_COMPONENT}.connect`,
          {
            [SemanticAttributes.DB_SYSTEM]: DbSystemValues.POSTGRESQL,
            [SemanticAttributes.DB_NAME]: this.options.database, // required
            [SemanticAttributes.NET_PEER_NAME]: this.options.host, // required
            [SemanticAttributes.DB_CONNECTION_STRING]: connString, // required
            [SemanticAttributes.NET_PEER_PORT]: this.options.port,
            [SemanticAttributes.DB_USER]: this.options.user,
            [AttributeNames.IDLE_TIMEOUT_MILLIS]:
              this.options.idleTimeoutMillis,
            [AttributeNames.MAX_CLIENT]: this.options.maxClient,
          }
        );

        if (callback) {
          const parentSpan = trace.getSpan(context.active());
          callback = utils.patchCallbackPGPool(
            span,
            callback
          ) as PgPoolCallback;
          // If a parent span exists, bind the callback
          if (parentSpan) {
            callback = context.bind(context.active(), callback);
          }
        }

        const connectResult: unknown = context.with(
          trace.setSpan(context.active(), span),
          () => {
            return originalConnect.call(this, callback as any);
          }
        );

        return handleConnectResult(span, connectResult);
      };
    };
  }
}

function handleConnectResult(span: Span, connectResult: unknown) {
  if (!(connectResult instanceof Promise)) {
    return connectResult;
  }

  const connectResultPromise = connectResult as Promise<unknown>;
  return context.bind(
    context.active(),
    connectResultPromise
      .then(result => {
        span.end();
        return result;
      })
      .catch((error: Error) => {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.end();
        return Promise.reject(error);
      })
  );
}
