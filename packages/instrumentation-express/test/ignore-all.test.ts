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

import { context, trace, Span } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { RPCMetadata, RPCType, setRPCMetadata } from '@opentelemetry/core';
import { AttributeNames } from '../src/enums/AttributeNames';
import { ExpressInstrumentation, ExpressLayerType } from '../src';
import { createServer, httpRequest } from './utils';

const instrumentation = new ExpressInstrumentation({
  ignoreLayersType: [
    ExpressLayerType.MIDDLEWARE,
    ExpressLayerType.ROUTER,
    ExpressLayerType.REQUEST_HANDLER,
  ],
});
instrumentation.enable();
instrumentation.disable();

import * as express from 'express';
import * as http from 'http';

describe('ExpressInstrumentation', () => {
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  const provider = new NodeTracerProvider({
    spanProcessors: [spanProcessor],
  });
  const tracer = provider.getTracer('default');
  const contextManager = new AsyncLocalStorageContextManager().enable();

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

  describe('when route exists', () => {
    let server: http.Server;
    let port: number;
    let rootSpan: Span;
    let rpcMetadata: RPCMetadata;

    beforeEach(async () => {
      rootSpan = tracer.startSpan('rootSpan');
      const app = express();

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

      const httpServer = await createServer(app);
      server = httpServer.server;
      port = httpServer.port;
    });

    afterEach(() => {
      server.close();
    });

    it('should ignore all ExpressLayerType based on config', async () => {
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
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
        }
      );
    });

    it('rpcMetadata.route still capture correct route', async () => {
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/toto/tata`);
          rootSpan.end();
          assert.strictEqual(rpcMetadata.route, '/toto/:id');
        }
      );
    });
  });
});
