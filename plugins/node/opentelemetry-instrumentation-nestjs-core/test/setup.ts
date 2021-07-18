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
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

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
      return decorators.reduceRight((o, d) => {
        return (d && d(o)) || o;
      }, target);
    case 3:
      return decorators.reduceRight((o, d) => {
        return (d && d(target, key)) || o;
      }, void 0);
    case 4:
      return decorators.reduceRight((o, d) => {
        return (d && d(target, key, o)) || o;
      }, desc);
  }
};

export const setup = async version => {
  let UsersController = class UsersController {
    getUsers() {
      return 'Hello, world!\n';
    }
  };
  let GuardedController = class GuardedController {
    getEndpoint() {
      return 'Hello, guarded!\n';
    }
  };
  let GuardedModule = class GuardedModule {};
  let UsersModule = class UsersModule {};
  let ErrorController = class ErrorController {
    getErrors() {
      throw new Error('custom error');
    }
  };
  let ErrorModule = class ErrorModule {};
  let AppModule = class AppModule {};
  let MyGuard = class MyGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      return true;
    }
  }

  // const core = require(`../../versions/@nestjs/core@${version}`).get()
  // const common = require(`../../versions/@nestjs/core@${version}/node_modules/@nestjs/common`)
  const core = require('@nestjs/core');
  const common = require('@nestjs/common');

  MyGuard = __decorate([common.Injectable()], MyGuard);

  GuardedController = __decorate([common.Controller('guarded'), common.UseGuards(MyGuard)], GuardedController);
  Object.defineProperty(
    GuardedController.prototype,
    'getEndpoint',
    __decorate(
      [common.Get()],
      GuardedController.prototype,
      'getEndpoint',
      Object.getOwnPropertyDescriptor(GuardedController.prototype, 'getEndpoint')
    )
  );

  GuardedModule = __decorate(
    [
      common.Module({
        controllers: [GuardedController],
      }),
    ],
    GuardedModule
  );

  UsersController = __decorate([common.Controller('users')], UsersController);
  Object.defineProperty(
    UsersController.prototype,
    'getUsers',
    __decorate(
      [common.Get()],
      UsersController.prototype,
      'getUsers',
      Object.getOwnPropertyDescriptor(UsersController.prototype, 'getUsers')
    )
  );

  UsersModule = __decorate(
    [
      common.Module({
        controllers: [UsersController],
      }),
    ],
    UsersModule
  );

  ErrorController = __decorate([common.Controller('errors')], ErrorController);
  Object.defineProperty(
    ErrorController.prototype,
    'getErrors',
    __decorate(
      [common.Get()],
      ErrorController.prototype,
      'getErrors',
      Object.getOwnPropertyDescriptor(ErrorController.prototype, 'getErrors')
    )
  );

  ErrorModule = __decorate(
    [
      common.Module({
        controllers: [ErrorController],
      }),
    ],
    ErrorModule
  );

  if (semver.intersects(version, '>=4.6.3')) {
    AppModule = __decorate(
      [
        common.Module({
          imports: [UsersModule, ErrorModule, GuardedModule],
          controllers: [UsersController, ErrorController, GuardedController],
        }),
      ],
      AppModule
    );
  } else {
    AppModule = __decorate(
      [
        common.Module({
          modules: [UsersModule, ErrorModule, GuardedModule],
          controllers: [UsersController, ErrorController, GuardedController],
        }),
      ],
      AppModule
    );
  }

  const app = await core.NestFactory.create(AppModule);
  await app.listenAsync(0, 'localhost');

  return app;
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
