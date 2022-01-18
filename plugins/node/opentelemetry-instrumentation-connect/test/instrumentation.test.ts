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
import * as assert from 'assert';

import { context, trace } from '@opentelemetry/api';
import { RPCType, setRPCMetadata } from '@opentelemetry/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { ANONYMOUS_NAME, ConnectInstrumentation } from '../src';

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

const instrumentation = new ConnectInstrumentation();
const contextManager = new AsyncHooksContextManager().enable();
const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const spanProcessor = new SimpleSpanProcessor(memoryExporter);
instrumentation.setTracerProvider(provider);
context.setGlobalContextManager(contextManager);

const tracer = provider.getTracer('default');

provider.addSpanProcessor(spanProcessor);
instrumentation.enable();

import * as connect from 'connect';

describe('connect', () => {
  let PORT: number;
  let app: connect.Server;
  let server: http.Server;

  beforeEach(async () => {
    instrumentation.enable();
    app = connect();
    await new Promise<void>(resolve => (server = app.listen(0, resolve)));
    PORT = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    app.removeAllListeners();
    await new Promise<void>(resolve =>
      server.close(() => {
        resolve();
      })
    );
    contextManager.disable();
    contextManager.enable();
    memoryExporter.reset();
    instrumentation.disable();
  });

  describe('when connect is disabled', () => {
    it('should not generate any spans', async () => {
      instrumentation.disable();
      app.use((req, res, next) => {
        next();
      });

      await httpRequest.get(`http://localhost:${PORT}/`);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);
    });
  });
  describe('when connect is enabled', () => {
    it('should generate span for anonymous middleware', async () => {
      app.use((req, res, next) => {
        next();
      });

      await httpRequest.get(`http://localhost:${PORT}/`);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];
      assert.deepStrictEqual(span.attributes, {
        'connect.type': 'middleware',
        'connect.name': ANONYMOUS_NAME,
        [SemanticAttributes.HTTP_ROUTE]: '/',
      });
      assert.strictEqual(span.name, 'middleware - anonymous');
    });

    it('should generate span for named middleware', async () => {
      // eslint-disable-next-line prefer-arrow-callback
      app.use(function middleware1(req, res, next) {
        next();
      });

      await httpRequest.get(`http://localhost:${PORT}/`);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];
      assert.deepStrictEqual(span.attributes, {
        'connect.type': 'middleware',
        'connect.name': 'middleware1',
        [SemanticAttributes.HTTP_ROUTE]: '/',
      });
      assert.strictEqual(span.name, 'middleware - middleware1');
    });

    it('should generate span for route', async () => {
      app.use('/foo', (req, res, next) => {
        next();
      });

      await httpRequest.get(`http://localhost:${PORT}/foo`);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      const span = spans[0];
      assert.deepStrictEqual(span.attributes, {
        'connect.type': 'request_handler',
        'connect.name': '/foo',
        [SemanticAttributes.HTTP_ROUTE]: '/foo',
      });
      assert.strictEqual(span.name, 'request handler - /foo');
    });

    it('should change name for parent http route', async () => {
      const rootSpan = tracer.startSpan('root span');
      app.use((req, res, next) => {
        const rpcMetadata = { type: RPCType.HTTP, span: rootSpan };
        return context.with(
          setRPCMetadata(
            trace.setSpan(context.active(), rootSpan),
            rpcMetadata
          ),
          next
        );
      });

      app.use('/foo', (req, res, next) => {
        next();
      });

      await httpRequest.get(`http://localhost:${PORT}/foo`);
      rootSpan.end();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 3);
      const changedRootSpan = spans[2];
      const span = spans[0];
      assert.strictEqual(changedRootSpan.name, 'GET /foo');
      assert.strictEqual(span.name, 'request handler - /foo');
      assert.strictEqual(
        span.parentSpanId,
        changedRootSpan.spanContext().spanId
      );
    });
  });
});
