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

import * as assert from 'assert';
import { createRequire } from 'module';
import type { NestFactory } from '@nestjs/core';
import {
  createWrapConnectMicroservice,
  createWrapNestFactoryCreateMicroservice,
  createWrapRegisterPatternHandlers,
  createWrapRpcContextCreator,
} from '../src/instrumentation';
import {
  disableInstrumentation,
  enableInstrumentation,
  memoryExporter,
  tracer,
} from './telemetry';
import { assertSpans } from './utils';

const packageRequire = createRequire(__filename);
const CORE_VERSION = packageRequire('@nestjs/core/package.json')
  .version as string;
const MICROSERVICES_VERSION = packageRequire(
  '@nestjs/microservices/package.json'
).version as string;

class AppModule {}

class TestTransportStrategy {
  handlers = new Map<string, Function>();

  addHandler(pattern: unknown, handler: Function) {
    this.handlers.set(String(pattern), handler);
  }
}

class MicroserviceController {
  sumNumbers(data: number[]) {
    return data.reduce((sum, value) => sum + value, 0);
  }

  handleNotification(data: string) {
    return `notification:${data}`;
  }
}

describe('nestjs-microservices instrumentation', () => {
  const nestFactoryContext = {} as typeof NestFactory;

  beforeEach(async () => {
    enableInstrumentation();
  });

  afterEach(async () => {
    disableInstrumentation();
  });

  it('should capture standalone microservice creation', () => {
    const createMicroservice = createWrapNestFactoryCreateMicroservice(
      tracer,
      CORE_VERSION
    )(function originalCreateMicroservice(module: unknown, options: unknown) {
      return { module, options };
    });

    const result = createMicroservice.call(nestFactoryContext, AppModule, {
      strategy: new TestTransportStrategy(),
    }) as { module: unknown; options: unknown };

    assert.strictEqual(result.module, AppModule);

    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'microservice_creation',
        service: 'test',
        name: 'Create Nest Microservice',
        module: 'AppModule',
        transport: 'TestTransportStrategy',
      },
    ]);
  });

  it('should capture connected microservice creation', () => {
    const connectMicroservice = createWrapConnectMicroservice(
      tracer,
      CORE_VERSION
    )(function originalConnectMicroservice(options: unknown) {
      return { options };
    });

    const result = connectMicroservice.call(
      {},
      {
        strategy: new TestTransportStrategy(),
      }
    ) as { options: unknown };

    assert.ok(result.options);

    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'microservice_creation',
        service: 'test',
        name: 'Connect Nest Microservice',
        transport: 'TestTransportStrategy',
      },
    ]);
  });

  it('should capture microservice handlers', async () => {
    const controller = new MicroserviceController();
    const server = new TestTransportStrategy();
    const createRpcContext = createWrapRpcContextCreator(
      tracer,
      MICROSERVICES_VERSION
    )(function originalCreate(_instance: unknown, callback: Function) {
      return callback;
    });
    const registerPatternHandlers = createWrapRegisterPatternHandlers(
      tracer,
      MICROSERVICES_VERSION
    )(function originalRegisterPatternHandlers(
      this: { metadataExplorer: { explore: (instance: unknown) => any[] } },
      instanceWrapper: { instance: MicroserviceController },
      serverInstance: TestTransportStrategy
    ) {
      const definitions = this.metadataExplorer.explore(
        instanceWrapper.instance
      );
      for (const definition of definitions) {
        const method = instanceWrapper.instance[
          definition.methodKey as keyof MicroserviceController
        ] as unknown as Function;
        const handler = createRpcContext(
          instanceWrapper.instance,
          method.bind(instanceWrapper.instance)
        ) as Function;
        serverInstance.addHandler(definition.pattern, handler);
      }
    });

    registerPatternHandlers.call(
      {
        metadataExplorer: {
          explore(instance: unknown) {
            return [
              {
                methodKey: 'sumNumbers',
                pattern: 'sum',
                targetCallback: (instance as MicroserviceController).sumNumbers,
              },
            ];
          },
        },
      },
      {
        instance: controller,
        metatype: { name: 'MicroserviceController' },
      },
      server
    );

    const handler = server.handlers.get('sum');
    assert.ok(handler);
    assert.strictEqual(await handler?.([1, 2, 3]), 6);

    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'message_handler',
        service: 'test',
        name: 'bound sumNumbers',
        callback: 'bound sumNumbers',
        parentSpanName: 'MicroserviceController.sumNumbers',
      },
      {
        type: 'message_context',
        service: 'test',
        name: 'MicroserviceController.sumNumbers',
        callback: 'sumNumbers',
        controller: 'MicroserviceController',
        pattern: 'sum',
      },
    ]);
  });
});
