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

import Instrumentation from '../src';
import { InstrumentationSpan } from '../src/internal-types';
const plugin = new Instrumentation();

import * as http from 'http';
import * as Router from 'router';
import * as assert from 'assert';
import { AddressInfo } from 'net';

const createServer = async ({
  parentSpan,
}: { parentSpan?: InstrumentationSpan } = {}) => {
  const router = new Router();

  router.use((req, res, next) => {
    // anonymous middleware
    next();
  });

  router.get('/err', (req, res, next) => {
    next(new Error('Oops'));
  });

  router.get('/deep/hello/someone', (req, res, next) => {
    next();
  });

  const helloRouter = new Router();

  const preName: Router.RequestHandler = (req, res, next) => {
    if (req.params?.name?.toLowerCase() === 'nobody') {
      return next();
    }
    res.end(`Hello, ${req.params?.name}!`);
  };
  helloRouter.get('/:name', preName);

  /* eslint-disable-next-line prefer-arrow-callback */
  helloRouter.get('/:name', function announceRude(req, res, next) {
    res.end('How rude!');
  });

  router.use('/hello', helloRouter);

  const deepRouter = new Router();

  deepRouter.use('/hello', helloRouter);
  router.use('/deep', deepRouter);

  const errHandler: Router.ErrorRequestHandler = (err, req, res, next) => {
    res.end(`Server error: ${err.message}!`);
  };

  /* eslint-disable-next-line prefer-arrow-callback */
  router.use(function postMiddleware(req, res, next) {
    next();
  });
  router.use(errHandler);

  const defaultHandler = (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) => {
    router(req, res, err => {
      if (err) {
        res.statusCode = 500;
        res.end(err.message);
      }
      if (!res.headersSent) {
        res.statusCode = 404;
        res.end('Not Found');
      }
      parentSpan?.end();
    });
  };
  const handler = parentSpan
    ? context.bind(trace.setSpan(context.active(), parentSpan), defaultHandler)
    : defaultHandler;
  const server = http.createServer(handler);

  await new Promise<void>(resolve => server.listen(0, resolve));

  return server;
};

const assertSpans = (actualSpans: any[], expectedSpans: any[]) => {
  assert(Array.isArray(actualSpans), 'Expected `actualSpans` to be an array');
  assert(
    Array.isArray(expectedSpans),
    'Expected `expectedSpans` to be an array'
  );
  assert.strictEqual(
    actualSpans.length,
    expectedSpans.length,
    'Expected span count different from actual'
  );
  actualSpans.forEach((span, idx) => {
    const expected = expectedSpans[idx];
    if (expected === null) return;
    try {
      assert.notStrictEqual(span, undefined);
      assert.notStrictEqual(expected, undefined);
      assert.strictEqual(span.attributes['router.name'], expected.name);
      assert.strictEqual(span.attributes['router.type'], expected.type);
      assert.strictEqual(typeof span.attributes['router.version'], 'string');
      assert.strictEqual(span.attributes['http.route'], expected.route);
    } catch (e) {
      e.message = `At span[${idx}]: ${e.message}`;
      throw e;
    }
  });
};

const ANONYMOUS = '<anonymous>';
const spans = {
  anonymousUse: { type: 'middleware', name: ANONYMOUS, route: '/' },
  preName: { type: 'request_handler', name: 'preName', route: '/hello/:name' },
  announceRude: {
    type: 'request_handler',
    name: 'announceRude',
    route: '/hello/:name',
  },
  postMiddleware: {
    type: 'middleware',
    name: 'postMiddleware',
    route: '/:name',
  },
};

describe('Router instrumentation', () => {
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  plugin.setTracerProvider(provider);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncHooksContextManager;
  let server: http.Server;

  const request = (path: string, serverOverwrite?: http.Server) => {
    const port = ((serverOverwrite ?? server).address() as AddressInfo).port;
    return new Promise((resolve, reject) => {
      return http.get(`http://localhost:${port}${path}`, resp => {
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
  };

  beforeEach(async () => {
    plugin.enable();
    // To force `require-in-the-middle` to definitely reload and patch the layer
    require('router/lib/layer.js');
    server = await createServer();
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    server.close();
    plugin.disable();
  });

  describe('Instrumenting handler calls', () => {
    it('should create a span for each handler', async () => {
      assert.strictEqual(await request('/hello/nobody'), 'How rude!');
      assertSpans(memoryExporter.getFinishedSpans(), [
        spans.anonymousUse,
        spans.preName,
        spans.announceRude,
      ]);
    });

    it('should gather full route for nested routers', async () => {
      assert.strictEqual(await request('/deep/hello/world'), 'Hello, world!');
      assertSpans(memoryExporter.getFinishedSpans(), [
        spans.anonymousUse,
        { ...spans.preName, route: '/deep/hello/:name' },
      ]);
    });

    it('should create spans for requests that did not result with response from the router', async () => {
      assert.strictEqual(await request('/not-found'), 'Not Found');
      assertSpans(memoryExporter.getFinishedSpans(), [
        spans.anonymousUse,
        { ...spans.postMiddleware, route: '/' },
      ]);
    });

    it('should create spans for errored routes', async () => {
      assert.strictEqual(await request('/err'), 'Server error: Oops!');
      assertSpans(memoryExporter.getFinishedSpans(), [
        spans.anonymousUse,
        { ...spans.preName, name: ANONYMOUS, route: '/err' },
        { ...spans.anonymousUse, name: 'errHandler', route: '/err' },
      ]);
    });

    it('should create spans under parent', async () => {
      const parentSpan: InstrumentationSpan = tracer.startSpan('HTTP GET');
      const testLocalServer = await createServer({ parentSpan });

      try {
        assert.strictEqual(
          await request('/deep/hello/someone', testLocalServer),
          'Hello, someone!'
        );
        assertSpans(memoryExporter.getFinishedSpans(), [
          spans.anonymousUse,
          { ...spans.preName, name: ANONYMOUS, route: '/deep/hello/someone' },
          { ...spans.preName, route: '/deep/hello/:name' },
        ]);

        memoryExporter.getFinishedSpans().forEach((span, idx) => {
          assert.strictEqual(
            span.parentSpanId,
            parentSpan.spanContext().spanId,
            `span[${idx}] has invalid parent`
          );
        });
        assert.strictEqual(parentSpan.name, 'GET /deep/hello/someone');
      } finally {
        testLocalServer.close();
      }
    });
  });

  describe('Disabling instrumentation', () => {
    it('should not create new spans', async () => {
      plugin.disable();
      await request('/hello/nobody');
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
    });
  });
});
