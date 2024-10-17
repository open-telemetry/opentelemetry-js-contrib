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

import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { RPCMetadata, RPCType, setRPCMetadata } from '@opentelemetry/core';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  runTestFixture,
  TestCollector,
} from '@opentelemetry/contrib-test-utils';
import { getPlugin } from './plugin';
const plugin = getPlugin();

import { strictEqual, deepStrictEqual, ifError, notStrictEqual } from 'assert';
import * as hapi from '@hapi/hapi';
import { HapiLayerType } from '../src/internal-types';
import { AttributeNames } from '../src/enums/AttributeNames';

describe('Hapi Instrumentation - Core Tests', () => {
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncHooksContextManager;
  let server: hapi.Server;

  before(() => {
    plugin.enable();
    plugin.setTracerProvider(provider);
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

  describe('Instrumenting Hapi Routes', () => {
    describe('when handler is in route level', () => {
      it('should create a child span for single routes', async () => {
        const rootSpan = tracer.startSpan('rootSpan');
        server.route({
          method: 'GET',
          path: '/',
          handler: (request, h) => {
            return 'Hello World!';
          },
        });

        await server.start();
        strictEqual(memoryExporter.getFinishedSpans().length, 0);

        await context.with(
          trace.setSpan(context.active(), rootSpan),
          async () => {
            const res = await server.inject({
              method: 'GET',
              url: '/',
            });
            strictEqual(res.statusCode, 200);

            rootSpan.end();
            deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);

            const requestHandlerSpan = memoryExporter
              .getFinishedSpans()
              .find(span => span.name === 'route - /');
            notStrictEqual(requestHandlerSpan, undefined);
            strictEqual(
              requestHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
              HapiLayerType.ROUTER
            );

            const exportedRootSpan = memoryExporter
              .getFinishedSpans()
              .find(span => span.name === 'rootSpan');
            notStrictEqual(exportedRootSpan, undefined);
          }
        );
      });
    });
    describe('when handler is in route.options level', () => {
      it('should create a child span for single routes', async () => {
        const rootSpan = tracer.startSpan('rootSpan');
        server.route({
          method: 'GET',
          path: '/',
          options: {
            handler: (request, h) => {
              return 'Hello World!';
            },
          },
        });

        await server.start();
        strictEqual(memoryExporter.getFinishedSpans().length, 0);

        await context.with(
          trace.setSpan(context.active(), rootSpan),
          async () => {
            const res = await server.inject({
              method: 'GET',
              url: '/',
            });
            strictEqual(res.statusCode, 200);

            rootSpan.end();
            deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);

            const requestHandlerSpan = memoryExporter
              .getFinishedSpans()
              .find(span => span.name === 'route - /');
            notStrictEqual(requestHandlerSpan, undefined);
            strictEqual(
              requestHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
              HapiLayerType.ROUTER
            );

            const exportedRootSpan = memoryExporter
              .getFinishedSpans()
              .find(span => span.name === 'rootSpan');
            notStrictEqual(exportedRootSpan, undefined);
          }
        );
      });
    });

    describe('when handler is returned by route.options function', () => {
      it('should create a child span for single routes', async () => {
        const rootSpan = tracer.startSpan('rootSpan');
        server.route({
          method: 'GET',
          path: '/',
          options: () => ({
            handler: (request, h) => {
              return 'Hello World!';
            },
          }),
        });

        await server.start();
        strictEqual(memoryExporter.getFinishedSpans().length, 0);

        await context.with(
          trace.setSpan(context.active(), rootSpan),
          async () => {
            const res = await server.inject({
              method: 'GET',
              url: '/',
            });
            strictEqual(res.statusCode, 200);

            rootSpan.end();
            deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);

            const requestHandlerSpan = memoryExporter
              .getFinishedSpans()
              .find(span => span.name === 'route - /');
            notStrictEqual(requestHandlerSpan, undefined);
            strictEqual(
              requestHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
              HapiLayerType.ROUTER
            );

            const exportedRootSpan = memoryExporter
              .getFinishedSpans()
              .find(span => span.name === 'rootSpan');
            notStrictEqual(exportedRootSpan, undefined);
          }
        );
      });
    });

    it('should instrument the Hapi.Server (note: uppercase) method', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      server = new hapi.Server({
        port: 3000,
        host: 'localhost',
      });

      server.route({
        method: 'GET',
        path: '/',
        handler: (request, h) => {
          return 'Hello World!';
        },
      });

      await server.start();
      strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const res = await server.inject({
            method: 'GET',
            url: '/',
          });
          strictEqual(res.statusCode, 200);

          rootSpan.end();
          deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);

          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'route - /');
          notStrictEqual(requestHandlerSpan, undefined);
          strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
            HapiLayerType.ROUTER
          );

          const exportedRootSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'rootSpan');
          notStrictEqual(exportedRootSpan, undefined);
        }
      );
    });

    it('should create child spans for multiple routes', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      server.route([
        {
          method: 'GET',
          path: '/first',
          handler: (request, h) => {
            return 'First!';
          },
        },
        {
          method: 'GET',
          path: '/second',
          handler: (request, h) => {
            return 'Second!';
          },
        },
      ]);

      await server.start();
      strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const resFirst = await server.inject({
            method: 'GET',
            url: '/first',
          });
          const resSecond = await server.inject({
            method: 'GET',
            url: '/second',
          });

          strictEqual(resFirst.statusCode, 200);
          strictEqual(resSecond.statusCode, 200);

          rootSpan.end();
          deepStrictEqual(memoryExporter.getFinishedSpans().length, 3);

          const firstHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'route - /first');
          notStrictEqual(firstHandlerSpan, undefined);
          strictEqual(
            firstHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
            HapiLayerType.ROUTER
          );

          const secondHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'route - /second');
          notStrictEqual(secondHandlerSpan, undefined);
          strictEqual(
            secondHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
            HapiLayerType.ROUTER
          );

          const exportedRootSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'rootSpan');
          notStrictEqual(exportedRootSpan, undefined);
        }
      );
    });

    it('should start a new context for the handler', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      server.route([
        {
          method: 'GET',
          path: '/route',
          handler: (request, h) => {
            const span = tracer.startSpan('handler');
            span.end();
            return 'ok';
          },
        },
      ]);

      await server.start();
      strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const res = await server.inject({
            method: 'GET',
            url: '/route',
          });

          strictEqual(res.statusCode, 200);

          rootSpan.end();
          deepStrictEqual(memoryExporter.getFinishedSpans().length, 3);

          const routeSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'route - /route');
          notStrictEqual(routeSpan, undefined);
          strictEqual(
            routeSpan?.attributes[AttributeNames.HAPI_TYPE],
            HapiLayerType.ROUTER
          );

          const handlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'handler');
          notStrictEqual(routeSpan, undefined);
          strictEqual(
            handlerSpan?.parentSpanId,
            routeSpan?.spanContext().spanId
          );
        }
      );
    });

    it('should access route parameters and add to span', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      server.route({
        method: 'GET',
        path: '/users/{userId}',
        handler: (request, h) => {
          return `Hello ${request.params.userId}`;
        },
      });

      await server.start();
      strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const res = await server.inject({
            method: 'GET',
            url: '/users/1',
          });
          strictEqual(res.statusCode, 200);

          rootSpan.end();
          deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);

          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'route - /users/{userId}');
          notStrictEqual(requestHandlerSpan, undefined);
          strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.HAPI_TYPE],
            HapiLayerType.ROUTER
          );

          const exportedRootSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'rootSpan');
          notStrictEqual(exportedRootSpan, undefined);
        }
      );
    });

    it('should not create span if there is no parent span', async () => {
      server.route({
        method: 'GET',
        path: '/',
        handler: (request, h) => {
          return 'Hello World!';
        },
      });
      await server.start();
      strictEqual(memoryExporter.getFinishedSpans().length, 0);

      const res = await server.inject({
        method: 'GET',
        url: '/',
      });
      strictEqual(res.statusCode, 200);
      deepStrictEqual(memoryExporter.getFinishedSpans().length, 0);
    });

    it('should update rpcMetadata.route information', async () => {
      const rootSpan = tracer.startSpan('rootSpan', {});
      server.route({
        method: 'GET',
        path: '/users/{userId}',
        handler: (request, h) => {
          return `Hello ${request.params.userId}`;
        },
      });

      await server.start();
      strictEqual(memoryExporter.getFinishedSpans().length, 0);
      const rpcMetadata: RPCMetadata = { type: RPCType.HTTP, span: rootSpan };
      await context.with(
        setRPCMetadata(trace.setSpan(context.active(), rootSpan), rpcMetadata),
        async () => {
          const res = await server.inject({
            method: 'GET',
            url: '/users/1',
          });
          strictEqual(res.statusCode, 200);

          rootSpan.end();
          deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);

          strictEqual(rpcMetadata.route, '/users/{userId}');
        }
      );
    });

    it('should end span and record the error if an error is thrown in route handler', async () => {
      const errorMessage = 'error';
      const rootSpan = tracer.startSpan('rootSpan', {});
      server.route({
        method: 'GET',
        path: '/users/{userId}',
        handler: (request, h) => {
          throw new Error(errorMessage);
        },
      });

      await server.start();
      strictEqual(memoryExporter.getFinishedSpans().length, 0);
      const rpcMetadata = { type: RPCType.HTTP, span: rootSpan };
      await context.with(
        setRPCMetadata(trace.setSpan(context.active(), rootSpan), rpcMetadata),
        async () => {
          const res = await server.inject({
            method: 'GET',
            url: '/users/1',
          });
          strictEqual(res.statusCode, 500);

          rootSpan.end();
          deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);

          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'route - /users/{userId}');
          notStrictEqual(requestHandlerSpan, undefined);
          strictEqual(requestHandlerSpan?.events[0].name, 'exception');
          strictEqual(requestHandlerSpan.status.code, SpanStatusCode.ERROR);
          strictEqual(requestHandlerSpan.status.message, errorMessage);
        }
      );
    });
  });

  describe('Disabling Hapi instrumentation', () => {
    it('should not create new spans', async () => {
      plugin.disable();

      // must reinitialize here for effects of disabling plugin to become apparent
      server = hapi.server({
        port: 3000,
        host: 'localhost',
      });

      const rootSpan = tracer.startSpan('rootSpan');

      server.route({
        method: 'GET',
        path: '/',
        handler: (request, h) => {
          return 'Hello World!';
        },
      });

      await server.start();

      strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const res = await server.inject({
            method: 'GET',
            url: '/',
          });
          strictEqual(res.statusCode, 200);
          rootSpan.end();
          deepStrictEqual(memoryExporter.getFinishedSpans().length, 1);
          notStrictEqual(memoryExporter.getFinishedSpans()[0], undefined);
        }
      );
    });
  });

  describe('ESM', () => {
    it('should work with ESM modules', async () => {
      await runTestFixture({
        cwd: __dirname,
        argv: ['fixtures/use-hapi.mjs'],
        env: {
          NODE_OPTIONS:
            '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
          NODE_NO_WARNINGS: '1',
        },
        checkResult: (err, stdout, stderr) => {
          ifError(err);
        },
        checkCollector: (collector: TestCollector) => {
          const spans = collector.sortedSpans;
          strictEqual(spans.length, 2);
          strictEqual(spans[0].name, 'GET /route/{param}');
          strictEqual(
            spans[0].instrumentationScope.name,
            '@opentelemetry/instrumentation-http'
          );
          strictEqual(spans[1].name, 'route - /route/{param}');
          strictEqual(
            spans[1].instrumentationScope.name,
            '@opentelemetry/instrumentation-hapi'
          );
        },
      });
    });
  });
});
