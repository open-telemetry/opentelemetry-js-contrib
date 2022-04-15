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

import { context, trace } from '@opentelemetry/api';
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
    it('should create a child span for middlewares', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      const customMiddleware: express.RequestHandler = (req, res, next) => {
        for (let i = 0; i < 1000000; i++) {
          continue;
        }
        return next();
      };
      let finishListenerCount: number | undefined;
      const { server, port } = await serverWithMiddleware(
        tracer,
        rootSpan,
        app => {
          app.use(express.json());
          app.use((req, res, next) => {
            res.on('finish', () => {
              finishListenerCount = res.listenerCount('finish');
            });
            next();
          });
          for (let index = 0; index < 15; index++) {
            app.use(customMiddleware);
          }
        }
      );
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
          const exportedRootSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name === 'GET /toto/:id');
          assert.notStrictEqual(exportedRootSpan, undefined);
        }
      );
      server.close();
    });

    it('supports sync middlewares directly responding', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let finishListenerCount: number | undefined;
      const { server, port } = await serverWithMiddleware(
        tracer,
        rootSpan,
        app => {
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
        }
      );
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
      server.close();
    });

    it('supports async middlewares', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let finishListenerCount: number | undefined;
      const { server, port } = await serverWithMiddleware(
        tracer,
        rootSpan,
        app => {
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
        }
      );
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
      server.close();
    });

    it('supports async middlewares directly responding', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let finishListenerCount: number | undefined;
      const { server, port } = await serverWithMiddleware(
        tracer,
        rootSpan,
        app => {
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
        }
      );
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
      server.close();
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
      const { server, port } = await createServer(app);
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      const res = await httpRequest.get(`http://localhost:${port}/toto/tata`);
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      assert.strictEqual(res, 'test');
      server.close();
    });
  });

  describe('Disabling plugin', () => {
    it('should not create new spans', async () => {
      instrumentation.disable();
      const rootSpan = tracer.startSpan('rootSpan');
      const { server, port } = await serverWithMiddleware(
        tracer,
        rootSpan,
        app => {
          app.use(express.json());
          const customMiddleware: express.RequestHandler = (req, res, next) => {
            for (let i = 0; i < 1000; i++) {
              continue;
            }
            return next();
          };
          app.use(customMiddleware);
        }
      );
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
      server.close();
    });
  });
});
