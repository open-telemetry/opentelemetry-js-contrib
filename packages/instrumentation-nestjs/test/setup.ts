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

type DecoratorLike = (...args: unknown[]) => unknown;

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
      return decorators.reduceRight((o: any, d: DecoratorLike) => {
        return (d && d(o)) || o;
      }, target);
    case 3:
      return decorators.reduceRight(
        (o: any, d: DecoratorLike) => {
          return (d && d(target, key)) || o;
        },
        void 0
      );
    case 4:
      return decorators.reduceRight((o: any, d: DecoratorLike) => {
        return (d && d(target, key, o)) || o;
      }, desc);
  }
};

export const decorateProperty = (
  obj: any,
  propName: string,
  decorators: any
) => {
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

export const setClassName = <T extends object>(target: T, name: string): T => {
  Object.defineProperty(target, 'name', { value: name });
  return target;
};

export const decorateClass = <T extends object>(
  target: T,
  decorators: any[]
): T => {
  return __decorate(decorators, target) as T;
};

export const createNamedDecoratedClass = <T extends object>(
  target: T,
  name: string,
  decorators: any[] = []
): T => {
  return decorateClass(setClassName(target, name), decorators);
};

export const getLegacyCompatibleDecorator = (
  common: any,
  version: string,
  legacyDecoratorName: 'Guard' | 'Interceptor'
) => {
  return semver.intersects(version, '^4.0.0')
    ? common[legacyDecoratorName]()
    : common.Injectable();
};

export const startHttpApplication = async (app: any) => {
  if (app.listenAsync) {
    await app.listenAsync(0, 'localhost');
    return;
  }

  await app.listen(0, 'localhost');
};

export const createRequester = (port: number) => {
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

export type App = {
  close: () => Promise<unknown>;
};

export type MicroserviceApp = App & {
  emitEvent: (pattern: string, data: unknown) => Promise<unknown>;
  sendMessage: (pattern: string, data: unknown) => Promise<unknown>;
};

export { getRequester, setupHttp } from './setup-http';
export { setupMicroservice } from './setup-microservice';
export { setupHttp as default } from './setup-http';
