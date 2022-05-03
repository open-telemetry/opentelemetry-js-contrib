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
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import type { NestFactory } from '@nestjs/core/nest-factory.js';
import type { RouterExecutionContext } from '@nestjs/core/router/router-execution-context.js';
import type { Controller } from '@nestjs/common/interfaces';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { VERSION } from './version';
import { AttributeNames, NestType } from './enums';

export class Instrumentation extends InstrumentationBase<any> {
  static readonly COMPONENT = '@nestjs/core';
  static readonly COMMON_ATTRIBUTES = {
    component: Instrumentation.COMPONENT,
  };

  constructor(config: InstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-nestjs-core', VERSION);
  }

  init() {
    const module = new InstrumentationNodeModuleDefinition<any>(
      Instrumentation.COMPONENT,
      ['>=4.0.0'],
      (moduleExports, moduleVersion) => {
        this._diag.debug(
          `Patching ${Instrumentation.COMPONENT}@${moduleVersion}`
        );
        return moduleExports;
      },
      (moduleExports, moduleVersion) => {
        this._diag.debug(
          `Unpatching ${Instrumentation.COMPONENT}@${moduleVersion}`
        );
        if (moduleExports === undefined) return;
      }
    );

    module.files.push(
      this.getNestFactoryFileInstrumentation(['>=4.0.0']),
      this.getRouterExecutionContextFileInstrumentation(['>=4.0.0'])
    );

    return module;
  }

  getNestFactoryFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile<any>(
      '@nestjs/core/nest-factory.js',
      versions,
      (NestFactoryStatic: any, moduleVersion?: string) => {
        this.ensureWrapped(
          moduleVersion,
          NestFactoryStatic.NestFactoryStatic.prototype,
          'create',
          createWrapNestFactoryCreate(this.tracer, moduleVersion)
        );
        return NestFactoryStatic;
      },
      (NestFactoryStatic: any) => {
        this._unwrap(NestFactoryStatic.NestFactoryStatic.prototype, 'create');
      }
    );
  }

  getRouterExecutionContextFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile<any>(
      '@nestjs/core/router/router-execution-context.js',
      versions,
      (RouterExecutionContext: any, moduleVersion?: string) => {
        this.ensureWrapped(
          moduleVersion,
          RouterExecutionContext.RouterExecutionContext.prototype,
          'create',
          createWrapCreateHandler(this.tracer, moduleVersion)
        );
        return RouterExecutionContext;
      },
      (RouterExecutionContext: any) => {
        this._unwrap(
          RouterExecutionContext.RouterExecutionContext.prototype,
          'create'
        );
      }
    );
  }

  private ensureWrapped(
    moduleVersion: string | undefined,
    obj: any,
    methodName: string,
    wrapper: (original: any) => any
  ) {
    this._diag.debug(
      `Applying ${methodName} patch for ${Instrumentation.COMPONENT}@${moduleVersion}`
    );
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}

function createWrapNestFactoryCreate(
  tracer: api.Tracer,
  moduleVersion?: string
) {
  return function wrapCreate(original: typeof NestFactory.create) {
    return function createWithTrace(
      this: typeof NestFactory,
      nestModule: any
      /* serverOrOptions */
    ) {
      const span = tracer.startSpan('Create Nest App', {
        attributes: {
          ...Instrumentation.COMMON_ATTRIBUTES,
          [AttributeNames.TYPE]: NestType.APP_CREATION,
          [AttributeNames.VERSION]: moduleVersion,
          [AttributeNames.MODULE]: nestModule.name,
        },
      });
      const spanContext = api.trace.setSpan(api.context.active(), span);

      return api.context.with(spanContext, async () => {
        try {
          return await original.apply(this, arguments as any);
        } catch (e) {
          throw addError(span, e);
        } finally {
          span.end();
        }
      });
    };
  };
}

function createWrapCreateHandler(tracer: api.Tracer, moduleVersion?: string) {
  return function wrapCreateHandler(
    original: RouterExecutionContext['create']
  ) {
    return function createHandlerWithTrace(
      this: RouterExecutionContext,
      instance: Controller,
      callback: (...args: any[]) => unknown
    ) {
      arguments[1] = createWrapHandler(tracer, moduleVersion, callback);
      const handler = original.apply(this, arguments as any);
      return function (
        this: any,
        req: any,
        res: any,
        next: (...args: any[]) => unknown
      ) {
        const callbackName = callback.name;
        const instanceName =
          instance.constructor && instance.constructor.name
            ? instance.constructor.name
            : 'UnnamedInstance';
        const spanName = callbackName
          ? `${instanceName}.${callbackName}`
          : instanceName;

        const span = tracer.startSpan(spanName, {
          attributes: {
            ...Instrumentation.COMMON_ATTRIBUTES,
            [AttributeNames.VERSION]: moduleVersion,
            [AttributeNames.TYPE]: NestType.REQUEST_CONTEXT,
            [SemanticAttributes.HTTP_METHOD]: req.method,
            [SemanticAttributes.HTTP_URL]: req.originalUrl || req.url,
            [SemanticAttributes.HTTP_ROUTE]: req.route?.path || req.routerPath,
            [AttributeNames.CONTROLLER]: instanceName,
            [AttributeNames.CALLBACK]: callbackName,
          },
        });
        const spanContext = api.trace.setSpan(api.context.active(), span);

        return api.context.with(spanContext, async () => {
          try {
            return await handler.apply(this, arguments as any);
          } catch (e) {
            throw addError(span, e);
          } finally {
            span.end();
          }
        });
      };
    };
  };
}

function createWrapHandler(
  tracer: api.Tracer,
  moduleVersion: string | undefined,
  handler: Function
) {
  const wrappedHandler = function (this: RouterExecutionContext) {
    const span = tracer.startSpan(handler.name || 'anonymous nest handler', {
      attributes: {
        ...Instrumentation.COMMON_ATTRIBUTES,
        [AttributeNames.VERSION]: moduleVersion,
        [AttributeNames.TYPE]: NestType.REQUEST_HANDLER,
        [AttributeNames.CALLBACK]: handler.name,
      },
    });
    const spanContext = api.trace.setSpan(api.context.active(), span);

    return api.context.with(spanContext, async () => {
      try {
        return await handler.apply(this, arguments);
      } catch (e) {
        throw addError(span, e);
      } finally {
        span.end();
      }
    });
  };

  if (handler.name) {
    Object.defineProperty(wrappedHandler, 'name', { value: handler.name });
  }

  // Get the current metadata and set onto the wrapper to ensure other decorators ( ie: NestJS EventPattern / RolesGuard )
  // won't be affected by the use of this instrumentation
  Reflect.getMetadataKeys(handler).forEach(metadataKey => {
    Reflect.defineMetadata(
      metadataKey,
      Reflect.getMetadata(metadataKey, handler),
      wrappedHandler
    );
  });
  return wrappedHandler;
}

const addError = (span: api.Span, error: Error) => {
  span.recordException(error);
  span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
  return error;
};
