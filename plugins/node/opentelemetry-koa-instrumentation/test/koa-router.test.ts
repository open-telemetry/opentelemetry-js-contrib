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
import * as koa from 'koa';
import * as KoaRouter from '@koa/router';
import * as http from 'http';
import { AddressInfo } from 'net';
import { plugin } from '../src';
import { AttributeNames, KoaLayerType, KoaComponentName } from '../src/types';

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

describe('Koa Instrumentation - Router Tests', () => {
  const logger = new NoopLogger();
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncHooksContextManager;

  before(() => {
    plugin.enable(koa, provider, logger);
  });

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
  });

  describe('Instrumenting @koa/router calls', () => {
    it('should create a child span for middlewares', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      const app = new koa();
      app.use((ctx, next) => tracer.withSpan(rootSpan, next));

      const router = new KoaRouter();
      router.get('/post/:id', ctx => {
        ctx.body = `Post id: ${ctx.params.id}`;
      });

      app.use(router.routes());

      const server = http.createServer(app.callback());
      await new Promise(resolve => server.listen(0, resolve));
      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await tracer.withSpan(rootSpan, async () => {
        await httpRequest.get(`http://localhost:${port}/post/0`);
        rootSpan.end();

        assert.deepStrictEqual(memoryExporter.getFinishedSpans().length, 2);
        const requestHandlerSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name.includes('router - /post/:id'));
        assert.notStrictEqual(requestHandlerSpan, undefined);
        assert.strictEqual(
          requestHandlerSpan?.attributes[AttributeNames.COMPONENT],
          KoaComponentName
        );

        assert.strictEqual(
          requestHandlerSpan?.attributes[AttributeNames.KOA_TYPE],
          KoaLayerType.ROUTER
        );

        assert.strictEqual(
          requestHandlerSpan?.attributes[AttributeNames.HTTP_ROUTE],
          '/post/:id'
        );

        const exportedRootSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'rootSpan');
        assert.notStrictEqual(exportedRootSpan, undefined);
      });
      server.close();
    });
  });
});
