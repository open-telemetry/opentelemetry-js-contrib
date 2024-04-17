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
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';

import {
  context,
  trace,
  Span,
  SpanStatusCode,
  SpanKind,
} from '@opentelemetry/api';
import type * as pgTypes from 'pg';
import type * as pgPoolTypes from 'pg-pool';
import {
  PgClientConnect,
  PgClientExtended,
  PostgresCallback,
  PgPoolExtended,
  PgPoolCallback,
} from './internal-types';
import { PgInstrumentationConfig } from './types';
import * as utils from './utils';
import { addSqlCommenterComment } from '@opentelemetry/sql-common';
import { VERSION } from './version';
import { SpanNames } from './enums/SpanNames';

export class PgInstrumentation extends InstrumentationBase {
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
      ['8.*'],
      (module: any) => {
        const moduleExports: typeof pgTypes =
          module[Symbol.toStringTag] === 'Module'
            ? module.default // ESM
            : module; // CommonJS
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

        return module;
      },
      (module: any, moduleVersion) => {
        const moduleExports: typeof pgTypes =
          module[Symbol.toStringTag] === 'Module'
            ? module.default // ESM
            : module; // CommonJS
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
      (moduleExports, moduleVersion) => {
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
      return function connect(this: pgTypes.Client, callback?: Function) {
        if (utils.shouldSkipInstrumentation(plugin.getConfig())) {
          return original.call(this, callback);
        }

        const span = plugin.tracer.startSpan(SpanNames.CONNECT, {
          kind: SpanKind.CLIENT,
          attributes: utils.getSemanticAttributesFromConnection(this),
        });

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
      this._diag.debug('Patching pg.Client.prototype.query');
      return function query(this: PgClientExtended, ...args: unknown[]) {
        if (utils.shouldSkipInstrumentation(plugin.getConfig())) {
          return original.apply(this, args as never);
        }

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
        if (instrumentationConfig.addSqlCommenterCommentToQueries) {
          args[0] = firstArgIsString
            ? addSqlCommenterComment(span, arg0)
            : firstArgIsQueryObjectWithText
            ? {
                ...arg0,
                text: addSqlCommenterComment(span, arg0.text),
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

            (args[0] as { callback?: PostgresCallback }).callback = callback;
          }
        }

        if (
          typeof instrumentationConfig.requestHook === 'function' &&
          queryConfig
        ) {
          safeExecuteInTheMiddle(
            () => {
              // pick keys to expose explicitly, so we're not leaking pg package
              // internals that are subject to change
              const { database, host, port, user } = this.connectionParameters;
              const connection = { database, host, port, user };

              instrumentationConfig.requestHook!(span, {
                connection,
                query: {
                  text: queryConfig.text,
                  // nb: if `client.query` is called with illegal arguments
                  // (e.g., if `queryConfig.values` is passed explicitly, but a
                  // non-array is given), then the type casts will be wrong. But
                  // we leave it up to the queryHook to handle that, and we
                  // catch and swallow any errors it throws. The other options
                  // are all worse. E.g., we could leave `queryConfig.values`
                  // and `queryConfig.name` as `unknown`, but then the hook body
                  // would be forced to validate (or cast) them before using
                  // them, which seems incredibly cumbersome given that these
                  // casts will be correct 99.9% of the time -- and pg.query
                  // will immediately throw during development in the other .1%
                  // of cases. Alternatively, we could simply skip calling the
                  // hook when `values` or `name` don't have the expected type,
                  // but that would add unnecessary validation overhead to every
                  // hook invocation and possibly be even more confusing/unexpected.
                  values: queryConfig.values as unknown[],
                  name: queryConfig.name as string | undefined,
                },
              });
            },
            err => {
              if (err) {
                plugin._diag.error('Error running query hook', err);
              }
            },
            true
          );
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
        if (utils.shouldSkipInstrumentation(plugin.getConfig())) {
          return originalConnect.call(this, callback as any);
        }

        // setup span
        const span = plugin.tracer.startSpan(SpanNames.POOL_CONNECT, {
          kind: SpanKind.CLIENT,
          attributes: utils.getSemanticAttributesFromPool(this.options),
        });

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
