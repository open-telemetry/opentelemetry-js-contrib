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
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import type * as http from 'http';
import * as sinon from 'sinon';
import { ExpressInstrumentation } from '../src';
import { ExpressRequestInfo, SpanNameHook } from '../src/types';
import { ExpressLayerType } from '../src/enums/ExpressLayerType';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

const instrumentation = new ExpressInstrumentation();
instrumentation.enable();
instrumentation.disable();

import { httpRequest, serverWithMiddleware } from './utils';
import { RPCMetadata, getRPCMetadata } from '@opentelemetry/core';

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
    let server: http.Server;
    let port: number;
    let rootSpan: Span;
    let rpcMetadata: RPCMetadata | undefined;

    beforeEach(async () => {
      rootSpan = tracer.startSpan('rootSpan');

      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.get('*', (req, res) => {
          rpcMetadata = getRPCMetadata(context.active());
          res.send('ok');
        });
      });
      server = httpServer.server;
      port = httpServer.port;
    });

    afterEach(() => {
      server.close();
    });

    it('should rename spans', async () => {
      instrumentation.setConfig({
        spanNameHook: ({ route, layerType }) => {
          return `custom: ${layerType} - ${route}`;
        },
      });

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/foo/3`);
          rootSpan.end();

          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 2);

          assert.notStrictEqual(
            spans.find(span => span.name === 'custom: request_handler - *'),
            undefined
          );
        }
      );
    });

    it('should use the default name when hook throws an error', async () => {
      instrumentation.setConfig({
        spanNameHook: () => {
          throw new Error();
        },
      });

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/foo/3`);
          rootSpan.end();

          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 2);

          assert.strictEqual(rpcMetadata?.route, '*');
          assert.notStrictEqual(
            spans.find(span => span.name === 'request handler - *'),
            undefined
          );
        }
      );
    });

    it('should use the default name when returning undefined from hook', async () => {
      const spanNameHook: SpanNameHook = () => {
        return undefined as unknown as string;
      };
      instrumentation.setConfig({
        spanNameHook,
      });

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/foo/3`);
          rootSpan.end();

          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 2);

          assert.strictEqual(rpcMetadata?.route, '*');
          assert.notStrictEqual(
            spans.find(span => span.name === 'request handler - *'),
            undefined
          );
        }
      );
    });
  });

  describe('request hooks', () => {
    let server: http.Server;
    let port: number;
    let rootSpan: Span;

    beforeEach(async () => {
      rootSpan = tracer.startSpan('rootSpan');

      const httpServer = await serverWithMiddleware(tracer, rootSpan, app => {
        app.get('*', (req, res) => {
          res.send('ok');
        });
      });
      server = httpServer.server;
      port = httpServer.port;
    });

    afterEach(() => {
      server.close();
    });

    it('should call requestHook when set in config', async () => {
      const requestHook = sinon.spy((span: Span, info: ExpressRequestInfo) => {
        span.setAttribute(SemanticAttributes.HTTP_METHOD, info.request.method);

        if (info.layerType) {
          span.setAttribute('express.layer_type', info.layerType);
        }
      });

      instrumentation.setConfig({
        requestHook,
      });

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/foo/3`);
          rootSpan.end();

          const spans = memoryExporter.getFinishedSpans();
          const requestHandlerSpan = spans.find(
            span => span.name === 'request handler - *'
          );

          assert.strictEqual(spans.length, 2);
          sinon.assert.calledOnce(requestHook);
          assert.strictEqual(
            requestHandlerSpan?.attributes['http.method'],
            'GET'
          );
          assert.strictEqual(
            requestHandlerSpan?.attributes['express.layer_type'],
            ExpressLayerType.REQUEST_HANDLER
          );
        }
      );
    });

    it('should ignore requestHook which throws exception', async () => {
      const requestHook = sinon.spy((span: Span, info: ExpressRequestInfo) => {
        // This is added before the exception is thrown thus we can expect it
        span.setAttribute('http.method', info.request.method);
        throw Error('error thrown in requestHook');
      });

      instrumentation.setConfig({
        requestHook,
      });

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          await httpRequest.get(`http://localhost:${port}/foo/3`);
          rootSpan.end();

          const spans = memoryExporter.getFinishedSpans();
          const requestHandlerSpan = spans.find(
            span => span.name === 'request handler - *'
          );

          assert.strictEqual(spans.length, 2);
          assert.strictEqual(
            requestHandlerSpan?.attributes['http.method'],
            'GET'
          );

          sinon.assert.threw(requestHook);
        }
      );
    });
  });
});
