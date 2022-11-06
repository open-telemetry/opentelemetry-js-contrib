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
  context,
  SpanAttributes,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { HookHandlerDoneFunction } from 'fastify/types/hooks';
import type { FastifyInstance } from 'fastify/types/instance';
import type { FastifyReply } from 'fastify/types/reply';
import type { FastifyRequest } from 'fastify/types/request';
import { applicationHookNames } from './constants';
import {
  AttributeNames,
  FastifyNames,
  FastifyTypes,
} from './enums/AttributeNames';
import type { HandlerOriginal, PluginFastifyReply } from './internal-types';
import {
  endSpan,
  safeExecuteInTheMiddleMaybePromise,
  startSpan,
} from './utils';
import { VERSION } from './version';

export const ANONYMOUS_NAME = 'anonymous';

/** Fastify instrumentation for OpenTelemetry */
export class FastifyInstrumentation extends InstrumentationBase {
  constructor(config: InstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-fastify',
      VERSION,
      Object.assign({}, config)
    );
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition<any>(
        'fastify',
        ['^3.0.0', '^4.0.0'],
        (moduleExports, moduleVersion) => {
          this._diag.debug(`Applying patch for fastify@${moduleVersion}`);
          return this._patchConstructor(moduleExports);
        }
      ),
    ];
  }

  private _hookOnRequest() {
    const instrumentation = this;
    return function onRequest(
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction
    ) {
      if (!instrumentation.isEnabled()) {
        return done();
      }
      instrumentation._wrap(reply, 'send', instrumentation._patchSend());

      const rpcMetadata = getRPCMetadata(context.active());
      const routeName = request.routerPath;
      if (routeName && rpcMetadata?.type === RPCType.HTTP) {
        rpcMetadata.span.setAttribute(SemanticAttributes.HTTP_ROUTE, routeName);
        rpcMetadata.span.updateName(`${request.method} ${routeName}`);
      }
      done();
    };
  }

  private _wrapHandler(
    pluginName: string,
    hookName: string,
    original: (...args: unknown[]) => Promise<unknown>,
    syncFunctionWithDone: boolean
  ): () => Promise<unknown> {
    const instrumentation = this;
    this._diag.debug('Patching fastify route.handler function');

    return function (this: any, ...args: unknown[]): Promise<unknown> {
      if (!instrumentation.isEnabled()) {
        return original.apply(this, args);
      }

      const spanName = `${FastifyNames.MIDDLEWARE} - ${
        original.name || ANONYMOUS_NAME
      }`;

      const reply = args[1] as PluginFastifyReply;

      const span = startSpan(reply, instrumentation.tracer, spanName, {
        [AttributeNames.FASTIFY_TYPE]: FastifyTypes.MIDDLEWARE,
        [AttributeNames.PLUGIN_NAME]: pluginName,
        [AttributeNames.HOOK_NAME]: hookName,
      });

      const origDone =
        syncFunctionWithDone &&
        (args[args.length - 1] as HookHandlerDoneFunction);
      if (origDone) {
        args[args.length - 1] = function (
          ...doneArgs: Parameters<HookHandlerDoneFunction>
        ) {
          endSpan(reply);
          origDone.apply(this, doneArgs);
        };
      }

      return context.with(trace.setSpan(context.active(), span), () => {
        return safeExecuteInTheMiddleMaybePromise(
          () => {
            return original.apply(this, args);
          },
          err => {
            if (err instanceof Error) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              });
              span.recordException(err);
            }
            // async hooks should end the span as soon as the promise is resolved
            if (!syncFunctionWithDone) {
              endSpan(reply);
            }
          }
        );
      });
    };
  }

  private _wrapAddHook(): (
    original: FastifyInstance['addHook']
  ) => () => FastifyInstance {
    const instrumentation = this;
    this._diag.debug('Patching fastify server.addHook function');

    return function (
      original: FastifyInstance['addHook']
    ): () => FastifyInstance {
      return function wrappedAddHook(this: any, ...args: any) {
        const name = args[0] as string;
        const handler = args[1] as HandlerOriginal;
        const pluginName = this.pluginName;
        if (applicationHookNames.includes(name)) {
          return original.apply(this, [name as any, handler]);
        }

        const syncFunctionWithDone =
          typeof args[args.length - 1] === 'function' &&
          handler.constructor.name !== 'AsyncFunction';

        return original.apply(this, [
          name as any,
          instrumentation._wrapHandler(
            pluginName,
            name,
            handler,
            syncFunctionWithDone
          ),
        ]);
      };
    };
  }

  private _patchConstructor(
    original: () => FastifyInstance
  ): () => FastifyInstance {
    const instrumentation = this;
    this._diag.debug('Patching fastify constructor function');

    function fastify(this: FastifyInstance, ...args: any) {
      const app: FastifyInstance = original.apply(this, args);
      app.addHook('onRequest', instrumentation._hookOnRequest());
      app.addHook('preHandler', instrumentation._hookPreHandler());

      instrumentation._wrap(app, 'addHook', instrumentation._wrapAddHook());

      return app;
    }

    fastify.fastify = fastify;
    fastify.default = fastify;
    return fastify;
  }

  private _patchSend() {
    const instrumentation = this;
    this._diag.debug('Patching fastify reply.send function');

    return function patchSend(
      original: () => FastifyReply
    ): () => FastifyReply {
      return function send(this: FastifyReply, ...args: any) {
        const maybeError: any = args[0];

        if (!instrumentation.isEnabled()) {
          return original.apply(this, args);
        }

        return safeExecuteInTheMiddle<FastifyReply>(
          () => {
            return original.apply(this, args);
          },
          err => {
            if (!err && maybeError instanceof Error) {
              err = maybeError;
            }
            endSpan(this, err);
          }
        );
      };
    };
  }

  private _hookPreHandler() {
    const instrumentation = this;
    this._diag.debug('Patching fastify preHandler function');

    return function preHandler(
      this: any,
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction
    ) {
      if (!instrumentation.isEnabled()) {
        return done();
      }
      const requestContext = (request as any).context || {};
      const handlerName = (requestContext.handler?.name || '').substr(6);
      const spanName = `${FastifyNames.REQUEST_HANDLER} - ${
        handlerName || ANONYMOUS_NAME
      }`;

      const spanAttributes: SpanAttributes = {
        [AttributeNames.PLUGIN_NAME]: this.pluginName,
        [AttributeNames.FASTIFY_TYPE]: FastifyTypes.REQUEST_HANDLER,
        [SemanticAttributes.HTTP_ROUTE]: request.routerPath,
      };
      if (handlerName) {
        spanAttributes[AttributeNames.FASTIFY_NAME] = handlerName;
      }
      const span = startSpan(
        reply,
        instrumentation.tracer,
        spanName,
        spanAttributes
      );
      return context.with(trace.setSpan(context.active(), span), () => {
        done();
      });
    };
  }
}
