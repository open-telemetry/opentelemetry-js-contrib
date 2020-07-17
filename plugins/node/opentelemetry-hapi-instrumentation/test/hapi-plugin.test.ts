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

import { context } from '@opentelemetry/api';
import { NoopLogger } from '@opentelemetry/core';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import * as assert from 'assert';
import * as hapi from '@hapi/hapi';
import { plugin } from '../src';
import { AttributeNames, HapiLayerType } from '../src/types';

describe('Hapi Instrumentation - Plugin Tests', () => {
  const logger = new NoopLogger();
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncHooksContextManager;
  let server: hapi.Server;

  before(() => {
    plugin.enable(hapi, provider, logger);
  });

  beforeEach(async () => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
    server = hapi.server({
      port: 3000,
      host: 'localhost',
    });
  });

  afterEach(async () => {
    await server.stop();

    memoryExporter.reset();
    context.disable();
  });

  after(() => {
    plugin.disable();
  });

  const multipleVersionPlugin = {
    name: 'multipleVersionPlugin',
    version: '1.0.0',
    multiple: true,
    register: async function (server: hapi.Server, options: any) {
      server.route({
        method: 'GET',
        path: `/${options.path}`,
        handler: function (request, h) {
          return `hello, world, ${options.name}`;
        },
      });
    },
  };

  const simplePlugin = {
    name: 'simplePlugin',
    version: '1.0.0',
    multiple: true,
    register: async function (server: hapi.Server, options: any) {
      server.route({
        method: 'GET',
        path: '/hello',
        handler: function (request, h) {
          return `hello, world, ${options.name}`;
        },
      });
    },
  };

  const packagePlugin = {
    pkg: require('./testPackage.json'),
    register: async function (server: hapi.Server, options: any) {
      server.route({
        method: 'GET',
        path: '/package',
        handler: function (request, h) {
          return 'Package';
        },
      });
    },
  };

  describe('Instrumenting Hapi Plugins', () => {
    it('should create spans for routes within single plugins', async () => {
      const rootSpan = tracer.startSpan('rootSpan');

      await server.register({
        plugin: multipleVersionPlugin,
        options: {
          name: 'world',
          path: 'test',
        },
      });
      await server.start();
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await tracer.withSpan(rootSpan, async () => {
        const res = await server.inject({
          method: 'GET',
          url: '/test',
        });
        assert.strictEqual(res.statusCode, 200);

        rootSpan.end();
        assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);

        const requestHandlerSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'multipleVersionPlugin: route - /test');
        assert.notStrictEqual(requestHandlerSpan, undefined);
        assert.strictEqual(
          requestHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
          HapiLayerType.PLUGIN
        );
        assert.strictEqual(
          requestHandlerSpan?.attributes[AttributeNames.PLUGIN_NAME],
          'multipleVersionPlugin'
        );

        const exportedRootSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'rootSpan');
        assert.notStrictEqual(exportedRootSpan, undefined);
      });
    });

    it('should create spans for routes across multiple plugins', async () => {
      const rootSpan = tracer.startSpan('rootSpan');

      await server.register([
        {
          plugin: multipleVersionPlugin,
          options: {
            name: 'world',
            path: 'test',
          },
        },
        {
          plugin: simplePlugin,
          options: {
            name: 'simple',
          },
        },
      ]);
      await server.start();
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await tracer.withSpan(rootSpan, async () => {
        const res1 = await server.inject({
          method: 'GET',
          url: '/test',
        });
        assert.strictEqual(res1.statusCode, 200);
        const res2 = await server.inject({
          method: 'GET',
          url: '/hello',
        });
        assert.strictEqual(res2.statusCode, 200);

        rootSpan.end();

        assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 3);

        const firstHandlerSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'multipleVersionPlugin: route - /test');
        assert.notStrictEqual(firstHandlerSpan, undefined);
        assert.strictEqual(
          firstHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
          HapiLayerType.PLUGIN
        );
        assert.strictEqual(
          firstHandlerSpan?.attributes[AttributeNames.PLUGIN_NAME],
          'multipleVersionPlugin'
        );
        const secondHandlerSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'simplePlugin: route - /hello');
        assert.notStrictEqual(secondHandlerSpan, undefined);
        assert.strictEqual(
          secondHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
          HapiLayerType.PLUGIN
        );
        assert.strictEqual(
          secondHandlerSpan?.attributes[AttributeNames.PLUGIN_NAME],
          'simplePlugin'
        );

        const exportedRootSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'rootSpan');
        assert.notStrictEqual(exportedRootSpan, undefined);
      });
    });

    it('should instrument multiple versions of the same plugin just once', async () => {
      const rootSpan = tracer.startSpan('rootSpan');

      await server.register([
        {
          plugin: multipleVersionPlugin,
          options: {
            name: 'world',
            path: 'test',
          },
        },
        {
          plugin: multipleVersionPlugin,
          options: {
            name: 'world',
            path: 'test2',
          },
        },
      ]);
      await server.start();
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await tracer.withSpan(rootSpan, async () => {
        const res1 = await server.inject({
          method: 'GET',
          url: '/test',
        });
        assert.strictEqual(res1.statusCode, 200);
        const res2 = await server.inject({
          method: 'GET',
          url: '/test2',
        });
        assert.strictEqual(res2.statusCode, 200);

        rootSpan.end();

        assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 3);

        const firstHandlerSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'multipleVersionPlugin: route - /test');
        assert.notStrictEqual(firstHandlerSpan, undefined);
        assert.strictEqual(
          firstHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
          HapiLayerType.PLUGIN
        );
        assert.strictEqual(
          firstHandlerSpan?.attributes[AttributeNames.PLUGIN_NAME],
          'multipleVersionPlugin'
        );
        const secondHandlerSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'multipleVersionPlugin: route - /test2');
        assert.notStrictEqual(secondHandlerSpan, undefined);
        assert.strictEqual(
          secondHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
          HapiLayerType.PLUGIN
        );
        assert.strictEqual(
          secondHandlerSpan?.attributes[AttributeNames.PLUGIN_NAME],
          'multipleVersionPlugin'
        );

        const exportedRootSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'rootSpan');
        assert.notStrictEqual(exportedRootSpan, undefined);
      });
    });

    it('should instrument package-based plugins', async () => {
      const rootSpan = tracer.startSpan('rootSpan');

      await server.register({
        plugin: packagePlugin,
      });
      await server.start();
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await tracer.withSpan(rootSpan, async () => {
        const res = await server.inject({
          method: 'GET',
          url: '/package',
        });
        assert.strictEqual(res.statusCode, 200);

        rootSpan.end();
        assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);

        const requestHandlerSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'plugin-by-package: route - /package');
        assert.notStrictEqual(requestHandlerSpan, undefined);
        assert.strictEqual(
          requestHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
          HapiLayerType.PLUGIN
        );
        assert.strictEqual(
          requestHandlerSpan?.attributes[AttributeNames.PLUGIN_NAME],
          'plugin-by-package'
        );

        const exportedRootSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'rootSpan');
        assert.notStrictEqual(exportedRootSpan, undefined);
      });
    });
  });
});
