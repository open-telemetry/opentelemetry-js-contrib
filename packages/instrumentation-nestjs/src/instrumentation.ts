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
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_ROUTE,
  ATTR_URL_FULL,
} from '@opentelemetry/semantic-conventions';
import type { NestFactory } from '@nestjs/core/nest-factory.js';
import type { RouterExecutionContext } from '@nestjs/core/router/router-execution-context.js';
import type { Controller } from '@nestjs/common/interfaces';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { ATTR_HTTP_METHOD, ATTR_HTTP_URL } from './semconv';
import { AttributeNames, NestType } from './enums';
import type {
  EventOrMessageListenerDefinition,
  ListenersControllerModule,
  MetadataExplorerAware,
  MicroserviceContextDefinition,
  NestApplicationModule,
  NestFactoryStaticModule,
  RpcContextCreatorModule,
  RouterExecutionContextModule,
  ServerInstanceLike,
  InstanceWrapperLike,
} from './internal-types';
import type { NestInstrumentationConfig } from './types';
import {
  buildMicroserviceContextDefinitions,
  createContextWrapper,
  createWrapHandler,
  createWrapMessageHandlerContext,
  executeWithSpan,
  getInstanceName,
  getTransportAttribute,
} from './utils';

const supportedVersions = ['>=4.0.0 <12'];

type HookedFunction = (...args: unknown[]) => unknown;
type WrapFunction = (original: unknown, name?: string) => unknown;

type RequestLike = {
  route?: { path?: string };
  routeOptions?: { url?: string };
  routerPath?: string;
  method?: string;
  originalUrl?: string;
  url?: string;
};

export class NestInstrumentation extends InstrumentationBase<NestInstrumentationConfig> {
  static readonly COMPONENT = '@nestjs/core';
  static readonly COMMON_ATTRIBUTES = {
    component: NestInstrumentation.COMPONENT,
  };

  private _semconvStability: SemconvStability;

  constructor(config: NestInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this._semconvStability = semconvStabilityFromStr(
      'http',
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN
    );
  }

  init() {
    const instrumentMicroservices =
      this.getConfig().instrumentMicroservices !== false;
    const coreModule = new InstrumentationNodeModuleDefinition(
      NestInstrumentation.COMPONENT,
      supportedVersions,
      moduleExports => moduleExports,
      () => {},
      [
        this.getNestFactoryFileInstrumentation(
          supportedVersions,
          instrumentMicroservices
        ),
        this.getRouterExecutionContextFileInstrumentation(supportedVersions),
        ...(instrumentMicroservices
          ? [this.getNestApplicationFileInstrumentation(supportedVersions)]
          : []),
      ]
    );

    if (!instrumentMicroservices) {
      return [coreModule];
    }

    const microservicesModule = new InstrumentationNodeModuleDefinition(
      '@nestjs/microservices',
      supportedVersions,
      moduleExports => moduleExports,
      () => {},
      [
        this.getListenersControllerFileInstrumentation(supportedVersions),
        this.getRpcContextCreatorFileInstrumentation(supportedVersions),
      ]
    );

    return [coreModule, microservicesModule];
  }

  getNestFactoryFileInstrumentation(
    versions: string[],
    instrumentMicroservices = true
  ) {
    return new InstrumentationNodeModuleFile(
      '@nestjs/core/nest-factory.js',
      versions,
      (NestFactoryStatic: NestFactoryStaticModule, moduleVersion?: string) => {
        this.ensureWrapped(
          NestFactoryStatic.NestFactoryStatic.prototype,
          'create',
          createWrapNestFactoryCreate(this.tracer, moduleVersion)
        );
        if (instrumentMicroservices) {
          this.ensureWrapped(
            NestFactoryStatic.NestFactoryStatic.prototype,
            'createMicroservice',
            createWrapNestFactoryCreateMicroservice(this.tracer, moduleVersion)
          );
        }
        return NestFactoryStatic;
      },
      (NestFactoryStatic: NestFactoryStaticModule) => {
        this._unwrap(NestFactoryStatic.NestFactoryStatic.prototype, 'create');
        if (instrumentMicroservices) {
          this._unwrap(
            NestFactoryStatic.NestFactoryStatic.prototype,
            'createMicroservice'
          );
        }
      }
    );
  }

  getNestApplicationFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile(
      '@nestjs/core/nest-application.js',
      versions,
      (NestApplication: NestApplicationModule, moduleVersion?: string) => {
        this.ensureWrapped(
          NestApplication.NestApplication.prototype,
          'connectMicroservice',
          createWrapConnectMicroservice(this.tracer, moduleVersion)
        );
        return NestApplication;
      },
      (NestApplication: NestApplicationModule) => {
        this._unwrap(
          NestApplication.NestApplication.prototype,
          'connectMicroservice'
        );
      }
    );
  }

  getRouterExecutionContextFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile(
      '@nestjs/core/router/router-execution-context.js',
      versions,
      (
        RouterExecutionContext: RouterExecutionContextModule,
        moduleVersion?: string
      ) => {
        this.ensureWrapped(
          RouterExecutionContext.RouterExecutionContext.prototype,
          'create',
          createWrapCreateHandler(
            this.tracer,
            moduleVersion,
            this._semconvStability
          )
        );
        return RouterExecutionContext;
      },
      (RouterExecutionContext: RouterExecutionContextModule) => {
        this._unwrap(
          RouterExecutionContext.RouterExecutionContext.prototype,
          'create'
        );
      }
    );
  }

  getListenersControllerFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile(
      '@nestjs/microservices/listeners-controller.js',
      versions,
      (
        ListenersController: ListenersControllerModule,
        moduleVersion?: string
      ) => {
        this.ensureWrapped(
          ListenersController.ListenersController.prototype,
          'registerPatternHandlers',
          createWrapRegisterPatternHandlers(this.tracer, moduleVersion)
        );
        return ListenersController;
      },
      (ListenersController: ListenersControllerModule) => {
        this._unwrap(
          ListenersController.ListenersController.prototype,
          'registerPatternHandlers'
        );
      }
    );
  }

  getRpcContextCreatorFileInstrumentation(versions: string[]) {
    return new InstrumentationNodeModuleFile(
      '@nestjs/microservices/context/rpc-context-creator.js',
      versions,
      (RpcContextCreator: RpcContextCreatorModule, moduleVersion?: string) => {
        this.ensureWrapped(
          RpcContextCreator.RpcContextCreator.prototype,
          'create',
          createWrapRpcContextCreator(this.tracer, moduleVersion)
        );
        return RpcContextCreator;
      },
      (RpcContextCreator: RpcContextCreatorModule) => {
        this._unwrap(RpcContextCreator.RpcContextCreator.prototype, 'create');
      }
    );
  }

  private ensureWrapped(
    obj: Record<string, unknown>,
    methodName: string,
    wrapper: WrapFunction
  ) {
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
  return function wrapCreate(original: unknown) {
    const originalCreate = original as typeof NestFactory.create;

    return function createWithTrace(
      this: typeof NestFactory,
      ...args: unknown[]
    ) {
      const [nestModule] = args;
      const span = tracer.startSpan('Create Nest App', {
        attributes: {
          ...NestInstrumentation.COMMON_ATTRIBUTES,
          [AttributeNames.TYPE]: NestType.APP_CREATION,
          [AttributeNames.VERSION]: moduleVersion,
          [AttributeNames.MODULE]: (nestModule as { name?: string } | undefined)
            ?.name,
        },
      });

      return executeWithSpan(span, () =>
        Reflect.apply(originalCreate, this, args)
      );
    };
  };
}

