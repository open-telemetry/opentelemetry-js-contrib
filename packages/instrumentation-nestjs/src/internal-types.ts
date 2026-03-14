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

import type { Controller } from '@nestjs/common/interfaces';
import type { NestFactory } from '@nestjs/core/nest-factory.js';
import type { RouterExecutionContext } from '@nestjs/core/router/router-execution-context.js';

export type MicroserviceContextDefinition = {
  callbackName: string;
  instanceName: string;
  pattern: unknown;
  transportId: unknown;
};

export type EventOrMessageListenerDefinition = {
  patterns: unknown[];
  methodKey: string;
  targetCallback: (...args: any[]) => unknown;
  transport?: unknown;
};

export interface NestFactoryStaticModule {
  NestFactoryStatic: {
    prototype: {
      create: typeof NestFactory.create;
      createMicroservice: Function;
    };
  };
}

export interface NestApplicationModule {
  NestApplication: {
    prototype: {
      connectMicroservice: Function;
    };
  };
}

export interface RouterExecutionContextModule {
  RouterExecutionContext: {
    prototype: {
      create: RouterExecutionContext['create'];
    };
  };
}

export interface ListenersControllerModule {
  ListenersController: {
    prototype: {
      registerPatternHandlers: Function;
    };
  };
}

export interface RpcContextCreatorModule {
  RpcContextCreator: {
    prototype: {
      create: Function;
    };
  };
}

export interface MetadataExplorerAware {
  metadataExplorer?: {
    explore?: (instance: Controller) => EventOrMessageListenerDefinition[];
  };
}

export interface InstanceWrapperLike {
  metatype?: { name?: string };
  instance?: Controller;
}

export interface ServerInstanceLike {
  addHandler?: Function;
  transportId?: unknown;
}
