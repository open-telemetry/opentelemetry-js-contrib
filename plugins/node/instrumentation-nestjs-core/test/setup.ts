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
import * as http from 'http';
import * as semver from 'semver';
import { AddressInfo } from 'net';
import {
  CanActivate,
  ExecutionContext,
  NestInterceptor,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// mimics the support for @decorators
const __decorate = function (
  decorators: any,
  target?: any,
  key?: any,
  desc?: any
) {
  if (typeof Reflect === 'object' && typeof Reflect.decorate === 'function') {
    return Reflect.decorate(decorators, target, key, desc);
  }
  switch (arguments.length) {
    case 2:
      return decorators.reduceRight((o: any, d: Function) => {
        return (d && d(o)) || o;
      }, target);
    case 3:
      return decorators.reduceRight((o: any, d: Function) => {
        return (d && d(target, key)) || o;
      }, void 0);
    case 4:
      return decorators.reduceRight((o: any, d: Function) => {
        return (d && d(target, key, o)) || o;
      }, desc);
  }
};

const decorateProperty = (obj: any, propName: string, decorators: any) => {
  Object.defineProperty(
    obj,
    propName,
    __decorate(
      Array.isArray(decorators) ? decorators : [decorators],
      obj,
      propName,
      Object.getOwnPropertyDescriptor(obj, propName)
    )
  );
};

const makeModule = (
  name = 'Unnamed',
  handler = (...args: unknown[]) => {},
  controllerDecorators: any[] = []
) => {
  const common = require('@nestjs/common');
  const methodName = `get${name}`;

  let Controller = class {
    [methodName](...args: any[]) {
      return handler(...args);
    }
  };
  Object.defineProperty(Controller, 'name', { value: `${name}Controller` });

  Controller = __decorate(controllerDecorators, Controller);
  decorateProperty(Controller.prototype, methodName, [common.Get()]);

  let Module = class {};
  Object.defineProperty(Module, 'name', { value: `${name}Module` });

  Module = __decorate(
    [
      common.Module({
        controllers: [Controller],
      }),
    ],
    Module
  );

  return [Controller, Module];
};

export type App = {
  close: Function;
};

export const setup = async (version: string): Promise<App> => {
  const core = require('@nestjs/core');
  const common = require('@nestjs/common');

  let AppModule = class AppModule {};
  let MyGuard = class MyGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      return true;
    }
  };
  MyGuard = __decorate(
    [
      semver.intersects(version, '^4.0.0')
        ? common.Guard()
        : common.Injectable(),
    ],
    MyGuard
  );
  let YellInterceptor = class YellInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      return next
        .handle()
        .pipe(
          map(value =>
            typeof value === 'string' ? value.toUpperCase() : value
          )
        );
    }
  };
  YellInterceptor = __decorate(
    [
      semver.intersects(version, '^4.0.0')
        ? common.Interceptor()
        : common.Injectable(),
    ],
    YellInterceptor
  );

  let MetadataInterceptor = class MetadataInterceptor
    implements NestInterceptor
  {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      return next
        .handle()
        .pipe(map(() => Reflect.getMetadataKeys(context.getHandler())));
    }
  };
  MetadataInterceptor = __decorate(
    [
      semver.intersects(version, '^4.0.0')
        ? common.Interceptor()
        : common.Injectable(),
    ],
    MetadataInterceptor
  );

  const [UsersController, UsersModule] = makeModule(
    'Users',
    () => 'Hello, world!\n',
    [common.Controller('users')]
  );
  const [GuardedController, GuardedModule] = makeModule(
    'Guarded',
    () => 'Hello, guarded!\n',
    [common.Controller('guarded'), common.UseGuards(MyGuard)]
  );
  const [InterceptedController, InterceptedModule] = makeModule(
    'Intercepted',
    () => 'Hello, Intercepted!\n',
    [common.Controller('intercepted'), common.UseInterceptors(YellInterceptor)]
  );
  const [ErrorController, ErrorModule] = makeModule(
    'Error',
    () => {
      throw new Error('custom error');
    },
    [common.Controller('errors')]
  );

  const [MetadataController, MetadataModule] = makeModule(
    'Metadata',
    () => 'Hello, Metadata!\n',
    [common.Controller('metadata'), common.UseInterceptors(MetadataInterceptor)]
  );

  if (semver.intersects(version, '>=4.6.3')) {
    AppModule = __decorate(
      [
        common.Module({
          imports: [
            UsersModule,
            ErrorModule,
            GuardedModule,
            InterceptedModule,
            MetadataModule,
          ],
          controllers: [
            UsersController,
            ErrorController,
            GuardedController,
            InterceptedController,
            MetadataController,
          ],
        }),
      ],
      AppModule
    );
  } else {
    AppModule = __decorate(
      [
        common.Module({
          modules: [
            UsersModule,
            ErrorModule,
            GuardedModule,
            InterceptedModule,
            MetadataModule,
          ],
          controllers: [
            UsersController,
            ErrorController,
            GuardedController,
            InterceptedController,
            MetadataController,
          ],
        }),
      ],
      AppModule
    );
  }

  const app = await core.NestFactory.create(AppModule);
  if (app.listenAsync) {
    await app.listenAsync(0, 'localhost');
  } else {
    await app.listen(0, 'localhost');
  }

  return app as App;
};

export const getRequester = (app: any) => {
  const port = (app.httpServer.address() as AddressInfo).port;
  return (path: string) => {
    return new Promise((resolve, reject) => {
      return http.get(`http://localhost:${port}${path}`, resp => {
        let data = '';
        resp.on('data', chunk => {
          data += chunk;
        });
        resp.on('end', () => {
          resolve(data);
        });
        resp.on('error', err => {
          reject(err);
        });
      });
    });
  };
};

export default setup;
