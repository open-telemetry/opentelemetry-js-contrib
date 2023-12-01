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
import { AttributeNames } from '../src/enums/AttributeNames';
import { ExpressInstrumentation } from '../src';
import { createServer, httpRequest, serverWithMiddleware } from './utils';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

const instrumentation = new ExpressInstrumentation();
instrumentation.enable();
instrumentation.disable();

import * as express from 'express';
import { RPCMetadata, getRPCMetadata } from '@opentelemetry/core';
import { Server } from 'http';

describe('ExpressInstrumentation', () => {
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
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
          assert.strictEqual(finishListenerCount, 2);
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
            requestHandlerSpan?.attributes[SemanticAttributes.HTTP_ROUTE],
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
          assert.strictEqual(finishListenerCount, 2);
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
});
