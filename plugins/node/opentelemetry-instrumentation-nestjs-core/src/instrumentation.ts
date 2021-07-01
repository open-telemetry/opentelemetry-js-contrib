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
  isWrapped
} from '@opentelemetry/instrumentation';
import type * as NestJS from '@nestjs/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
// import * as utils from './utils';
import { InstrumentationConfig } from './types';
import { VERSION } from './version';

export class Instrumentation extends InstrumentationBase<typeof NestJS> {
  static readonly COMPONENT = '@nestjs/core';
  static readonly COMMON_ATTRIBUTES = {
    'component': Instrumentation.COMPONENT,
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
      ['>=2.2'],
      (moduleExports, moduleVersion) => {
        console.debug(
          `Patching ${Instrumentation.COMPONENT}@${moduleVersion}`
        );
        // this.ensureWrapped(
        //   moduleVersion,
        //   moduleExports.prototype,
        //   'command',
        // );

        return moduleExports;
      },
      (moduleExports, moduleVersion) => {
        console.debug(
          `Unpatching ${Instrumentation.COMPONENT}@${moduleVersion}`
        );
        if (moduleExports === undefined) return;
        // `command` is documented API missing from the types
        // this._unwrap(moduleExports.prototype, 'command' as keyof Memcached);
      },
    );

    module.files.push(
      this.getNestFactoryFileInstrumentation(['>=6.0.0 <7.0.0']),
      this.getRouterExecutionContextFileInstrumentation(['>=6.0.0 <7.0.0']),
      this.getInterceptorsFileInstrumentation(['>=6.0.0 <7.0.0']),
      this.getRouterExecutionContextGuardFileInstrumentation(['>=6.0.0 <7.0.0']),
      this.getRouterExecutionContextPipesFileInstrumentation(['>=6.0.0 <7.0.0']),
    );

    console.log('module.files', module.files);
    return module;
  }

  private getNestFactoryFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile<any>(
      '@nestjs/core/nest-factory.js',
      versions,
      (NestFactoryStatic: any) => {
        console.log('wrapping getNestFactoryFileInstrumentation');
        this._wrap(NestFactoryStatic.NestFactoryStatic.prototype,
          'create',
          createWrapNestFactoryCreate(this.tracer, this._config));
        return NestFactoryStatic;
      },
      (NestFactoryStatic: any) => {
        this._unwrap(NestFactoryStatic.NestFactoryStatic.prototype, 'create');
      });
  }

  private getRouterExecutionContextFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile<any>(
      '@nestjs/core/router/router-execution-context.js',
      versions,
      (RouterExecutionContext: any) => {
        console.log('wrapping getRouterExecutionContextFileInstrumentation');
        this._wrap(RouterExecutionContext.RouterExecutionContext.prototype,
          'create',
          createWrapCreateHandler(this.tracer, this._config));
        return RouterExecutionContext;
      },
      (RouterExecutionContext: any) => {
        this._unwrap(RouterExecutionContext.RouterExecutionContext.prototype, 'create');
      });
  }

  private getGuardsConsumerFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile<any>(
      '@nestjs/core/guards/guards-consumer.js',
      versions,
      (GuardsConsumer: any) => {
        console.log('wrapping getGuardsConsumerFileInstrumentation');
        this._wrap(GuardsConsumer.GuardsConsumer.prototype,
          'tryActivate',
          createWrapTryActivate(this.tracer, this._config));
        return GuardsConsumer;
      },
      (GuardsConsumer: any) => {
        this._unwrap(GuardsConsumer.GuardsConsumer.prototype, 'tryActivate');
      });
  }

  private getRouterExecutionContextGuardFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile<any>(
      '@nestjs/core/router/router-execution-context.js',
      versions,
      (RouterExecutionContext: any) => {
        console.log('wrapping getRouterExecutionContextGuardFileInstrumentation');
        this._wrap(RouterExecutionContext.RouterExecutionContext.prototype,
          'createGuardsFn',
          createWrapCreateGuardsFn(this.tracer, this._config));
        return RouterExecutionContext;
      },
      (RouterExecutionContext: any) => {
        this._unwrap(RouterExecutionContext.RouterExecutionContext.prototype, 'createGuardsFn');
      });
  }

  private getInterceptorsFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile<any>(
      '@nestjs/core/interceptors/interceptors-consumer.js',
      versions,
      (InterceptorsConsumer: any) => {
        console.log('wrapping getInterceptorsFileInstrumentation');
        this._wrap(InterceptorsConsumer.InterceptorsConsumer.prototype,
          'intercept',
          createWrapIntercept(this.tracer, this._config));
        return InterceptorsConsumer;
      },
      (InterceptorsConsumer: any) => {
        this._unwrap(InterceptorsConsumer.InterceptorsConsumer.prototype, 'intercept');
      });
  }

  private getRouterExecutionContextPipesFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile<any>(
      '@nestjs/core/router/router-execution-context.js',
      versions,
      (RouterExecutionContext: any) => {
        console.log('wrapping getRouterExecutionContextPipesFileInstrumentation');
        this._wrap(RouterExecutionContext.RouterExecutionContext.prototype,
          'createPipesFn',
          createWrapCreatePipesFn(this.tracer, this._config));
        return RouterExecutionContext;
      },
      (RouterExecutionContext: any) => {
        this._unwrap(RouterExecutionContext.RouterExecutionContext.prototype, 'createPipesFn');
      });
  }

  private ensureWrapped(
    moduleVersion: string | undefined,
    obj: any,
    methodName: string,
    wrapper: (original: any) => any
  ) {
    console.debug(
      `Applying ${methodName} patch for ${Instrumentation.COMPONENT}@${moduleVersion}`
    );
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}

