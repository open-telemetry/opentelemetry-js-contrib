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
import * as semver from 'semver';
import type {
  CanActivate,
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { AddressInfo } from 'net';
import type { App } from './setup';
import {
  createNamedDecoratedClass,
  createRequester,
  decorateClass,
  decorateProperty,
  getLegacyCompatibleDecorator,
  startHttpApplication,
} from './setup';

const createHttpTestModule = (
  common: typeof import('@nestjs/common'),
  name: string,
  handler: (...args: unknown[]) => unknown,
  controllerDecorators: unknown[] = []
) => {
  const methodName = `get${name}`;

  let Controller = class {
    [methodName](...args: any[]) {
      return handler(...args);
    }
  };
  Controller = createNamedDecoratedClass(
    Controller,
    `${name}Controller`,
    controllerDecorators
  );
  decorateProperty(Controller.prototype, methodName, [common.Get()]);

  let Module = class {};
  Module = createNamedDecoratedClass(Module, `${name}Module`, [
    common.Module({
      controllers: [Controller],
    }),
  ]);

  return [Controller, Module] as const;
};

const createHttpControllerModules = (
  common: typeof import('@nestjs/common'),
  version: string
) => {
  let MyGuard = class MyGuard implements CanActivate {
    canActivate(_context: ExecutionContext): boolean {
      return true;
    }
  };
  MyGuard = decorateClass(MyGuard, [
    getLegacyCompatibleDecorator(common, version, 'Guard'),
  ]);

  let YellInterceptor = class YellInterceptor implements NestInterceptor {
    intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
      return next
        .handle()
        .pipe(
          map(value =>
            typeof value === 'string' ? value.toUpperCase() : value
          )
        );
    }
  };
  YellInterceptor = decorateClass(YellInterceptor, [
    getLegacyCompatibleDecorator(common, version, 'Interceptor'),
  ]);

  let MetadataInterceptor = class MetadataInterceptor
    implements NestInterceptor
  {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      return next
        .handle()
        .pipe(map(() => Reflect.getMetadataKeys(context.getHandler())));
    }
  };
  MetadataInterceptor = decorateClass(MetadataInterceptor, [
    getLegacyCompatibleDecorator(common, version, 'Interceptor'),
  ]);

  return {
    users: createHttpTestModule(common, 'Users', () => 'Hello, world!\n', [
      common.Controller('users'),
    ]),
    guarded: createHttpTestModule(
      common,
      'Guarded',
      () => 'Hello, guarded!\n',
      [common.Controller('guarded'), common.UseGuards(MyGuard)]
    ),
    intercepted: createHttpTestModule(
      common,
      'Intercepted',
      () => 'Hello, Intercepted!\n',
      [
        common.Controller('intercepted'),
        common.UseInterceptors(YellInterceptor),
      ]
    ),
    error: createHttpTestModule(
      common,
      'Error',
      () => {
        throw new Error('custom error');
      },
      [common.Controller('errors')]
    ),
    metadata: createHttpTestModule(
      common,
      'Metadata',
      () => 'Hello, Metadata!\n',
      [
        common.Controller('metadata'),
        common.UseInterceptors(MetadataInterceptor),
      ]
    ),
  };
};

const createHttpAppModule = (
  common: typeof import('@nestjs/common'),
  version: string
) => {
  const controllerModules = createHttpControllerModules(common, version);
  const imports = Object.values(controllerModules).map(([, module]) => module);
  const controllers = Object.values(controllerModules).map(
    ([controller]) => controller
  );

  let AppModule = class AppModule {};
  AppModule = decorateClass(AppModule, [
    common.Module(
      semver.intersects(version, '>=4.6.3')
        ? { imports, controllers }
        : ({ modules: imports, controllers } as any)
    ),
  ]);

  return AppModule;
};

export const setupHttp = async (version: string): Promise<App> => {
  const core = await import('@nestjs/core');
  const common = await import('@nestjs/common');
  const AppModule = createHttpAppModule(common, version);
  const app = await core.NestFactory.create(AppModule, { logger: false });
  await startHttpApplication(app);

  return app as App;
};

export const getRequester = (app: any) => {
  const port = (app.httpServer.address() as AddressInfo).port;
  return createRequester(port);
};
