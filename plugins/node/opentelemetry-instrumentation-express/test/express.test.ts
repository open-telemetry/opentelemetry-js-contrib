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

import { SpanStatusCode, context, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import * as semver from 'semver';
import { AttributeNames } from '../src/enums/AttributeNames';
import { ExpressInstrumentation } from '../src';
import { createServer, httpRequest, serverWithMiddleware } from './utils';
import { SEMATTRS_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import * as testUtils from '@opentelemetry/contrib-test-utils';

const instrumentation = new ExpressInstrumentation();
instrumentation.enable();
instrumentation.disable();

import * as express from 'express';
import { RPCMetadata, getRPCMetadata } from '@opentelemetry/core';
import { Server } from 'http';

const LIB_VERSION = require('express/package.json').version;
const isExpressV5 = semver.satisfies(LIB_VERSION, '>=5.0.0');

describe('ExpressInstrumentation', () => {
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  const provider = new NodeTracerProvider({
    spanProcessors: [spanProcessor],
  });
  const tracer = provider.getTracer('default');
  const contextManager = new AsyncHooksContextManager().enable();

  before(() => {
    instrumentation.setTracerProvider(provider);
    context.setGlobalContextManager(contextManager);
    instrumentation.enable();
  });

  afterEach(() => {
    contextManager.disable();
    contextManager.enable();
    memoryExporter.reset();
  });

  describe('Instrumenting normal get operations', () => {
    let server: Server, port: number;
    afterEach(() => {
      server?.close();
    });

    it('should create a child span for middlewares', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      const customMiddleware: express.RequestHandler = (req, res, next) => {
        for (let i = 0; i < 1000000; i++) {
          continue;
        }
        return next();
      };
      let finishListenerCount: number | undefined;
      let rpcMetadata: RPCMetadata | undefined;
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use(express.json());
        app.use((req, res, next) => {
          rpcMetadata = getRPCMetadata(context.active());
          res.on('finish', () => {
            finishListenerCount = res.listenerCount('finish');
          });
          next();
        });
        for (let index = 0; index < 15; index++) {
          app.use(customMiddleware);
        }
      });
      server = httpServer.server;
      port = httpServer.port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(
            `http://localhost:${port}/toto/tata`
          );
          assert.strictEqual(response, 'tata');
          rootSpan.end();
          assert.strictEqual(finishListenerCount, 3);
          assert.notStrictEqual(
            memoryExporter
              .getFinishedSpans()
              .find(span => span.name.includes('customMiddleware')),
            undefined
          );
          assert.notStrictEqual(
            memoryExporter
              .getFinishedSpans()
              .find(span => span.name.includes('jsonParser')),
            undefined
          );
          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('request handler'));
          assert.notStrictEqual(requestHandlerSpan, undefined);
          assert.strictEqual(
            requestHandlerSpan?.attributes[SEMATTRS_HTTP_ROUTE],
            '/toto/:id'
          );
          assert.strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.EXPRESS_TYPE],
            'request_handler'
          );
          assert.strictEqual(rpcMetadata?.route, '/toto/:id');
        }
      );
    });

    it('supports sync middlewares directly responding', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let finishListenerCount: number | undefined;
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use((req, res, next) => {
          res.on('finish', () => {
            finishListenerCount = res.listenerCount('finish');
          });
          next();
        });
        const syncMiddleware: express.RequestHandler = (req, res, next) => {
          for (let i = 0; i < 1000000; i++) {
            continue;
          }
          res.status(200).end('middleware');
        };
        for (let index = 0; index < 15; index++) {
          app.use(syncMiddleware);
        }
      });
      server = httpServer.server;
      port = httpServer.port;

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(
            `http://localhost:${port}/toto/tata`
          );
          assert.strictEqual(response, 'middleware');
          rootSpan.end();
          assert.strictEqual(finishListenerCount, 3);
          assert.notStrictEqual(
            memoryExporter
              .getFinishedSpans()
              .find(span => span.name.includes('syncMiddleware')),
            undefined,
            'no syncMiddleware span'
          );
        }
      );
    });

    it('supports async middlewares', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let finishListenerCount: number | undefined;
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use((req, res, next) => {
          res.on('finish', () => {
            finishListenerCount = res.listenerCount('finish');
          });
          next();
        });
        const asyncMiddleware: express.RequestHandler = (req, res, next) => {
          setTimeout(() => {
            next();
          }, 50);
        };
        for (let index = 0; index < 15; index++) {
          app.use(asyncMiddleware);
        }
      });
      server = httpServer.server;
      port = httpServer.port;

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(
            `http://localhost:${port}/toto/tata`
          );
          assert.strictEqual(response, 'tata');
          rootSpan.end();
          assert.strictEqual(finishListenerCount, 3);
          assert.notStrictEqual(
            memoryExporter
              .getFinishedSpans()
              .find(span => span.name.includes('asyncMiddleware')),
            undefined,
            'no asyncMiddleware span'
          );
        }
      );
    });

    it('supports async middlewares directly responding', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let finishListenerCount: number | undefined;
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use((req, res, next) => {
          res.on('finish', () => {
            finishListenerCount = res.listenerCount('finish');
          });
          next();
        });
        const asyncMiddleware: express.RequestHandler = (req, res, next) => {
          setTimeout(() => {
            res.status(200).end('middleware');
          }, 50);
        };
        for (let index = 0; index < 15; index++) {
          app.use(asyncMiddleware);
        }
      });
      server = httpServer.server;
      port = httpServer.port;

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(
            `http://localhost:${port}/toto/tata`
          );
          assert.strictEqual(response, 'middleware');
          rootSpan.end();
          assert.strictEqual(finishListenerCount, 3);
          assert.notStrictEqual(
            memoryExporter
              .getFinishedSpans()
              .find(span => span.name.includes('asyncMiddleware')),
            undefined,
            'no asyncMiddleware span'
          );
        }
      );
    });

    it('captures sync middleware errors', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let finishListenerCount: number | undefined;
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use((req, res, next) => {
          res.on('finish', () => {
            finishListenerCount = res.listenerCount('finish');
          });
          next();
        });

        const errorMiddleware: express.RequestHandler = (req, res, next) => {
          throw new Error('message');
        };
        app.use(errorMiddleware);
      });
      server = httpServer.server;
      port = httpServer.port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/toto/tata`);
          rootSpan.end();
          assert.strictEqual(finishListenerCount, 3);

          const errorSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('errorMiddleware'));
          assert.notStrictEqual(errorSpan, undefined);

          assert.deepStrictEqual(errorSpan!.status, {
            code: SpanStatusCode.ERROR,
            message: 'message',
          });
          assert.notStrictEqual(
            errorSpan!.events.find(event => event.name === 'exception'),
            undefined
          );
        }
      );
    });

    it('captures async middleware errors', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let finishListenerCount: number | undefined;
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use((req, res, next) => {
          res.on('finish', () => {
            finishListenerCount = res.listenerCount('finish');
          });
          next();
        });

        const errorMiddleware: express.RequestHandler = (req, res, next) => {
          setTimeout(() => next(new Error('message')), 10);
        };
        app.use(errorMiddleware);
      });
      server = httpServer.server;
      port = httpServer.port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/toto/tata`);
          rootSpan.end();
          assert.strictEqual(finishListenerCount, 2);

          const errorSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('errorMiddleware'));
          assert.notStrictEqual(errorSpan, undefined);

          assert.deepStrictEqual(errorSpan!.status, {
            code: SpanStatusCode.ERROR,
            message: 'message',
          });
          assert.notStrictEqual(
            errorSpan!.events.find(event => event.name === 'exception'),
            undefined
          );
        }
      );
    });

    it('should not create span because there are no parent', async () => {
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        for (let i = 0; i < 1000000; i++) {}
        return next();
      });
      const router = express.Router();
      app.use('/toto', router);
      router.get('/:id', (req, res, next) => {
        return res.status(200).end('test');
      });
      const httpServer = await createServer(app);
      server = httpServer.server;
      port = httpServer.port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      const res = await httpRequest.get(`http://localhost:${port}/toto/tata`);
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      assert.strictEqual(res, 'test');
    });

    it('should update rpcMetadata.route with the bare middleware layer', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let rpcMetadata: RPCMetadata | undefined;
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use(express.json());
        app.use((req, res, next) => {
          rpcMetadata = getRPCMetadata(context.active());
          next();
        });

        app.use('/bare_middleware', (req, res) => {
          return res.status(200).end('test');
        });
      });
      server = httpServer.server;
      port = httpServer.port;
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(
            `http://localhost:${port}/bare_middleware/ignore_route_segment`
          );
          assert.strictEqual(response, 'test');
          rootSpan.end();
          assert.strictEqual(rpcMetadata?.route, '/bare_middleware');
        }
      );
    });

    it('should update rpcMetadata.route with the latest middleware layer', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let rpcMetadata: RPCMetadata | undefined;
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use(express.json());
        app.use((req, res, next) => {
          rpcMetadata = getRPCMetadata(context.active());
          next();
        });

        const router = express.Router();

        app.use('/router', router);

        router.use('/router_middleware', (req, res) => {
          return res.status(200).end('test');
        });
      });
      server = httpServer.server;
      port = httpServer.port;
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(
            `http://localhost:${port}/router/router_middleware/ignore_route_segment`
          );
          assert.strictEqual(response, 'test');
          rootSpan.end();
          assert.strictEqual(rpcMetadata?.route, '/router/router_middleware');
        }
      );
    });

    it('should update rpcMetadata.route with the bare request handler layer', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let rpcMetadata: RPCMetadata | undefined;
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use(express.json());
        app.use((req, res, next) => {
          rpcMetadata = getRPCMetadata(context.active());
          next();
        });

        app.get('/bare_route', (req, res) => {
          return res.status(200).end('test');
        });
      });
      server = httpServer.server;
      port = httpServer.port;
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(
            `http://localhost:${port}/bare_route`
          );
          assert.strictEqual(response, 'test');
          rootSpan.end();
          assert.strictEqual(rpcMetadata?.route, '/bare_route');
        }
      );
    });

    it('should ignore double slashes in routes', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let rpcMetadata: RPCMetadata | undefined;
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use(express.json());
        app.use((req, res, next) => {
          rpcMetadata = getRPCMetadata(context.active());
          next();
        });
      });
      server = httpServer.server;
      port = httpServer.port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(
            `http://localhost:${port}/double-slashes/foo`
          );
          assert.strictEqual(response, 'foo');
          rootSpan.end();
          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('request handler'));
          assert.strictEqual(
            requestHandlerSpan?.attributes[SEMATTRS_HTTP_ROUTE],
            '/double-slashes/:id'
          );
          assert.strictEqual(rpcMetadata?.route, '/double-slashes/:id');
        }
      );
    });

    it('should keep stack in the router layer handle', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let routerLayer: { name: string; handle: { stack: any[] } };
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use(express.json());
        app.get('/bare_route', (req, res) => {
          const stack = (req.app._router || req.app.router).stack as any[];
          routerLayer = stack.find(layer => layer.name === 'router');
          return res.status(200).end('test');
        });
      });
      server = httpServer.server;
      port = httpServer.port;
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(
            `http://localhost:${port}/bare_route`
          );
          assert.strictEqual(response, 'test');
          rootSpan.end();
          assert.ok(
            routerLayer?.handle?.stack?.length === 1,
            'router layer stack is accessible'
          );
        }
      );
    });

    it('should keep the handle properties even if router is patched before instrumentation does it', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let routerLayer: { name: string; handle: { stack: any[] } };

      const expressApp = express();
      const router = express.Router();
      const CustomRouter: (...p: Parameters<typeof router>) => void = (
        req,
        res,
        next
      ) => router(req, res, next);
      router.use('/:slug', (req, res, next) => {
        const stack = (req.app._router || req.app.router).stack as any[];
        routerLayer = stack.find(router => router.name === 'CustomRouter');
        return res.status(200).end('bar');
      });
      // The patched router now has express router's own properties in its prototype so
      // they are not accessible through `Object.keys(...)`
      // https://github.com/TryGhost/Ghost/blob/fefb9ec395df8695d06442b6ecd3130dae374d94/ghost/core/core/frontend/web/site.js#L192
      Object.setPrototypeOf(CustomRouter, router);
      expressApp.use(CustomRouter);

      const httpServer = await createServer(expressApp);
      server = httpServer.server;
      port = httpServer.port;
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(
            `http://localhost:${port}/foo`
          );
          assert.strictEqual(response, 'bar');
          rootSpan.end();
          assert.ok(
            routerLayer.handle.stack.length === 1,
            'router layer stack is accessible'
          );
        }
      );
    });
  });

  describe('Disabling plugin', () => {
    let server: Server, port: number;
    afterEach(() => {
      server?.close();
    });
    it('should not create new spans', async () => {
      instrumentation.disable();
      const rootSpan = tracer.startSpan('rootSpan');
      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use(express.json());
        const customMiddleware: express.RequestHandler = (req, res, next) => {
          for (let i = 0; i < 1000; i++) {
            continue;
          }
          return next();
        };
        app.use(customMiddleware);
      });
      server = httpServer.server;
      port = httpServer.port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/toto/tata`);
          rootSpan.end();
          // There should be exactly one span, and it should be the root span.
          // There should not be any spans from the Express instrumentation.
          assert.deepEqual(memoryExporter.getFinishedSpans().length, 1);
          assert.notStrictEqual(
            memoryExporter.getFinishedSpans()[0],
            undefined
          );
        }
      );
    });
  });

  it('should work with ESM usage', async () => {
    await testUtils.runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/use-express.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        NODE_NO_WARNINGS: '1',
      },
      checkResult: (err, stdout, stderr) => {
        assert.ifError(err);
      },
      checkCollector: (collector: testUtils.TestCollector) => {
        // use-express.mjs creates an express app with a 'GET /post/:id' endpoint and
        // a `simpleMiddleware`, then makes a single 'GET /post/0' request. We
        // expect to see spans like this:
        //    span 'GET /post/:id'
        //     `- span 'middleware - query'            // not in express@5
        //     `- span 'middleware - expressInit'      // not in express@5
        //     `- span 'middleware - simpleMiddleware'
        //     `- span 'request handler - /post/:id'
        const spans = collector.sortedSpans;
        assert.strictEqual(spans[0].name, 'GET');
        assert.strictEqual(spans[0].kind, testUtils.OtlpSpanKind.CLIENT);
        assert.strictEqual(spans[1].name, 'GET /post/:id');
        assert.strictEqual(spans[1].kind, testUtils.OtlpSpanKind.SERVER);
        assert.strictEqual(spans[1].parentSpanId, spans[0].spanId);
        const expectedSpanNames = isExpressV5
          ? ['middleware - simpleMiddleware', 'request handler - /post/:id']
          : [
              'middleware - query',
              'middleware - expressInit',
              'middleware - simpleMiddleware',
              'request handler - /post/:id',
            ];
        const remainingSpans = spans.slice(2);
        for (const expectedSpanName of expectedSpanNames) {
          const span = remainingSpans.shift()!;
          assert.strictEqual(span.name, expectedSpanName);
          assert.strictEqual(span.kind, testUtils.OtlpSpanKind.INTERNAL);
          assert.strictEqual(span.parentSpanId, spans[1].spanId);
        }
      },
    });
  });

  it('should work with Express routers', async () => {
    await testUtils.runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/use-express-router.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        NODE_NO_WARNINGS: '1',
      },
      checkResult: (err, stdout, stderr) => {
        assert.ifError(err);
      },
      checkCollector: (collector: testUtils.TestCollector) => {
        const spans = collector.sortedSpans;

        assert.strictEqual(spans[0].name, 'GET');
        assert.strictEqual(spans[0].kind, testUtils.OtlpSpanKind.CLIENT);
        assert.strictEqual(spans[1].name, 'GET /api/user/:id');
        assert.strictEqual(spans[1].kind, testUtils.OtlpSpanKind.SERVER);
        assert.strictEqual(spans[1].parentSpanId, spans[0].spanId);
        const expectedSpanNames = isExpressV5
          ? [
              'middleware - simpleMiddleware',
              'router - /api/user/:id',
              'request handler - /api/user/:id',
            ]
          : [
              'middleware - query',
              'middleware - expressInit',
              'middleware - simpleMiddleware',
              'router - /api/user/:id',
              'request handler - /api/user/:id',
            ];
        const remainingSpans = spans.slice(2);
        for (const expectedSpanName of expectedSpanNames) {
          const span = remainingSpans.shift()!;
          assert.strictEqual(span.name, expectedSpanName);
          assert.strictEqual(span.kind, testUtils.OtlpSpanKind.INTERNAL);
          assert.strictEqual(span.parentSpanId, spans[1].spanId);
        }
      },
    });
  });

  it('should work with nested Express routers', async () => {
    await testUtils.runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/use-express-nested-router.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        NODE_NO_WARNINGS: '1',
      },
      checkResult: (err, stdout, stderr) => {
        assert.ifError(err);
      },
      checkCollector: (collector: testUtils.TestCollector) => {
        const spans = collector.sortedSpans;

        assert.strictEqual(spans[0].name, 'GET');
        assert.strictEqual(spans[0].kind, testUtils.OtlpSpanKind.CLIENT);
        assert.strictEqual(spans[1].name, 'GET /api/user/:id/posts/:postId');
        assert.strictEqual(spans[1].kind, testUtils.OtlpSpanKind.SERVER);
        const expectedSpanNames = isExpressV5
          ? [
              'middleware - simpleMiddleware',
              'router - /api/user/:id',
              'router - /api/user/:id/posts',
              'middleware - simpleMiddleware2',
              'request handler - /api/user/:id/posts/:postId',
            ]
          : [
              'middleware - query',
              'middleware - expressInit',
              'middleware - simpleMiddleware',
              'router - /api/user/:id',
              'router - /api/user/:id/posts',
              'middleware - simpleMiddleware2',
              'request handler - /api/user/:id/posts/:postId',
            ];

        const remainingSpans = spans.slice(2);
        for (const expectedSpanName of expectedSpanNames) {
          const span = remainingSpans.shift()!;
          assert.strictEqual(span.name, expectedSpanName);
          assert.strictEqual(span.kind, testUtils.OtlpSpanKind.INTERNAL);
          assert.strictEqual(span.parentSpanId, spans[1].spanId);
        }
      },
    });
  });

  it('should set a correct transaction name for routes specified in RegEx', async () => {
    await testUtils.runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/use-express-regex.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        NODE_NO_WARNINGS: '1',
        TEST_REGEX_ROUTE: '/test/regex',
      },
      checkResult: (err, stdout, stderr) => {
        assert.ifError(err);
      },
      checkCollector: (collector: testUtils.TestCollector) => {
        const spans = collector.sortedSpans;

        assert.strictEqual(spans[0].name, 'GET');
        assert.strictEqual(spans[0].kind, testUtils.OtlpSpanKind.CLIENT);
        assert.strictEqual(spans[1].name, 'GET /\\/test\\/regex/');
        assert.strictEqual(spans[1].parentSpanId, spans[0].spanId);
        assert.strictEqual(spans[1].kind, testUtils.OtlpSpanKind.SERVER);
        const expectedSpanNames = isExpressV5
          ? [
              'middleware - simpleMiddleware',
              'request handler - /\\/test\\/regex/',
            ]
          : [
              'middleware - query',
              'middleware - expressInit',
              'middleware - simpleMiddleware',
              'request handler - /\\/test\\/regex/',
            ];
        const remainingSpans = spans.slice(2);
        for (const expectedSpanName of expectedSpanNames) {
          const span = remainingSpans.shift()!;
          assert.strictEqual(span.name, expectedSpanName);
          assert.strictEqual(span.kind, testUtils.OtlpSpanKind.INTERNAL);
          assert.strictEqual(span.parentSpanId, spans[1].spanId);
        }
      },
    });
  });

  it('should set a correct transaction name for routes consisting of array including numbers', async () => {
    await testUtils.runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/use-express-regex.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        NODE_NO_WARNINGS: '1',
        TEST_REGEX_ROUTE: '/test/6/test',
      },
      checkResult: err => {
        assert.ifError(err);
      },
      checkCollector: (collector: testUtils.TestCollector) => {
        const spans = collector.sortedSpans;

        assert.strictEqual(spans[0].name, 'GET');
        assert.strictEqual(spans[0].kind, testUtils.OtlpSpanKind.CLIENT);
        assert.strictEqual(spans[1].name, 'GET /test,6,/test/');
        assert.strictEqual(spans[1].kind, testUtils.OtlpSpanKind.SERVER);
        const expectedSpanNames = isExpressV5
          ? [
              'middleware - simpleMiddleware',
              'request handler - /test,6,/test/',
            ]
          : [
              'middleware - query',
              'middleware - expressInit',
              'middleware - simpleMiddleware',
              'request handler - /test,6,/test/',
            ];
        const remainingSpans = spans.slice(2);
        for (const expectedSpanName of expectedSpanNames) {
          const span = remainingSpans.shift()!;
          assert.strictEqual(span.name, expectedSpanName);
          assert.strictEqual(span.kind, testUtils.OtlpSpanKind.INTERNAL);
          assert.strictEqual(span.parentSpanId, spans[1].spanId);
        }
      },
    });
  });

  for (const segment of ['array1', 'array5']) {
    it('should set a correct transaction name for routes consisting of arrays of routes', async () => {
      await testUtils.runTestFixture({
        cwd: __dirname,
        argv: ['fixtures/use-express-regex.mjs'],
        env: {
          NODE_OPTIONS:
            '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
          NODE_NO_WARNINGS: '1',
          TEST_REGEX_ROUTE: `/test/${segment}`,
        },
        checkResult: err => {
          assert.ifError(err);
        },
        checkCollector: (collector: testUtils.TestCollector) => {
          const spans = collector.sortedSpans;

          assert.strictEqual(spans[0].name, 'GET');
          assert.strictEqual(spans[0].kind, testUtils.OtlpSpanKind.CLIENT);
          assert.strictEqual(
            spans[1].name,
            'GET /test/array1,/\\/test\\/array[2-9]/'
          );
          assert.strictEqual(spans[1].kind, testUtils.OtlpSpanKind.SERVER);
          const expectedSpanNames = isExpressV5
            ? [
                'middleware - simpleMiddleware',
                'request handler - /test/array1,/\\/test\\/array[2-9]/',
              ]
            : [
                'middleware - query',
                'middleware - expressInit',
                'middleware - simpleMiddleware',
                'request handler - /test/array1,/\\/test\\/array[2-9]/',
              ];
          const remainingSpans = spans.slice(2);
          for (const expectedSpanName of expectedSpanNames) {
            const span = remainingSpans.shift()!;
            assert.strictEqual(span.name, expectedSpanName);
            assert.strictEqual(span.kind, testUtils.OtlpSpanKind.INTERNAL);
            assert.strictEqual(span.parentSpanId, spans[1].spanId);
          }
        },
      });
    });
  }

  for (const segment of [
    'arr/545',
    'arr/required',
    'arr/required',
    'arr/requiredPath',
    'arr/required/lastParam',
    'arr55/required/lastParam',
    'arr/requiredpath/optionalPath/',
    'arr/requiredpath/optionalPath/lastParam',
  ]) {
    it('should handle more complex regexes in route arrays correctly', async () => {
      await testUtils.runTestFixture({
        cwd: __dirname,
        argv: ['fixtures/use-express-regex.mjs'],
        env: {
          NODE_OPTIONS:
            '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
          NODE_NO_WARNINGS: '1',
          TEST_REGEX_ROUTE: `/test/${segment}`,
        },
        checkResult: err => {
          assert.ifError(err);
        },
        checkCollector: (collector: testUtils.TestCollector) => {
          const spans = collector.sortedSpans;

          assert.strictEqual(spans[0].name, 'GET');
          assert.strictEqual(spans[0].kind, testUtils.OtlpSpanKind.CLIENT);
          assert.strictEqual(
            spans[1].name,
            'GET /test/arr/:id,/\\/test\\/arr[0-9]*\\/required(path)?(\\/optionalPath)?\\/(lastParam)?/'
          );
          assert.strictEqual(spans[1].kind, testUtils.OtlpSpanKind.SERVER);

          const expectedSpanNames = isExpressV5
            ? [
                'middleware - simpleMiddleware',
                'request handler - /test/arr/:id,/\\/test\\/arr[0-9]*\\/required(path)?(\\/optionalPath)?\\/(lastParam)?/',
              ]
            : [
                'middleware - query',
                'middleware - expressInit',
                'middleware - simpleMiddleware',
                'request handler - /test/arr/:id,/\\/test\\/arr[0-9]*\\/required(path)?(\\/optionalPath)?\\/(lastParam)?/',
              ];
          const remainingSpans = spans.slice(2);
          for (const expectedSpanName of expectedSpanNames) {
            const span = remainingSpans.shift()!;
            assert.strictEqual(span.name, expectedSpanName);
            assert.strictEqual(span.kind, testUtils.OtlpSpanKind.INTERNAL);
            assert.strictEqual(span.parentSpanId, spans[1].spanId);
          }
        },
      });
    });
  }
});