function createWrapNestFactoryCreate (tracer, config) {
  return function wrapCreate (original) {
    return function createWithTrace (this: any, nestModule, serverOrOptions, options) {
      console.log('called!!');
      const span = tracer.startSpan('nest.factory.create', {
        attributes: {
          ...Instrumentation.COMMON_ATTRIBUTES,
          'nest.module': nestModule.name
        }
      });
      const spanContext = api.trace.setSpan(api.context.active(), span);

      return api.context.with(spanContext, () => {
        try {
          // TODO: this is a Promise
          return original.apply(this, arguments)
        } catch (e) {
          throw addError(span, e)
        } finally {
          span.end()
        }
      });
    }
  }
}

function createWrapCreateHandler(tracer, config) {
  return function wrapCreateHandler (create) {
    return function createHandlerWithTrace (instance, callback) {
      arguments[1] = createWrapHandler(tracer, callback)
      const handler = create.apply(this, arguments);
      return function (req, res, next) {
        let opName = 'nest.request'
        if (instance.constructor && instance.constructor.name) {
          opName = instance.constructor.name
        }
        const span = tracer.startSpan(opName, {
          attributes: {
            ...Instrumentation.COMMON_ATTRIBUTES,
            'http.method': req.method,
            'http.url': req.originalUrl,
            'nest.route.path': req.route.path
          }
        });
        const spanContext = api.trace.setSpan(api.context.active(), span);

        if (callback.name) {
          opName = `${opName}(${callback.name})`
          span.updateName(opName)
          span.setAttribute('nest.callback', callback.name)
        }

        return api.context.with(spanContext, () => {
          try {
            return handler.apply(this, arguments)
          } catch (e) {
            throw addError(span, e)
          } finally {
            span.end();
          }
        });
      }
    }
  }
}

function createWrapHandler(tracer, handler) {
  let name = 'nestHandler'
  if (handler.name) {
    name = handler.name
  }
  const wrappedHandler = function () {
    const attributes = { ...Instrumentation.COMMON_ATTRIBUTES }
    if (name) {
      attributes['nest.callback'] = name
    }
    const span = tracer.startSpan(name, { attributes })
    const spanContext = api.trace.setSpan(api.context.active(), span);

    return api.context.with(spanContext, () => {
      try {
        return handler.apply(this, arguments)
      } catch (e) {
        throw addError(span, e)
      } finally {
        span.end();
      }
    })
  }

  if (name) {
    Object.defineProperty(wrappedHandler, 'name', { value: name })
  }
  return wrappedHandler
}

function createWrapCreateGuardsFn(tracer, config) {
  return function wrapCreateGuardsFn (createGuardsFn) {
    return function createGuardsFn (guards, instance, callback, contextType) {
      console.log('TESTME');
      function wrappedCanActivateFn (canActivateFn) {
        return (args) => {
          if (typeof canActivateFn !== 'function') {
            return canActivateFn
          }
          createGuardsTrace(tracer, args, guards, instance, callback, canActivateFn)
        }
      }
      return wrappedCanActivateFn(createGuardsFn)
    }
  }
}

