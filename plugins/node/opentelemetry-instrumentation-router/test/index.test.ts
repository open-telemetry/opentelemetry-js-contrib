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

import { context, setSpan } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';

import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE);

import Instrumentation from '../src';
const plugin = new Instrumentation();

import * as http from 'http';
import * as Router from 'router';
import * as assert from 'assert';
import { AddressInfo } from 'net';

const createServer = async () => {
  const router = new Router();

  router.use((req, res, next) => {
    next();
  });

  router.get('/err', (req, res, next) => {
    next(new Error('Oops'));
  });

  router.get('/', (req, res) => {
    res.end('Hello World!');
  });

  const helloRouter = new Router();

  helloRouter.get('/:name', (req, res, next) => {
    if (req.params?.name?.toLowerCase() === 'nobody') {
      return next();
    }
    res.end(`Hello, ${req.params?.name}!`);
  });

  helloRouter.get('/:name', (req, res, next) => {
    res.end('How rude!');
  });

  router.use('/hello', helloRouter);

  const deepRouter = new Router();

  deepRouter.use('/hello', helloRouter);
  router.use('/deep', deepRouter);

  const errHandler: Router.ErrorRequestHandler = (err, req, res, next) => {
    res.end('Server error!');
  };
  router.use(errHandler);

  const server = http.createServer((req, res) => {
    router(req, res, (err) => {
      if (!res.headersSent) {
        res.statusCode = 404;
        res.end('Not Found');
      }
    });
  });

  await new Promise<void>(resolve => server.listen(0, resolve));

  return server;
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

  const request = (path: string, options?: http.ClientRequestArgs | string) => {
    const port = (server.address() as AddressInfo).port;
    return new Promise((resolve, reject) => {
      return http.get(`http://localhost:${port}${path}`, (resp) => {
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

  before(async () => {
    server = await createServer();
    plugin.enable();
    // To force ritm to definitely reload and patch the layer
    require('router/lib/layer.js')
  });

  after(() => {
    plugin.disable();
  });

  beforeEach(async () => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    server.close();
  });

  describe('Instrumenting', () => {
    it('should work', async () => {
      const rootSpan = tracer.startSpan('clientSpan');

      await context.with(setSpan(context.active(), rootSpan), async () => {
        rootSpan.end();
        assert.strictEqual(await request('/'), 'Hello World!');
        assert.strictEqual(await request('/hello/you'), 'Hello, you!');
        assert.strictEqual(await request('/deep/hello/you'), 'Hello, you!');
        assert.strictEqual(await request('/deep/hello/nobody'), 'How rude!');
        assert.strictEqual(await request('/err'), 'Server error!');

        assert.strictEqual(memoryExporter.getFinishedSpans().length, 13);
      });
    });
  });

  describe('Disabling instrumentation', () => {
    it('should not create new spans', async () => {
      plugin.disable();
      const rootSpan = tracer.startSpan('rootSpan');

      await context.with(setSpan(context.active(), rootSpan), async () => {
        rootSpan.end();
        assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
        assert.notStrictEqual(memoryExporter.getFinishedSpans()[0], undefined);
      });
    });
  });
});
