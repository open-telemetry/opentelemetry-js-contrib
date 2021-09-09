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
  Span,
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
import {
  AttributeNames,
  FastifyNames,
  FastifyTypes,
} from './enums/AttributeNames';
import type { HandlerOriginal } from './types';
import { safeExecuteInTheMiddleMaybePromise } from './utils';
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
        ['^3.0.0'],
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
      const rpcMetadata = getRPCMetadata(context.active());
      const routeName = request.routerPath;
      if (routeName && rpcMetadata?.type === RPCType.HTTP) {
        rpcMetadata.span.updateName(`${request.method} ${routeName || '/'}`);
      }
      done();
    };
  }

  private _wrapHandler(
    pluginName: string,
    hookName: string,
    original: () => Promise<any> | void
  ): () => Promise<any> | void {
    const instrumentation = this;
    return function (this: any, ...args): Promise<any> | void {
      if (!instrumentation.isEnabled()) {
        return original.apply(this, args);
      }

      const spanName = `${FastifyNames.MIDDLEWARE} - ${
        original.name || ANONYMOUS_NAME
      }`;

      const span = instrumentation._startSpan(spanName, {
        [AttributeNames.FASTIFY_TYPE]: FastifyTypes.MIDDLEWARE,
        [AttributeNames.PLUGIN_NAME]: pluginName,
        [AttributeNames.HOOK_NAME]: hookName,
      });

      return safeExecuteInTheMiddleMaybePromise(
        () => {
          return original.apply(this, args);
        },
        err => {
          if (err) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: err.message,
            });
            span.recordException(err);
          }
          span.end();
        }
      );
    };
  }

  private _wrapAddHook(): (
    original: FastifyInstance['addHook']
  ) => () => FastifyInstance {
    const instrumentation = this;
    return function (
      original: FastifyInstance['addHook']
    ): () => FastifyInstance {
      return function wrappedAddHook(this: any, ...args: any) {
        const name = args[0] as string;
        const handler = args[1] as HandlerOriginal;
        const pluginName = this.pluginName;
        if (name === 'onRegister') {
          return original.apply(this, [name as any, handler]);
        }
        return original.apply(this, [
          name as any,
          instrumentation._wrapHandler(pluginName, name, handler),
        ]);
      };
    };
  }

  private _patchConstructor(
    original: () => FastifyInstance
  ): () => FastifyInstance {
    const instrumentation = this;
    return function fastify(this: FastifyInstance, ...args) {
      const app: FastifyInstance = original.apply(this, args);
      app.addHook('onRequest', instrumentation._hookOnRequest());
      app.addHook('preHandler', instrumentation._hookPreHandler());

      instrumentation._wrap(app, 'addHook', instrumentation._wrapAddHook());

      return app;
    };
  }

  public _patchSend(span: Span) {
    const instrumentation = this;
    return function patchSend(
      original: () => FastifyReply
    ): () => FastifyReply {
      return function send(this: FastifyReply, ...args) {
        if (!instrumentation.isEnabled()) {
          return original.apply(this, args);
        }

        return safeExecuteInTheMiddle<FastifyReply>(
          () => {
            return original.apply(this, args);
          },
          err => {
            if (err) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              });
              span.recordException(err);
            }
            span.end();
          }
        );
      };
    };
  }

  public _hookPreHandler() {
    const instrumentation = this;
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
      const span = instrumentation._startSpan(spanName, spanAttributes);
      instrumentation._wrap(reply, 'send', instrumentation._patchSend(span));
      return context.with(trace.setSpan(context.active(), span), () => {
        done();
      });
    };
  }

  public _startSpan(
    spanName: string,
    spanAttributes: SpanAttributes = {}
  ): Span {
    return this.tracer.startSpan(spanName, { attributes: spanAttributes });
  }
}
