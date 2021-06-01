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

import { context, setSpan, Span } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import * as assert from 'assert';
import type * as http from 'http';
import { ExpressInstrumentation } from '../src';

const instrumentation = new ExpressInstrumentation();
instrumentation.enable();
instrumentation.disable();

import { createServer, httpRequest } from './utils';
import * as express from 'express';

describe('ExpressInstrumentation hooks', () => {
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

  describe('span name hooks', () => {
    let app: express.Express;
    let server: http.Server;
    let port: number;
    let rootSpan: Span;

    beforeEach(async () => {
      app = express();

      rootSpan = tracer.startSpan('rootSpan');
      app.use((req, res, next) => {
        context.with(setSpan(context.active(), rootSpan), next);
      });

      app.get('*', (req, res) => {
        res.send('ok');
      });

      const httpServer = await createServer(app);
      server = httpServer.server;
      port = httpServer.port;
    });

    afterEach(() => {
      server.close();
    });

    it('should rename parent span', async () => {
      instrumentation.setConfig({
        spanNameHook: (req, route, type, defaultName) => {
          if (type) {
            return defaultName;
          }

          if (route === '*') {
            return `hook - ${req.method} - ${req.url}`;
          }

          return defaultName;
        },
      });

      await context.with(setSpan(context.active(), rootSpan), async () => {
        await httpRequest.get(`http://localhost:${port}/foo/3`);
        rootSpan.end();

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 2);

        assert.notStrictEqual(
          spans.find(span => span.name === 'hook - GET - /foo/3'),
          undefined
        );

        assert.notStrictEqual(
          spans.find(span => span.name === 'request handler - *'),
          undefined
        );
      });
    });

    it('should use the default name when hook throws an error', async () => {
      instrumentation.setConfig({
        spanNameHook: () => {
          throw new Error();
        },
      });

      await context.with(setSpan(context.active(), rootSpan), async () => {
        await httpRequest.get(`http://localhost:${port}/foo/3`);
        rootSpan.end();

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 2);

        assert.notStrictEqual(
          spans.find(span => span.name === 'GET *'),
          undefined
        );

        assert.notStrictEqual(
          spans.find(span => span.name === 'request handler - *'),
          undefined
        );
      });
    });
  });
});
