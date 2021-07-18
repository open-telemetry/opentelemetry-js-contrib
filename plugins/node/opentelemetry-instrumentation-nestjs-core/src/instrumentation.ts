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
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import type * as NestJS from '@nestjs/core';
import type { NestFactory } from '@nestjs/core/nest-factory.js';
import type { NestRouterExecutionContext } from '@nestjs/core/router/router-execution-context.js';
import type { CanActivate } from '@nestjs/common';
import type { Controller } from '@nestjs/common/interfaces';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
// import * as utils from './utils';
import { InstrumentationConfig } from './types';
import { VERSION } from './version';

const ATTR = {
  METHOD: 'http.method',
  URL: 'http.url',
  PATH: 'nest.route.path',
  MODULE: 'nest.module',
  CALLBACK: 'nest.callback',
  PIPES: 'nest.pipes',
  INTERCEPTORS: 'nest.interceptors',
  CONTROLLER_INSTANCE: 'nest.controller.instance',
  GUARDS: 'nest.guards',
};

export class Instrumentation extends InstrumentationBase<typeof NestJS> {
  static readonly COMPONENT = '@nestjs/core';
  static readonly COMMON_ATTRIBUTES = {
    component: Instrumentation.COMPONENT,
  };
  static readonly DEFAULT_CONFIG: InstrumentationConfig = {
    collectCommand: false,
  };

  constructor(config: InstrumentationConfig = Instrumentation.DEFAULT_CONFIG) {
    super(
      '@opentelemetry/instrumentation-nestjs-core',
      VERSION,
      Object.assign({}, Instrumentation.DEFAULT_CONFIG, config)
    );
  }

  setConfig(config: InstrumentationConfig = Instrumentation.DEFAULT_CONFIG) {
    this._config = Object.assign({}, Instrumentation.DEFAULT_CONFIG, config);
  }

  init() {
    const module = new InstrumentationNodeModuleDefinition<any>(
      Instrumentation.COMPONENT,
      ['>=4.0.0'],
      (moduleExports, moduleVersion) => {
        this._diag.debug(`Patching ${Instrumentation.COMPONENT}@${moduleVersion}`);
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
      this.getGuardsConsumerFileInstrumentation(['>=4.0.0 <=4.5.1']),
      this.getNestFactoryFileInstrumentation(['>=4.0.0']),
      this.getInterceptorsFileInstrumentation(['>=4.0.0']),
      this.getRouterExecutionContextFileInstrumentation(['>=4.0.0'])
    );

    return module;
  }

  getNestFactoryFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile<any>(
      '@nestjs/core/nest-factory.js',
      versions,
      (NestFactoryStatic: any) => {
        this._diag.debug('wrapping getNestFactoryFileInstrumentation');
        this._wrap(
          NestFactoryStatic.NestFactoryStatic.prototype,
          'create',
          createWrapNestFactoryCreate(this.tracer)
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
      (RouterExecutionContext: any) => {
        this._diag.debug('wrapping getRouterExecutionContextFileInstrumentation');
        this._wrap(
          RouterExecutionContext.RouterExecutionContext.prototype,
          'create',
          createWrapCreateHandler(this.tracer)
        );
        this._wrap(
          RouterExecutionContext.RouterExecutionContext.prototype,
          'createGuardsFn',
          createWrapCreateGuardsFn(this.tracer)
        );
        this._wrap(
          RouterExecutionContext.RouterExecutionContext.prototype,
          'createPipesFn',
          createWrapCreatePipesFn(this.tracer)
        );
        return RouterExecutionContext;
      },
      (RouterExecutionContext: any) => {
        this._unwrap(
          RouterExecutionContext.RouterExecutionContext.prototype,
          'create'
        );
        this._unwrap(
          RouterExecutionContext.RouterExecutionContext.prototype,
          'createGuardsFn'
        );
        this._unwrap(
          RouterExecutionContext.RouterExecutionContext.prototype,
          'createPipesFn'
        );
      }
    );
  }

  getGuardsConsumerFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile<any>(
      '@nestjs/core/guards/guards-consumer.js',
      versions,
      (GuardsConsumer: any) => {
        this._diag.debug('wrapping getGuardsConsumerFileInstrumentation');
        this._wrap(
          GuardsConsumer.GuardsConsumer.prototype,
          'tryActivate',
          createWrapTryActivate(this.tracer)
        );
        return GuardsConsumer;
      },
      (GuardsConsumer: any) => {
        this._unwrap(GuardsConsumer.GuardsConsumer.prototype, 'tryActivate');
      }
    );
  }

  getInterceptorsFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile<any>(
      '@nestjs/core/interceptors/interceptors-consumer.js',
      versions,
      (InterceptorsConsumer: any) => {
        this._diag.debug('wrapping getInterceptorsFileInstrumentation');
        this._wrap(
          InterceptorsConsumer.InterceptorsConsumer.prototype,
          'intercept',
          createWrapIntercept(this.tracer)
        );
        return InterceptorsConsumer;
      },
      (InterceptorsConsumer: any) => {
        this._unwrap(
          InterceptorsConsumer.InterceptorsConsumer.prototype,
          'intercept'
        );
      }
    );
  }

