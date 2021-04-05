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

import * as restify from 'restify';
import { context, setSpan } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
// import {
//   ExceptionAttribute,
//   ExceptionEventName,
//   HttpAttribute,
// } from '@opentelemetry/semantic-conventions';

import { RestifyInstrumentation } from '../src';
const plugin = new RestifyInstrumentation();

import { strict as assert } from 'assert';
import * as http from 'http';
import { AddressInfo } from 'net';

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

const createServer = async (setupRoutes?: Function) => {
  const server = restify.createServer();

  if (typeof setupRoutes === 'function') {
    setupRoutes(server);
  } else {
    server.get('/route/:param', (req, res, next) => {
      res.send({ route: req?.params?.param });
    });

    server.get('/failing', (req, res, next) => {
      throw new Error('NOK');
    });
  }

  await new Promise<void>(resolve => server.listen(0, resolve));
  return server;
};

describe('Restify Instrumentation', () => {
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  plugin.setTracerProvider(provider);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncHooksContextManager;
  let server: restify.Server;
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

    server = await createServer();
    port = (server.address() as AddressInfo).port;
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    server.close();
  });

  describe('Instrumenting core middleware calls', () => {
    it('should add restify attributes to the parent span', async () => {
      const rootSpan = tracer.startSpan('rootSpan');

      server.pre((req: any, res: any, next: any) => {
        context.with(setSpan(context.active(), rootSpan), next);
      });

      await context.with(setSpan(context.active(), rootSpan), async () => {
        await httpRequest.get(`http://localhost:${port}/route/foo`);
        rootSpan.end();
        assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 1);
        const span = memoryExporter
          .getFinishedSpans()[0];

        assert.notEqual(span, undefined);
        assert.equal(span.attributes['http.route'], '/route/:param');
        assert.equal(span.attributes['restify.version'], 'n/a');
      });
    });

    it('should lack `http.route` but still have `restify.version` if route was 404', async () => {
      const rootSpan = tracer.startSpan('rootSpan');

      const server = await createServer((server: restify.Server) => {
        server.pre((req: any, res: any, next: any) => {
          context.with(setSpan(context.active(), rootSpan), next);
        });
      });
      port = (server.address() as AddressInfo).port;

      await context.with(setSpan(context.active(), rootSpan), async () => {
        const res = await httpRequest.get(`http://localhost:${port}/route/foo`);
        rootSpan.end();
        assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 1);
        const span = memoryExporter
          .getFinishedSpans()[0];

        assert.notEqual(span, undefined);
        assert.equal(span.attributes['http.route'], undefined);
        assert.equal(span.attributes['restify.version'], 'n/a');
        assert.strictEqual(res, '{"code":"ResourceNotFound","message":"/route/foo does not exist"}');
      });
    });

    it('should not create span if there is no parent span', async () => {
      const res = await httpRequest.get(`http://localhost:${port}/route/bar`);
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      assert.strictEqual(res, '{"route":"bar"}');
    });
  });

  describe('Disabling restify instrumentation', () => {
    it('should not create new spans', async () => {
      plugin.disable();
      const rootSpan = tracer.startSpan('rootSpan');

      await context.with(setSpan(context.active(), rootSpan), async () => {
        assert.strictEqual(await httpRequest.get(`http://localhost:${port}/route/foo`), '{"route":"foo"}');
        rootSpan.end();
        assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 1);
        assert.notStrictEqual(memoryExporter.getFinishedSpans()[0], undefined);
      });
    });
  });
});