function createWrapNestFactoryCreateMicroservice(
  tracer: api.Tracer,
  moduleVersion?: string
) {
  return function wrapCreateMicroservice(original: unknown) {
    const originalCreateMicroservice = original as HookedFunction;

    return function createMicroserviceWithTrace(
      this: typeof NestFactory,
      ...args: unknown[]
    ) {
      const [nestModule, options] = args;
      const attributes: api.Attributes = {
        ...NestInstrumentation.COMMON_ATTRIBUTES,
        [AttributeNames.TYPE]: NestType.MICROSERVICE_CREATION,
        [AttributeNames.VERSION]: moduleVersion,
        [AttributeNames.MODULE]: (nestModule as { name?: string } | undefined)
          ?.name,
      };
      const transport = getTransportAttribute(options);
      if (transport !== undefined) {
        attributes[AttributeNames.TRANSPORT] = transport;
      }

      const span = tracer.startSpan('Create Nest Microservice', {
        attributes,
      });

      return executeWithSpan(span, () =>
        Reflect.apply(originalCreateMicroservice, this, args)
      );
    };
  };
}

function createWrapConnectMicroservice(
  tracer: api.Tracer,
  moduleVersion?: string
) {
  return function wrapConnectMicroservice(original: unknown) {
    const originalConnectMicroservice = original as HookedFunction;

    return function connectMicroserviceWithTrace(
      this: unknown,
      ...args: unknown[]
    ) {
      const [options] = args;
      const attributes: api.Attributes = {
        ...NestInstrumentation.COMMON_ATTRIBUTES,
        [AttributeNames.TYPE]: NestType.MICROSERVICE_CREATION,
        [AttributeNames.VERSION]: moduleVersion,
      };
      const transport = getTransportAttribute(options);
      if (transport !== undefined) {
        attributes[AttributeNames.TRANSPORT] = transport;
      }

      const span = tracer.startSpan('Connect Nest Microservice', {
        attributes,
      });

      return executeWithSpan(span, () =>
        Reflect.apply(originalConnectMicroservice, this, args)
      );
    };
  };
}

function createWrapCreateHandler(
  tracer: api.Tracer,
  moduleVersion: string | undefined,
  semconvStability: SemconvStability
) {
  return function wrapCreateHandler(original: unknown) {
    const originalCreate = original as RouterExecutionContext['create'];

    return function createHandlerWithTrace(
      this: RouterExecutionContext,
      ...args: unknown[]
    ) {
      const [instance, callback, ...rest] = args as [
        Controller,
        HookedFunction,
        ...unknown[],
      ];
      const handlerArgs = [
        instance,
        createWrapHandler({
          tracer,
          moduleVersion,
          handler: callback,
          nestType: NestType.REQUEST_HANDLER,
          commonAttributes: NestInstrumentation.COMMON_ATTRIBUTES,
        }),
        ...rest,
      ];
      const handler = Reflect.apply(
        originalCreate,
        this,
        handlerArgs
      ) as HookedFunction;
      const callbackName = callback.name;
      const instanceName = getInstanceName(instance);
      const spanName = callbackName
        ? `${instanceName}.${callbackName}`
        : instanceName;

      return function (
        this: unknown,
        req: unknown,
        _res: unknown,
        _next: HookedFunction
      ) {
        const wrappedArgs = [req, _res, _next];
        const request = req as RequestLike;
        const attributes: api.Attributes = {
          ...NestInstrumentation.COMMON_ATTRIBUTES,
          [AttributeNames.VERSION]: moduleVersion,
          [AttributeNames.TYPE]: NestType.REQUEST_CONTEXT,
          [ATTR_HTTP_ROUTE]:
            request.route?.path ||
            request.routeOptions?.url ||
            request.routerPath,
          [AttributeNames.CONTROLLER]: instanceName,
          [AttributeNames.CALLBACK]: callbackName,
        };
        if (semconvStability & SemconvStability.OLD) {
          attributes[ATTR_HTTP_METHOD] = request.method;
          attributes[ATTR_HTTP_URL] = request.originalUrl || request.url;
        }
        if (semconvStability & SemconvStability.STABLE) {
          attributes[ATTR_HTTP_REQUEST_METHOD] = request.method;
          attributes[ATTR_URL_FULL] = request.originalUrl || request.url;
        }
        return Reflect.apply(
          createContextWrapper(spanName, tracer, attributes, handler),
          this,
          wrappedArgs
        );
      };
    };
  };
}

