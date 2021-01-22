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

import { context, setSpan, NoopLogger, Span, Tracer } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import * as assert from 'assert';
import * as express from 'express';
import * as http from 'http';
import { AddressInfo } from 'net';
import { plugin } from '../src';
import {
  AttributeNames,
  ExpressLayerType,
  ExpressPluginConfig,
  ExpressPluginSpan,
} from '../src/types';

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

const serverWithMiddleware = async (
  tracer: Tracer,
  rootSpan: Span,
  addMiddlewares: (app: express.Express) => void
): Promise<http.Server> => {
  const app = express();
  if (tracer) {
    app.use((req, res, next) =>
      context.with(setSpan(context.active(), rootSpan), next)
    );
  }

  app.use(express.json());

  addMiddlewares(app);

  const router = express.Router();
  app.use('/toto', router);
  router.get('/:id', (req, res) => {
    setImmediate(() => {
      res.status(200).end(req.params.id);
    });
  });
  const server = http.createServer(app);
  await new Promise<void>(resolve =>
    server.listen(0, () => {
      resolve();
    })
  );

  return server;
};

describe('Express Plugin', () => {
  const logger = new NoopLogger();
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncHooksContextManager;

  before(() => {
    plugin.enable(express, provider, logger);
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  describe('Instrumenting normal get operations', () => {
    it('should create a child span for middlewares', async () => {
      const rootSpan = tracer.startSpan('rootSpan') as ExpressPluginSpan;
      const app = express();
      app.use((req, res, next) =>
        context.with(setSpan(context.active(), rootSpan), next)
      );
      app.use(express.json());
      const customMiddleware: express.RequestHandler = (req, res, next) => {
        for (let i = 0; i < 1000000; i++) {
          continue;
        }
        return next();
      };
      app.use(customMiddleware);
      const router = express.Router();
      app.use('/toto', router);
      let finishListenerCount: number | undefined;
      const server = await serverWithMiddleware(tracer, rootSpan, app => {
        app.use((req, res, next) => {
          res.on('finish', () => {
            finishListenerCount = res.listenerCount('finish');
          });
          next();
        });
        for (let index = 0; index < 15; index++) {
          app.use(customMiddleware);
        }
      });
      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(setSpan(context.active(), rootSpan), async () => {
        const response = await httpRequest.get(
          `http://localhost:${port}/toto/tata`
        );
        assert.strictEqual(response, 'tata');
        rootSpan.end();
        assert.strictEqual(rootSpan.name, 'GET /toto/:id');
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
          requestHandlerSpan?.attributes[AttributeNames.COMPONENT],
          'express'
        );
        assert.strictEqual(
          requestHandlerSpan?.attributes[AttributeNames.HTTP_ROUTE],
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
      });
      server.close();
    });

    it('supports sync middlewares directly responding', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let finishListenerCount: number | undefined;
      const server = await serverWithMiddleware(tracer, rootSpan, app => {
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
      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(setSpan(context.active(), rootSpan), async () => {
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
      });
      server.close();
    });

    it('supports async middlewares', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let finishListenerCount: number | undefined;
      const server = await serverWithMiddleware(tracer, rootSpan, app => {
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
      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(setSpan(context.active(), rootSpan), async () => {
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
      });
      server.close();
    });

    it('supports async middlewares directly responding', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      let finishListenerCount: number | undefined;
      const server = await serverWithMiddleware(tracer, rootSpan, app => {
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
      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(setSpan(context.active(), rootSpan), async () => {
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
      });
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
      const server = http.createServer(app);
      await new Promise(resolve => server.listen(0, resolve));
      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      const res = await httpRequest.get(`http://localhost:${port}/toto/tata`);
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      assert.strictEqual(res, 'test');
      server.close();
    });
  });

  describe('Instrumenting with specific config', () => {
    it('should ignore specific middlewares based on config', async () => {
      plugin.disable();
      const config: ExpressPluginConfig = {
        ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
      };
      plugin.enable(express, provider, logger, config);
      const rootSpan = tracer.startSpan('rootSpan');
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        for (let i = 0; i < 1000; i++) {
          continue;
        }
        return next();
      });
      const server = http.createServer(app);
      await new Promise(resolve => server.listen(0, resolve));

      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(setSpan(context.active(), rootSpan), async () => {
        await httpRequest.get(`http://localhost:${port}/toto/tata`);
        rootSpan.end();
        assert.deepEqual(
          memoryExporter
            .getFinishedSpans()
            .filter(
              span =>
                span.attributes[AttributeNames.EXPRESS_TYPE] ===
                ExpressLayerType.MIDDLEWARE
            ).length,
          0
        );
        const exportedRootSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'rootSpan');
        assert.notStrictEqual(exportedRootSpan, undefined);
      });
      server.close();
    });
  });

  describe('when route exists', () => {
    let server: http.Server;
    let rootSpan: ExpressPluginSpan;
    const config: ExpressPluginConfig = {
      ignoreLayersType: [
        ExpressLayerType.MIDDLEWARE,
        ExpressLayerType.ROUTER,
        ExpressLayerType.REQUEST_HANDLER,
      ],
    };

    beforeEach(async () => {
      plugin.disable();
      plugin.enable(express, provider, logger, config);
      rootSpan = tracer.startSpan('rootSpan') as ExpressPluginSpan;
      const app = express();
      app.use((req, res, next) =>
        context.with(setSpan(context.active(), rootSpan), next)
      );
      app.use(express.json());
      app.use((req, res, next) => {
        for (let i = 0; i < 1000; i++) {}
        return next();
      });
      const router = express.Router();
      app.use('/toto', router);
      router.get('/:id', (req, res) => {
        setImmediate(() => {
          res.status(200).end();
        });
      });

      server = http.createServer(app);
      await new Promise(resolve => server.listen(0, resolve));
    });

    afterEach(() => {
      server.close();
    });

    it('should ignore all ExpressLayerType based on config', async () => {
      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(setSpan(context.active(), rootSpan), async () => {
        await httpRequest.get(`http://localhost:${port}/toto/tata`);
        rootSpan.end();
        assert.deepStrictEqual(
          memoryExporter
            .getFinishedSpans()
            .filter(
              span =>
                span.attributes[AttributeNames.EXPRESS_TYPE] ===
                  ExpressLayerType.MIDDLEWARE ||
                span.attributes[AttributeNames.EXPRESS_TYPE] ===
                  ExpressLayerType.ROUTER ||
                span.attributes[AttributeNames.EXPRESS_TYPE] ===
                  ExpressLayerType.REQUEST_HANDLER
            ).length,
          0
        );
      });
    });

    it('root span name should be modified to GET /todo/:id', async () => {
      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(setSpan(context.active(), rootSpan), async () => {
        await httpRequest.get(`http://localhost:${port}/toto/tata`);
        rootSpan.end();
        assert.strictEqual(rootSpan.name, 'GET /toto/:id');
        const exportedRootSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'GET /toto/:id');
        assert.notStrictEqual(exportedRootSpan, undefined);
      });
    });
  });

  describe('Disabling plugin', () => {
    it('should not create new spans', async () => {
      plugin.disable();
      const rootSpan = tracer.startSpan('rootSpan');
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        for (let i = 0; i < 1000; i++) {
          continue;
        }
        return next();
      });
      const server = http.createServer(app);
      await new Promise(resolve => server.listen(0, resolve));
      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(setSpan(context.active(), rootSpan), async () => {
        await httpRequest.get(`http://localhost:${port}/toto/tata`);
        rootSpan.end();
        assert.deepEqual(memoryExporter.getFinishedSpans().length, 1);
        assert.notStrictEqual(memoryExporter.getFinishedSpans()[0], undefined);
      });
      server.close();
    });
  });
});
