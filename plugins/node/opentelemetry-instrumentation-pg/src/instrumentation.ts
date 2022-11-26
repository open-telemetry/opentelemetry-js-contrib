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
import type * as pgTypes from 'pg';
import type * as pgPoolTypes from 'pg-pool';
import {
  PgClientConnect,
  PgClientExtended,
  PgErrorCallback,
  PostgresCallback,
  PgPoolExtended,
  PgPoolCallback,
} from './internal-types';
import { PgInstrumentationConfig } from './types';
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
        // client.query(text, cb?), client.query(text, values, cb?), and
        // client.query(configObj, cb?) are all valid signatures. We construct
        // a queryConfig obj from all (valid) signatures to build the span in a
        // unified way. We verify that we at least have query text, and code
        // defensively when dealing with `queryConfig` after that (to handle all
        // the other invalid cases, like a non-array for values being provided).
        // The type casts here reflect only what we've actually validated.
        const arg0 = args[0];
        const firstArgIsString = typeof arg0 === 'string';
        const firstArgIsQueryObjectWithText =
          utils.isObjectWithTextString(arg0);

        // TODO: remove the `as ...` casts below when the TS version is upgraded.
        // Newer TS versions will use the result of firstArgIsQueryObjectWithText
        // to properly narrow arg0, but TS 4.3.5 does not.
        const queryConfig = firstArgIsString
          ? {
              text: arg0 as string,
              values: Array.isArray(args[1]) ? args[1] : undefined,
            }
          : firstArgIsQueryObjectWithText
          ? (arg0 as utils.ObjectWithText)
          : undefined;

        const instrumentationConfig = plugin.getConfig();

        const span = utils.handleConfigQuery.call(
          this,
          plugin.tracer,
          instrumentationConfig,
          queryConfig
        );

        // Modify query text w/ a tracing comment before invoking original for
        // tracing, but only if args[0] has one of our expected shapes.
        //
        // TODO: remove the `as ...` casts below when the TS version is upgraded.
        // Newer TS versions will use the result of firstArgIsQueryObjectWithText
        // to properly narrow arg0, but TS 4.3.5 does not.
        if (instrumentationConfig.addSqlCommenterCommentToQueries) {
          args[0] = firstArgIsString
            ? utils.addSqlCommenterComment(span, arg0 as string)
            : firstArgIsQueryObjectWithText
            ? {
                ...(arg0 as utils.ObjectWithText),
                text: utils.addSqlCommenterComment(
                  span,
                  (arg0 as utils.ObjectWithText).text
                ),
              }
            : args[0];
        }

        // Bind callback (if any) to parent span (if any)
        if (args.length > 0) {
          const parentSpan = trace.getSpan(context.active());
          if (typeof args[args.length - 1] === 'function') {
            // Patch ParameterQuery callback
            args[args.length - 1] = utils.patchCallback(
              instrumentationConfig,
              span,
              args[args.length - 1] as PostgresCallback // nb: not type safe.
            );

            // If a parent span exists, bind the callback
            if (parentSpan) {
              args[args.length - 1] = context.bind(
                context.active(),
                args[args.length - 1]
              );
            }
          } else if (typeof queryConfig?.callback === 'function') {
            // Patch ConfigQuery callback
            let callback = utils.patchCallback(
              plugin.getConfig(),
              span,
              queryConfig.callback as PostgresCallback // nb: not type safe.
            );

            // If a parent span existed, bind the callback
            if (parentSpan) {
              callback = context.bind(context.active(), callback);
            }

            // Copy the callback instead of writing to args.callback so that we
            // don't modify user's original callback reference
            args[0] = { ...(args[0] as object), callback };
          }
        }

        let result: unknown;
        try {
          result = original.apply(this, args as never);
        } catch (e: unknown) {
          // span.recordException(e);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: utils.getErrorMessage(e),
          });
          span.end();
          throw e;
        }

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
      .catch((error: unknown) => {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: utils.getErrorMessage(error),
        });
        span.end();
        return Promise.reject(error);
      })
  );
}