function createWrapTryActivate(tracer, config) {
  return function wrapTryActivate (tryActivate) {
    return function tryActivateWithTrace (guards, args, instance, callback) {
      createGuardsTrace(tracer, args, guards, instance, callback, tryActivate)
    }
  }
}

function createWrapIntercept(tracer, config) {
  return function wrapIntercept (original) {
    return function interceptWithTrace (interceptors, args, instance, callback, next, type) {
      const opName = 'nest.interceptor.intercept'
      const span = tracer.startSpan(opName, {
        attributes: {
          ...Instrumentation.COMMON_ATTRIBUTES
        }
      });
      const spanContext = api.trace.setSpan(api.context.active(), span);
      if (callback.name) {
        span.setAttribute('nest.callback', callback.name)
      }

      const request = args.length > 1 ? args[0] : args
      span.setAttribute('http.method', request.method)
      span.setAttribute('http.url', request.originalUrl)
      span.setAttribute('nest.route.path', request.route.path)

      if (interceptors.length > 0) {
        const interceptorNames = []
        interceptors.forEach(interceptor => {
          interceptorNames.push(interceptor.constructor.name)
        })
        span.setAttribute('nest.interceptors', interceptorNames)
      }

      if (instance.constructor && instance.constructor.name) {
        span.setAttribute('nest.controller.instance', instance.constructor.name)
      }

      return api.context.with(spanContext, () => {
        try {
          return original.apply(this, arguments)
        } catch (e) {
          throw addError(span, e)
        } finally {
          span.end();
        }
      })
    }
  }
}

function createWrapCreatePipesFn(tracer, config) {
  return function wrapCreatePipesFn (original) {
    return function createPipesFnWithTrace (pipes, paramsOptions) {
      function wrappedPipesFn (pipesFn) {
        return (args, req, res, next) => {
          if (typeof pipesFn !== 'function') {
            return pipesFn
          }

          let opName = 'nest.pipe.pipesFn'
          if (pipes.length > 0) {
            if (pipes[0].constructor && pipes[0].constructor.name) {
              opName = `${pipes[0].constructor.name}.pipeFn`
            }
          }
          const span = tracer.startSpan(opName, {
            attributes: {
              ...Instrumentation.COMMON_ATTRIBUTES
            }
          });
          const spanContext = api.trace.setSpan(api.context.active(), span);
          if (paramsOptions && paramsOptions[0]) {
            const pipes = []
            const pipeOptions = paramsOptions[0].pipes
            pipeOptions.forEach((param) => {
              if (param.constructor && param.constructor.name) {
                pipes.push(param.constructor.name)
              }
            })
            if (pipes.length > 0) {
              span.setAttribute('nest.pipes', pipes)
            }
          }

          return api.context.with(spanContext, () => {
            try {
              return pipesFn.apply(this, [args, req, res, next])
            } catch (e) {
              throw addError(span, e)
            } finally {
              span.end();
            }
          })
        }
      }
      return wrappedPipesFn(original.apply(this, arguments))
    }
  }
}

function createGuardsTrace(tracer, args, guards, instance, callback, fn) {
  let opName = 'nest.guard.canActivate'
  const request = args.length > 1 ? args[0] : args
  const span = tracer.startSpan(opName, {
    attributes: {
      ...Instrumentation.COMMON_ATTRIBUTES,
      'http.method': request.method,
      'http.url': request.originalUrl,
      'nest.route.path': request.route.path
    }
  })
  const spanContext = api.trace.setSpan(api.context.active(), span);

  const guardNames = guards.map(guardName => guardName.constructor.name);
  if (guardNames.length > 0) {
    if (guardNames[0].constructor && guardNames[0].constructor.name) {
      opName = `${guardNames[0]}.tryActivate`
    }
    span.setAttribute('nest.guards', guardNames)
  }
  if (instance.constructor && instance.constructor.name) {
    opName = `${opName}.${instance.constructor.name}`
    span.setAttribute('nest.controller.instance', instance.constructor.name)
  }
  if (callback.name) {
    opName = `${opName}(${callback.name})`
    span.setAttribute('nest.callback', callback.name)
  }

  span.updateName(opName)

  return api.context.with(spanContext, () => {
    try {
      return fn.apply(this, args)
    } catch (e) {
      throw addError(span, e)
    } finally {
      span.end();
    }
  })
}

function addError (span, error) {
  span.recordException(error);
  span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
  return error
}


