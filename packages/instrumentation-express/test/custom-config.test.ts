/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
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
  const memoryExporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
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
      instrumentation.setConfig({ ignoreLayersType: [ExpressLayerType.MIDDLEWARE] });
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
      const rootSpan = tracer.startSpan('rootSpan');

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
            requestHandlerSpan?.attributes[ATTR_HTTP_ROUTE],
            '/mw'
          );

          assert.strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.EXPRESS_TYPE],
            'request_handler'
          );
          assert.strictEqual(rpcMetadata!.route, '/mw');
        }
      );
    });

    it('should correctly name http root path when its /', async () => {
      instrumentation.setConfig({
        ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
      } as ExpressInstrumentationConfig);
      memoryExporter.reset();
      let rpcMetadata: RPCMetadata;
      const rootSpan = tracer.startSpan('rootSpan');

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
            requestHandlerSpan?.attributes[ATTR_HTTP_ROUTE],
            '/'
          );

          assert.strictEqual(
            requestHandlerSpan?.attributes[AttributeNames.EXPRESS_TYPE],
            'request_handler'
          );
          assert.strictEqual(rpcMetadata!.route, '/');
        }
      );
    });

    // Regression test for https://github.com/open-telemetry/opentelemetry-js-contrib/issues/3570
    // A path-less middleware (router.use(fn)) must not pop an entry it never pushed onto the
    // layers store. Before the fix, the ignored-middleware branch unconditionally popped from
    // _LAYERS_STORE_PROPERTY even when isLayerPathStored was false, silently stripping the
    // mount path contributed by the enclosing router and causing http.route to be missing for
    // non-parameterized routes and prefix-stripped for parameterized routes.
    it('should preserve http.route when ignoreLayersType includes middleware and a path-less middleware is present', async () => {
      instrumentation.setConfig({
        ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
      });

      let rpcMetadata: RPCMetadata | undefined;
      const rootSpan = tracer.startSpan('rootSpan');

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

      const api = express.Router();
      // path-less middleware — this is the trigger for the bug
      api.use((req, res, next) => next());
      api.get('/leaf', (req, res) => res.send('ok'));
      api.get('/p/:id', (req, res) => res.send('ok'));

      app.use('/api', api);

      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/api/leaf`);
          await httpRequest.get(`http://localhost:${port}/api/p/123`);
          rootSpan.end();

          const spans = memoryExporter.getFinishedSpans();

          const leafSpan = spans.find(
            s =>
              s.attributes[AttributeNames.EXPRESS_TYPE] === 'request_handler' &&
              String(s.attributes[ATTR_HTTP_ROUTE]).endsWith('/leaf')
          );
          assert.notStrictEqual(
            leafSpan,
            undefined,
            'request handler span for /api/leaf not found'
          );
          assert.strictEqual(
            leafSpan?.attributes[ATTR_HTTP_ROUTE],
            '/api/leaf',
            'non-parameterized route should have full http.route including mount prefix'
          );

          const paramSpan = spans.find(
            s =>
              s.attributes[AttributeNames.EXPRESS_TYPE] === 'request_handler' &&
              String(s.attributes[ATTR_HTTP_ROUTE]).includes(':id')
          );
          assert.notStrictEqual(
            paramSpan,
            undefined,
            'request handler span for /api/p/:id not found'
          );
          assert.strictEqual(
            paramSpan?.attributes[ATTR_HTTP_ROUTE],
            '/api/p/:id',
            'parameterized route should have full http.route including mount prefix'
          );

          assert.strictEqual(rpcMetadata!.route, '/api/p/:id');
        }
      );
    });
  });
});