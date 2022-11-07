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

import { context, diag, Span, SpanOptions } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import type { HandleFunction, NextFunction, Server } from 'connect';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  AttributeNames,
  ConnectNames,
  ConnectTypes,
} from './enums/AttributeNames';
import { Use, UseArgs, UseArgs2 } from './internal-types';
import { VERSION } from './version';
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

export const ANONYMOUS_NAME = 'anonymous';

/** Connect instrumentation for OpenTelemetry */
export class ConnectInstrumentation extends InstrumentationBase<Server> {
  constructor(config: InstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-connect',
      VERSION,
      Object.assign({}, config)
    );
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition<any>(
        'connect',
        ['^3.0.0'],
        (moduleExports, moduleVersion) => {
          diag.debug(`Applying patch for connect@${moduleVersion}`);
          return this._patchConstructor(moduleExports);
        },
        (moduleExports, moduleVersion) => {
          diag.debug(`Removing patch for connect@${moduleVersion}`);
        }
      ),
    ];
  }

  private _patchApp(patchedApp: Server) {
    if (!isWrapped(patchedApp.use)) {
      this._wrap(patchedApp, 'use', this._patchUse.bind(this));
    }
  }

  private _patchConstructor(original: () => Server): () => Server {
    const instrumentation = this;
    return function (this: Server, ...args) {
      const app = original.apply(this, args) as Server;
      instrumentation._patchApp(app);
      return app;
    };
  }

  public _patchNext(next: NextFunction, finishSpan: () => void): NextFunction {
    return function nextFunction(this: NextFunction, err?: any): void {
      const result = next.apply(this, [err]);
      finishSpan();
      return result;
    };
  }

  public _startSpan(routeName: string, middleWare: HandleFunction): Span {
    let connectType: ConnectTypes;
    let connectName: string;
    let connectTypeName: string;
    if (routeName) {
      connectType = ConnectTypes.REQUEST_HANDLER;
      connectTypeName = ConnectNames.REQUEST_HANDLER;
      connectName = routeName;
    } else {
      connectType = ConnectTypes.MIDDLEWARE;
      connectTypeName = ConnectNames.MIDDLEWARE;
      connectName = middleWare.name || ANONYMOUS_NAME;
    }
    const spanName = `${connectTypeName} - ${connectName}`;
    const options: SpanOptions = {
      attributes: {
        [SemanticAttributes.HTTP_ROUTE]: routeName.length > 0 ? routeName : '/',
        [AttributeNames.CONNECT_TYPE]: connectType,
        [AttributeNames.CONNECT_NAME]: connectName,
      },
    };

    return this.tracer.startSpan(spanName, options);
  }

  public _patchMiddleware(
    routeName: string,
    middleWare: HandleFunction
  ): HandleFunction {
    const instrumentation = this;
    const isErrorMiddleware = middleWare.length === 4;

    function patchedMiddleware(this: Use): void {
      if (!instrumentation.isEnabled()) {
        return (middleWare as any).apply(this, arguments);
      }
      const [reqArgIdx, resArgIdx, nextArgIdx] = isErrorMiddleware
        ? [1, 2, 3]
        : [0, 1, 2];
      const req = arguments[reqArgIdx] as IncomingMessage;
      const res = arguments[resArgIdx] as ServerResponse;
      const next = arguments[nextArgIdx] as NextFunction;

      const rpcMetadata = getRPCMetadata(context.active());
      if (routeName && rpcMetadata?.type === RPCType.HTTP) {
        rpcMetadata.span.updateName(`${req.method} ${routeName || '/'}`);
      }
      let spanName = '';
      if (routeName) {
        spanName = `request handler - ${routeName}`;
      } else {
        spanName = `middleware - ${middleWare.name || ANONYMOUS_NAME}`;
      }
      const span = instrumentation._startSpan(routeName, middleWare);
      instrumentation._diag.debug('start span', spanName);
      let spanFinished = false;

      function finishSpan() {
        if (!spanFinished) {
          spanFinished = true;
          instrumentation._diag.debug(`finishing span ${(span as any).name}`);
          span.end();
        } else {
          instrumentation._diag.debug(
            `span ${(span as any).name} - already finished`
          );
        }
        res.removeListener('close', finishSpan);
      }

      res.addListener('close', finishSpan);
      arguments[nextArgIdx] = instrumentation._patchNext(next, finishSpan);

      return (middleWare as any).apply(this, arguments);
    }

    Object.defineProperty(patchedMiddleware, 'length', {
      value: middleWare.length,
      writable: false,
      configurable: true,
    });

    return patchedMiddleware;
  }

  public _patchUse(original: Server['use']): Use {
    const instrumentation = this;
    return function (this: Server, ...args: UseArgs): Server {
      const middleWare = args[args.length - 1] as HandleFunction;
      const routeName = (args[args.length - 2] || '') as string;

      args[args.length - 1] = instrumentation._patchMiddleware(
        routeName,
        middleWare
      );

      return original.apply(this, args as UseArgs2);
    };
  }
}
