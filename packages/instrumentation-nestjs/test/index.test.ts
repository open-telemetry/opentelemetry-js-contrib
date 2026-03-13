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
import { createRequire } from 'module';

import { context, SpanStatusCode } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { NestInstrumentation } from '../src';
import {
  getRequester,
  setupHttp,
  setupMicroservice,
  App,
  MicroserviceApp,
} from './setup';
import { assertSpans } from './utils';

import * as util from 'util';

const packageRequire = createRequire(__filename);
const LIB_VERSION = packageRequire('@nestjs/core/package.json')
  .version as string;

// This is a meagre testing of just a single value of
// OTEL_SEMCONV_STABILITY_OPT_IN, because testing multiple configurations of
// `NestInstrumentation` in this all-in-one-process is more trouble than it
// it is worth for the ~6mo migration process.
process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http/dup';

const instrumentation = new NestInstrumentation();
const memoryExporter = new InMemorySpanExporter();

util.inspect.defaultOptions.depth = 3;
util.inspect.defaultOptions.breakLength = 200;

describe('nestjs-core', () => {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  instrumentation.setTracerProvider(provider);
  let contextManager: AsyncLocalStorageContextManager;
  let app: App;
  let microserviceApp: MicroserviceApp | undefined;
  let request = async (_path: string): Promise<unknown> => {
    throw new Error('Not yet initialized.');
  };

  beforeEach(async () => {
    contextManager = new AsyncLocalStorageContextManager();
    context.setGlobalContextManager(contextManager.enable());
    instrumentation.setConfig({});
    instrumentation.enable();

    app = await setupHttp(LIB_VERSION);
    request = getRequester(app);
  });

  afterEach(async () => {
    if (microserviceApp) {
      await microserviceApp.close();
      microserviceApp = undefined;
    }
    await app.close();

    memoryExporter.reset();
    context.disable();
    instrumentation.disable();
  });

  it('should capture setup', async () => {
    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'app_creation',
        service: 'test',
        name: 'Create Nest App',
        module: 'AppModule',
      },
    ]);
  });

  it('should capture requests', async () => {
    const path = semver.intersects(LIB_VERSION, '<5.0.0') ? '/' : '/users';
    const url = '/users';
    const instance = 'UsersController';
    const callback = 'getUsers';

    assert.strictEqual(await request('/users'), 'Hello, world!\n');

    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'app_creation',
        service: 'test',
        name: 'Create Nest App',
        module: 'AppModule',
      },
      {
        type: 'handler',
        service: 'test',
        name: callback,
        callback,
        parentSpanName: `${instance}.${callback}`,
      },
      {
        type: 'request_context',
        service: 'test',
        name: `${instance}.${callback}`,
        method: 'GET',
        url,
        path,
        callback,
      },
    ]);
  });

  it('should not overwrite metadata set on the request handler', async () => {
    const path = semver.intersects(LIB_VERSION, '<5.0.0') ? '/' : '/metadata';
    const url = '/metadata';
    const instance = 'MetadataController';
    const callback = 'getMetadata';

    assert.deepStrictEqual(await request('/metadata'), '["path","method"]');

    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'app_creation',
        service: 'test',
        name: 'Create Nest App',
        module: 'AppModule',
      },
      {
        type: 'handler',
        service: 'test',
        name: callback,
        callback,
        parentSpanName: `${instance}.${callback}`,
      },
      {
        type: 'request_context',
        service: 'test',
        name: `${instance}.${callback}`,
        method: 'GET',
        url,
        path,
        callback,
      },
    ]);
  });

  it('should capture errors', async () => {
    const path = semver.intersects(LIB_VERSION, '<5.0.0') ? '/' : '/errors';
    const url = '/errors';
    const instance = 'ErrorController';
    const callback = 'getError';

    assert.strictEqual(
      await request('/errors'),
      '{"statusCode":500,"message":"Internal server error"}'
    );

    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'app_creation',
        service: 'test',
        name: 'Create Nest App',
        module: 'AppModule',
      },
      {
        type: 'handler',
        service: 'test',
        name: callback,
        callback,
        status: {
          code: SpanStatusCode.ERROR,
          message: 'custom error',
        },
        parentSpanName: `${instance}.${callback}`,
      },
      {
        type: 'request_context',
        service: 'test',
        name: `${instance}.${callback}`,
        method: 'GET',
        url,
        path,
        callback,
        status: {
          code: SpanStatusCode.ERROR,
          message: 'custom error',
        },
      },
    ]);
  });

  it('should capture standalone microservice handlers', async () => {
    memoryExporter.reset();
    microserviceApp = await setupMicroservice('standalone');

    assert.strictEqual(await microserviceApp.sendMessage('sum', [1, 2, 3]), 6);

    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'microservice_creation',
        service: 'test',
        name: 'Create Nest Microservice',
        module: 'AppModule',
        transport: 'TestTransportStrategy',
      },
      {
        type: 'message_handler',
        service: 'test',
        name: 'sumNumbers',
        callback: 'sumNumbers',
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

  it('should capture hybrid microservice handlers', async () => {
    memoryExporter.reset();
    microserviceApp = await setupMicroservice('hybrid');

    assert.strictEqual(
      await microserviceApp.emitEvent('notification', 'hello'),
      'notification:hello'
    );

    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'app_creation',
        service: 'test',
        name: 'Create Nest App',
        module: 'AppModule',
      },
      {
        type: 'microservice_creation',
        service: 'test',
        name: 'Connect Nest Microservice',
        transport: 'TestTransportStrategy',
      },
      {
        type: 'message_handler',
        service: 'test',
        name: 'handleNotification',
        callback: 'handleNotification',
        parentSpanName: 'MicroserviceController.handleNotification',
      },
      {
        type: 'message_context',
        service: 'test',
        name: 'MicroserviceController.handleNotification',
        callback: 'handleNotification',
        controller: 'MicroserviceController',
        pattern: 'notification',
      },
    ]);
  });
});
