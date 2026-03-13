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
import { isObservable, lastValueFrom } from 'rxjs';
import type { MicroserviceApp } from './setup';
import {
  createNamedDecoratedClass,
  decorateClass,
  decorateProperty,
} from './setup';

const createMicroserviceTransportStrategy = (
  microservices: typeof import('@nestjs/microservices')
) => {
  return class TestTransportStrategy extends microservices.Server {
    listen(callback: () => void) {
      callback();
    }

    on() {
      return this;
    }

    close() {}

    unwrap<T>() {
      return this as unknown as T;
    }

    async dispatch(pattern: string, data: unknown) {
      const handler = this.getHandlerByPattern(pattern);
      if (!handler) {
        throw new Error(`No handler registered for pattern: ${pattern}`);
      }

      const result = await handler(data, { pattern });
      if (isObservable(result)) {
        return lastValueFrom(result);
      }

      return result;
    }
  };
};

const createMicroserviceController = (
  common: typeof import('@nestjs/common'),
  microservices: typeof import('@nestjs/microservices')
) => {
  let MicroserviceController = class {
    sumNumbers(data: number[]) {
      return data.reduce((sum, value) => sum + value, 0);
    }

    handleNotification(data: string) {
      return `notification:${data}`;
    }
  };
  MicroserviceController = createNamedDecoratedClass(
    MicroserviceController,
    'MicroserviceController',
    [common.Controller()]
  );
  decorateProperty(MicroserviceController.prototype, 'sumNumbers', [
    microservices.MessagePattern('sum'),
  ]);
  decorateProperty(MicroserviceController.prototype, 'handleNotification', [
    microservices.EventPattern('notification'),
  ]);

  return MicroserviceController;
};

const createMicroserviceAppModule = (
  common: typeof import('@nestjs/common'),
  microservices: typeof import('@nestjs/microservices')
) => {
  const MicroserviceController = createMicroserviceController(
    common,
    microservices
  );

  let AppModule = class AppModule {};
  AppModule = decorateClass(AppModule, [
    common.Module({
      controllers: [MicroserviceController],
    }),
  ]);

  return AppModule;
};

const startMicroserviceApplication = async (
  app: any,
  mode: 'hybrid' | 'standalone',
  strategy: { dispatch: (pattern: string, data: unknown) => Promise<unknown> }
) => {
  if (mode === 'standalone') {
    if (typeof app.listenAsync === 'function') {
      await app.listenAsync();
    } else {
      await app.listen();
    }
  } else {
    app.connectMicroservice({ strategy });
    await app.startAllMicroservices();
    await app.init();
  }

  return {
    close: () => app.close(),
    emitEvent: (pattern: string, data: unknown) =>
      strategy.dispatch(pattern, data),
    sendMessage: (pattern: string, data: unknown) =>
      strategy.dispatch(pattern, data),
  };
};

export const setupMicroservice = async (
  mode: 'hybrid' | 'standalone'
): Promise<MicroserviceApp> => {
  const core = await import('@nestjs/core');
  const common = await import('@nestjs/common');
  const microservices = await import('@nestjs/microservices');
  const TestTransportStrategy =
    createMicroserviceTransportStrategy(microservices);
  const AppModule = createMicroserviceAppModule(common, microservices);
  const strategy = new TestTransportStrategy();
  const app =
    mode === 'standalone'
      ? await core.NestFactory.createMicroservice(AppModule, {
          logger: false,
          strategy,
        })
      : await core.NestFactory.create(AppModule, { logger: false });

  return startMicroserviceApplication(app, mode, strategy);
};