  ensureWrapped(
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

function createWrapNestFactoryCreate(tracer: api.Tracer) {
  return function wrapCreate(original: typeof NestFactory.create) {
    return function createWithTrace(
      this: typeof NestFactory,
      nestModule: any,
      /* serverOrOptions */
    ) {
      const span = tracer.startSpan('nest.factory.create', {
        attributes: {
          ...Instrumentation.COMMON_ATTRIBUTES,
          [ATTR.MODULE]: nestModule.name,
        },
      });
      const spanContext = api.trace.setSpan(api.context.active(), span);

      return api.context.with(spanContext, () => {
        try {
          return original.apply(this, arguments as any);
        } catch (e) {
          throw addError(span, e);
        } finally {
          span.end();
        }
      });
    };
  };
}

function createWrapCreateHandler(tracer: api.Tracer) {
  return function wrapCreateHandler(original: typeof NestRouterExecutionContext.create) {
    return function createHandlerWithTrace(this: typeof NestRouterExecutionContext, instance: Controller, callback: (...args: any[]) => unknown) {
      arguments[1] = createWrapHandler(tracer, callback);
      const handler = original.apply(this, arguments);
      return function (this: any, req: any, res: any, next: (...args: any[]) => unknown) {
        const opName = instance.constructor && instance.constructor.name ? instance.constructor.name : 'nest.request';

        const span = tracer.startSpan(opName, {
          attributes: {
            ...Instrumentation.COMMON_ATTRIBUTES,
            [ATTR.METHOD]: req.method,
            [ATTR.URL]: req.originalUrl,
            [ATTR.PATH]: req.route.path,
          },
        });
        const spanContext = api.trace.setSpan(api.context.active(), span);

        if (callback.name) {
          span.updateName(`${opName}(${callback.name})`);
          span.setAttribute(ATTR.CALLBACK, callback.name);
        }

        return api.context.with(spanContext, () => {
          try {
            return handler.apply(this, arguments);
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

function createWrapHandler(tracer: api.Tracer, handler: (...args: any[]) => unknown) {
  let name = 'nestHandler';
  if (handler.name) {
    name = handler.name;
  }
  const wrappedHandler = function (this: typeof NestRouterExecutionContext) {
    const attributes: api.SpanAttributes = { ...Instrumentation.COMMON_ATTRIBUTES };
    if (name) {
      attributes[ATTR.CALLBACK] = name;
    }
    const span = tracer.startSpan(name, { attributes });
    const spanContext = api.trace.setSpan(api.context.active(), span);

    return api.context.with(spanContext, () => {
      try {
        return handler.apply(this, arguments as any);
      } catch (e) {
        throw addError(span, e);
      } finally {
        span.end();
      }
    });
  };

  if (name) {
    Object.defineProperty(wrappedHandler, 'name', { value: name });
  }
  return wrappedHandler;
}

function createWrapCreateGuardsFn(tracer: api.Tracer) {
  return function wrapCreateGuardsFn(original: typeof NestRouterExecutionContext.createGuardsFn) {
    return function original(guards: CanActivate[], instance: Controller, callback: (...args: any[]) => any) {
      function wrappedCanActivateFn(canActivateFn: CanActivate[]) {
        return args => {
          if (typeof canActivateFn !== 'function') {
            return canActivateFn;
          }
          return createGuardsTrace(
            tracer,
            args,
            guards,
            instance,
            callback,
            canActivateFn
          );
        };
      }
      return wrappedCanActivateFn(original);
    };
  };
}

function createWrapTryActivate(tracer: api.Tracer) {
  return function wrapTryActivate(tryActivate) {
    return function tryActivateWithTrace(guards, args, instance, callback) {
      createGuardsTrace(tracer, args, guards, instance, callback, tryActivate);
    };
  };
}

function createWrapIntercept(tracer: api.Tracer) {
  return function wrapIntercept(original) {
    return function interceptWithTrace(
      interceptors,
      args,
      instance,
      callback,
      next,
      type
    ) {
      const opName = 'nest.interceptor.intercept';
      const request = args.length > 1 ? args[0] : args;

      const span = tracer.startSpan(opName, {
        attributes: {
          ...Instrumentation.COMMON_ATTRIBUTES,
        [ATTR.METHOD]: request.method,
        [ATTR.URL]: request.originalUrl,
        [ATTR.PATH]: request.route.path,
        },
      });
      const spanContext = api.trace.setSpan(api.context.active(), span);

      if (callback.name) {
        span.setAttribute(ATTR.CALLBACK, callback.name);
      }
      if (interceptors.length > 0) {
        const interceptorNames = interceptors.map(interceptor => {
          return interceptor.constructor.name;
        });
        span.setAttribute(ATTR.INTERCEPTORS, interceptorNames);
      }
      if (instance.constructor && instance.constructor.name) {
        span.setAttribute(
          ATTR.CONTROLLER_INSTANCE,
          instance.constructor.name
        );
      }

      return api.context.with(spanContext, () => {
        try {
          return original.apply(this, arguments);
        } catch (e) {
          throw addError(span, e);
        } finally {
          span.end();
        }
      });
    };
  };
}

function createWrapCreatePipesFn(tracer: api.Tracer) {
  return function wrapCreatePipesFn(original) {
    return function createPipesFnWithTrace(pipes, paramsOptions) {
      function wrappedPipesFn(pipesFn) {
        return (args, req, res, next) => {
          if (typeof pipesFn !== 'function') {
            return pipesFn;
          }

          let opName = 'nest.pipe.pipesFn';
          if (pipes.length > 0) {
            if (pipes[0].constructor && pipes[0].constructor.name) {
              opName = `${pipes[0].constructor.name}.pipeFn`;
            }
          }
          const span = tracer.startSpan(opName, {
            attributes: {
              ...Instrumentation.COMMON_ATTRIBUTES,
            },
          });
          const spanContext = api.trace.setSpan(api.context.active(), span);
          if (paramsOptions && paramsOptions[0]) {
            const pipeOptions = paramsOptions[0].pipes;
            const pipes = [];
            pipeOptions.forEach(param => {
              if (param.constructor && param.constructor.name) {
                pipes.push(param.constructor.name);
              }
            });
            if (pipes.length > 0) {
              span.setAttribute(ATTR.PIPES, pipes);
            }
          }

          return api.context.with(spanContext, () => {
            try {
              return pipesFn.apply(this, [args, req, res, next]);
            } catch (e) {
              throw addError(span, e);
            } finally {
              span.end();
            }
          });
        };
      }
      return wrappedPipesFn(original.apply(this, arguments));
    };
  };
}

function createGuardsTrace(tracer, args, guards, instance, callback, fn) {
  let opName = 'nest.guard.canActivate';
  const request = args.length > 1 ? args[0] : args;
  const span = tracer.startSpan(opName, {
    attributes: {
      ...Instrumentation.COMMON_ATTRIBUTES,
      [ATTR.METHOD]: request.method,
      [ATTR.URL]: request.originalUrl,
      [ATTR.PATH]: request.route.path,
    },
  });
  const spanContext = api.trace.setSpan(api.context.active(), span);

  const guardNames = guards.map(guardName => guardName.constructor.name);
  if (guardNames.length > 0) {
    if (guardNames[0].constructor && guardNames[0].constructor.name) {
      opName = `${guardNames[0]}.tryActivate`;
    }
    span.setAttribute(ATTR.GUARDS, guardNames);
  }
  if (instance.constructor && instance.constructor.name) {
    opName = `${opName}.${instance.constructor.name}`;
    span.setAttribute(ATTR.CONTROLLER_INSTANCE, instance.constructor.name);
  }
  if (callback.name) {
    opName = `${opName}(${callback.name})`;
    span.setAttribute(ATTR.CALLBACK, callback.name);
  }

  span.updateName(opName);

  return api.context.with(spanContext, () => {
    try {
      return fn.apply(this, args);
    } catch (e) {
      throw addError(span, e);
    } finally {
      span.end();
    }
  });
}

function addError(span, error) {
  span.recordException(error);
  span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
  return error;
}
