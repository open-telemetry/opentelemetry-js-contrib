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
import { SEMATTRS_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import * as assert from 'assert';
import { RPCMetadata, RPCType, setRPCMetadata } from '@opentelemetry/core';
import { ExpressLayerType } from '../src/enums/ExpressLayerType';
import { AttributeNames } from '../src/enums/AttributeNames';
import { ExpressInstrumentation, ExpressInstrumentationConfig } from '../src';
import { createServer, httpRequest } from './utils';

const instrumentation = new ExpressInstrumentation({
  ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
});
instrumentation.enable();
instrumentation.disable();

import * as express from 'express';
import * as http from 'http';

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

  describe('Instrumenting with specific config', () => {
    let app: express.Express;
    let server: http.Server;
    let port: number;

    beforeEach(async () => {
      app = express();
      const httpServer = await createServer(app);
      server = httpServer.server;
      port = httpServer.port;
    });

    afterEach(() => {
      server.close();
    });

    it('should ignore specific middlewares based on config', async () => {
      const rootSpan = tracer.startSpan('rootSpan');

      app.use(express.json());
      app.use((req, res, next) => {
        for (let i = 0; i < 1000; i++) {
          continue;
        }
        return next();
      });

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
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
        }
      );
    });

    it('should not repeat middleware paths in the span name', async () => {
      let rpcMetadata: RPCMetadata;
      app.use((req, res, next) => {
        rpcMetadata = { type: RPCType.HTTP, span: rootSpan };
        return context.with(
          setRPCMetadata(
            trace.setSpan(context.active(), rootSpan),
            rpcMetadata
          ),
          next
        );
      });

      app.use('/mw', (req, res, next) => {
        next();
      });

      app.get('/mw', (req, res) => {
        res.send('ok');
      });

      const rootSpan = tracer.startSpan('rootSpan');
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(`http://localhost:${port}/mw`);
          assert.strictEqual(response, 'ok');
          rootSpan.end();

          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('request handler'));
          assert.notStrictEqual(requestHandlerSpan, undefined);
          assert.strictEqual(
            requestHandlerSpan?.attributes[SEMATTRS_HTTP_ROUTE],
            '/mw'
          );

          assert.strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.EXPRESS_TYPE],
            'request_handler'
          );
          assert.strictEqual(rpcMetadata.route, '/mw');
        }
      );
    });

    it('should correctly name http root path when its /', async () => {
      instrumentation.setConfig({
        ignoreLayerTypes: [
          ExpressLayerType.MIDDLEWARE,
          ExpressLayerType.REQUEST_HANDLER,
        ],
      } as ExpressInstrumentationConfig);
      let rpcMetadata: RPCMetadata;
      app.use((req, res, next) => {
        rpcMetadata = { type: RPCType.HTTP, span: rootSpan };
        return context.with(
          setRPCMetadata(
            trace.setSpan(context.active(), rootSpan),
            rpcMetadata
          ),
          next
        );
      });

      app.get('/', (req, res) => {
        res.send('ok');
      });

      const rootSpan = tracer.startSpan('rootSpan');
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          const response = await httpRequest.get(`http://localhost:${port}/`);
          assert.strictEqual(response, 'ok');
          rootSpan.end();

          const requestHandlerSpan = memoryExporter
            .getFinishedSpans()
            .find(span => span.name.includes('request handler'));
          assert.notStrictEqual(requestHandlerSpan, undefined);
          assert.strictEqual(
            requestHandlerSpan?.attributes[SEMATTRS_HTTP_ROUTE],
            '/'
          );

          assert.strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.EXPRESS_TYPE],
            'request_handler'
          );
          assert.strictEqual(rpcMetadata?.route, '/');
        }
      );
    });
  });
});