function createWrapRegisterPatternHandlers(
  tracer: api.Tracer,
  moduleVersion?: string
) {
  return function wrapRegisterPatternHandlers(original: unknown) {
    const originalRegisterPatternHandlers = original as HookedFunction;

    return function registerPatternHandlersWithTrace(
      this: MetadataExplorerAware,
      ...args: unknown[]
    ) {
      const [instanceWrapper, serverInstance, ...rest] = args as [
        InstanceWrapperLike,
        ServerInstanceLike,
        ...unknown[],
      ];
      const wrappedArgs = [instanceWrapper, serverInstance, ...rest];
      if (
        typeof this.metadataExplorer?.explore !== 'function' ||
        typeof serverInstance?.addHandler !== 'function'
      ) {
        return Reflect.apply(
          originalRegisterPatternHandlers,
          this,
          wrappedArgs
        );
      }

      const metadataExplorer = this.metadataExplorer;
      const originalExplore = metadataExplorer.explore as (
        instance: Controller
      ) => EventOrMessageListenerDefinition[];
      const originalAddHandler = serverInstance.addHandler as HookedFunction;
      let contextDefinitions: MicroserviceContextDefinition[] = [];

      metadataExplorer.explore = function exploreWithTrace(
        this: unknown,
        instance: Controller
      ) {
        const definitions = originalExplore.call(this, instance);
        contextDefinitions = buildMicroserviceContextDefinitions(
          definitions,
          instanceWrapper,
          serverInstance.transportId
        );
        return definitions;
      };

      serverInstance.addHandler = function addHandlerWithTrace(
        this: unknown,
        pattern: unknown,
        handler: HookedFunction,
        isEventHandler?: boolean,
        extras?: Record<string, unknown>
      ) {
        const contextDefinition = contextDefinitions.shift();
        const tracedHandler =
          contextDefinition === undefined
            ? handler
            : createWrapMessageHandlerContext({
                tracer,
                moduleVersion,
                handler,
                definition: contextDefinition,
                commonAttributes: NestInstrumentation.COMMON_ATTRIBUTES,
              });

        return Reflect.apply(originalAddHandler, this, [
          pattern,
          tracedHandler,
          isEventHandler,
          extras,
        ]);
      };

      try {
        return Reflect.apply(
          originalRegisterPatternHandlers,
          this,
          wrappedArgs
        );
      } finally {
        metadataExplorer.explore = originalExplore;
        serverInstance.addHandler = originalAddHandler;
      }
    };
  };
}

function createWrapRpcContextCreator(
  tracer: api.Tracer,
  moduleVersion?: string
) {
  return function wrapRpcContextCreator(original: unknown) {
    const originalCreate = original as HookedFunction;

    return function createRpcContextWithTrace(
      this: unknown,
      ...rpcArgs: unknown[]
    ) {
      const [instance, callback, ...rest] = rpcArgs as [
        Controller,
        HookedFunction,
        ...unknown[],
      ];
      const wrappedArgs = [
        instance,
        createWrapHandler({
          tracer,
          moduleVersion,
          handler: callback,
          nestType: NestType.MESSAGE_HANDLER,
          commonAttributes: NestInstrumentation.COMMON_ATTRIBUTES,
        }),
        ...rest,
      ];
      return Reflect.apply(originalCreate, this, wrappedArgs);
    };
  };
}
