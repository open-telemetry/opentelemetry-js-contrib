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

import * as KoaRouter from '@koa/router';
import { context, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

import { KoaInstrumentation } from '../src';
const plugin = new KoaInstrumentation();

import * as assert from 'assert';
import * as koa from 'koa';
import * as http from 'http';
import { AddressInfo } from 'net';
import { KoaLayerType } from '../src/types';
import { AttributeNames } from '../src/enums/AttributeNames';
import { RPCType, setRPCMetadata } from '@opentelemetry/core';

const httpRequest = {
  get: (options: http.ClientRequestArgs | string) => {
    return new Promise((resolve, reject) => {
      return http.get(options, resp => {
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
  },
};

describe('Koa Instrumentation', () => {
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  plugin.setTracerProvider(provider);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncHooksContextManager;
  let app: koa;
  let server: http.Server;
  let port: number;

  before(() => {
    plugin.enable();
  });

  after(() => {
    plugin.disable();
  });

  beforeEach(async () => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());

    app = new koa();
    server = http.createServer(app.callback());
    await new Promise<void>(resolve => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    server.close();
  });

  const simpleResponse: koa.Middleware = async (ctx, next) => {
    ctx.body = 'test';
    await next();
  };

  const customMiddleware: koa.Middleware = async (ctx, next) => {
    for (let i = 0; i < 1000000; i++) {
      continue;
    }
    await next();
  };

  const spanCreateMiddleware: koa.Middleware = async (ctx, next) => {
    const span = tracer.startSpan('foo');
    span.end();
    await next();
  };

  const asyncMiddleware: koa.Middleware = async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    ctx.body = `${ctx.method} ${ctx.url} - ${ms}ms`;
  };

  const failingMiddleware: koa.Middleware = async (_ctx, _next) => {
    throw new Error('I failed!');
  };

  describe('Instrumenting @koa/router calls', () => {
    it('should create a child span for middlewares', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      const rpcMetadata = { type: RPCType.HTTP, span: rootSpan };
      app.use((ctx, next) =>
        context.with(
          setRPCMetadata(
            trace.setSpan(context.active(), rootSpan),
            rpcMetadata
          ),
          next
        )
      );

      const router = new KoaRouter();
      router.get('/post/:id', ctx => {
        ctx.body = `Post id: ${ctx.params.id}`;
      });

      app.use(router.routes());

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/post/0`);
          rootSpan.end();

          assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);
          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('router - /post/:id'));
          assert.notStrictEqual(requestHandlerSpan, undefined);

          assert.strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.KOA_TYPE],
            KoaLayerType.ROUTER
          );

          assert.strictEqual(
            requestHandlerSpan?.attributes[SemanticAttributes.HTTP_ROUTE],
            '/post/:id'
          );

          const exportedRootSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'GET /post/:id');
          assert.notStrictEqual(exportedRootSpan, undefined);
        }
      );
    });

    it('should create a named child span for middlewares', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      const rpcMetadata = { type: RPCType.HTTP, span: rootSpan };
      app.use((ctx, next) =>
        context.with(
          setRPCMetadata(
            trace.setSpan(context.active(), rootSpan),
            rpcMetadata
          ),
          next
        )
      );

      const router = new KoaRouter();
      router.get('retrievePost', '/post/:id', ctx => {
        ctx.body = `Post id: ${ctx.params.id}`;
      });

      app.use(router.routes());

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/post/0`);
          rootSpan.end();

          assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);
          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'retrievePost');
          assert.notStrictEqual(requestHandlerSpan, undefined);

          assert.strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.KOA_TYPE],
            KoaLayerType.ROUTER
          );

          assert.strictEqual(
            requestHandlerSpan?.attributes[SemanticAttributes.HTTP_ROUTE],
            '/post/:id'
          );

          const exportedRootSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'GET /post/:id');
          assert.notStrictEqual(exportedRootSpan, undefined);
        }
      );
    });

    it('should correctly instrument nested routers', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      const rpcMetadata = { type: RPCType.HTTP, span: rootSpan };
      app.use((ctx, next) =>
        context.with(
          setRPCMetadata(
            trace.setSpan(context.active(), rootSpan),
            rpcMetadata
          ),
          next
        )
      );

      const router = new KoaRouter();
      const nestedRouter = new KoaRouter();
      nestedRouter.get('/post/:id', ctx => {
        ctx.body = `Post id: ${ctx.params.id}`;
      });

      router.use('/:first', nestedRouter.routes());
      app.use(router.routes());

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/test/post/0`);
          rootSpan.end();

          assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);
          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('router - /:first/post/:id'));
          assert.notStrictEqual(requestHandlerSpan, undefined);

          assert.strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.KOA_TYPE],
            KoaLayerType.ROUTER
          );

          assert.strictEqual(
            requestHandlerSpan?.attributes[SemanticAttributes.HTTP_ROUTE],
            '/:first/post/:id'
          );

          const exportedRootSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'GET /:first/post/:id');
          assert.notStrictEqual(exportedRootSpan, undefined);
        }
      );
    });

    it('should correctly instrument prefixed routers', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      const rpcMetadata = { type: RPCType.HTTP, span: rootSpan };
      app.use((ctx, next) =>
        context.with(
          setRPCMetadata(
            trace.setSpan(context.active(), rootSpan),
            rpcMetadata
          ),
          next
        )
      );

      const router = new KoaRouter();
      router.get('/post/:id', ctx => {
        ctx.body = `Post id: ${ctx.params.id}`;
      });
      router.prefix('/:first');
      app.use(router.routes());

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/test/post/0`);
          rootSpan.end();

          assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);
          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('router - /:first/post/:id'));
          assert.notStrictEqual(requestHandlerSpan, undefined);

          assert.strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.KOA_TYPE],
            KoaLayerType.ROUTER
          );

          assert.strictEqual(
            requestHandlerSpan?.attributes[SemanticAttributes.HTTP_ROUTE],
            '/:first/post/:id'
          );

          const exportedRootSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'GET /:first/post/:id');
          assert.notStrictEqual(exportedRootSpan, undefined);
        }
      );
    });
  });

  describe('Instrumenting core middleware calls', () => {
    it('should create a child span for middlewares', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      app.use((ctx, next) =>
        context.with(trace.setSpan(context.active(), rootSpan), next)
      );
      app.use(customMiddleware);
      app.use(simpleResponse);
      app.use(spanCreateMiddleware);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}`);
          rootSpan.end();
          assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 5);

          assert.notStrictEqual(
            memoryExporter
              .getFinishedSpans()
              .find(span => span.name.includes('customMiddleware')),
            undefined
          );

          const fooParentSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('spanCreateMiddleware'));
          assert.notStrictEqual(fooParentSpan, undefined);

          const fooSpan = memoryExporter.getFinishedSpans().find(span => 'foo');
          assert.notStrictEqual(fooSpan, undefined);
          assert.strictEqual(
            fooSpan!.parentSpanId,
            fooParentSpan!.spanContext().spanId
          );

          const simpleResponseSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('simpleResponse'));
          assert.notStrictEqual(simpleResponseSpan, undefined);

          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('middleware'));
          assert.notStrictEqual(requestHandlerSpan, undefined);

          assert.strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.KOA_TYPE],
            KoaLayerType.MIDDLEWARE
          );
          const exportedRootSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'rootSpan');
          assert.notStrictEqual(exportedRootSpan, undefined);
        }
      );
    });

    it('should not create span if there is no parent span', async () => {
      app.use(customMiddleware);
      app.use(simpleResponse);

      const res = await httpRequest.get(`http://localhost:${port}`);
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      assert.strictEqual(res, 'test');
    });

    it('should handle async middleware functions', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      app.use((ctx, next) =>
        context.with(trace.setSpan(context.active(), rootSpan), next)
      );
      app.use(asyncMiddleware);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}`);
          rootSpan.end();
          assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);

          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('asyncMiddleware'));
          assert.notStrictEqual(requestHandlerSpan, undefined);

          assert.strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.KOA_TYPE],
            KoaLayerType.MIDDLEWARE
          );
          const exportedRootSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'rootSpan');
          assert.notStrictEqual(exportedRootSpan, undefined);
        }
      );
    });

    it('should propagate exceptions in the middleware while marking the span with an exception', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      app.use((_ctx, next) =>
        context.with(trace.setSpan(context.active(), rootSpan), next)
      );
      app.use(failingMiddleware);
      const res = await httpRequest.get(`http://localhost:${port}`);
      assert.deepStrictEqual(res, 'Internal Server Error');

      rootSpan.end();
      assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);

      const requestHandlerSpan = memoryExporter
        .getFinishedSpans()
        .find(span => span.name.includes('failingMiddleware'));
      assert.notStrictEqual(requestHandlerSpan, undefined);

      assert.strictEqual(
        requestHandlerSpan?.attributes[AttributeNames.KOA_TYPE],
        KoaLayerType.MIDDLEWARE
      );
      const exportedRootSpan = memoryExporter
        .getFinishedSpans()
        .find(span => span.name === 'rootSpan');
      assert.ok(exportedRootSpan);
      const exceptionEvent = requestHandlerSpan.events.find(
        event => event.name === 'exception'
      );
      assert.ok(exceptionEvent, 'There should be an exception event recorded');
      assert.deepStrictEqual(exceptionEvent.name, 'exception');
      assert.deepStrictEqual(
        exceptionEvent.attributes![SemanticAttributes.EXCEPTION_MESSAGE],
        'I failed!'
      );
    });
  });

  describe('Disabling koa instrumentation', () => {
    it('should not create new spans', async () => {
      plugin.disable();
      const rootSpan = tracer.startSpan('rootSpan');
      app.use(customMiddleware);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}`);
          rootSpan.end();
          assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 1);
          assert.notStrictEqual(
            memoryExporter.getFinishedSpans()[0],
            undefined
          );
        }
      );
    });
  });
});
