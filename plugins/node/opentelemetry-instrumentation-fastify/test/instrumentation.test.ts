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
import { context } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { NodeTracerProvider } from '@opentelemetry/node';
import {
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import { HookHandlerDoneFunction } from 'fastify/types/hooks';
import { FastifyReply } from 'fastify/types/reply';
import { FastifyRequest } from 'fastify/types/request';
import * as http from 'http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ANONYMOUS_NAME } from '../src/instrumentation';
import { FastifyInstrumentation } from '../src';

const URL = require('url').URL;

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

const httpInstrumentation = new HttpInstrumentation();
const instrumentation = new FastifyInstrumentation();
const contextManager = new AsyncHooksContextManager().enable();
const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const spanProcessor = new SimpleSpanProcessor(memoryExporter);
instrumentation.setTracerProvider(provider);
httpInstrumentation.setTracerProvider(provider);
context.setGlobalContextManager(contextManager);

provider.addSpanProcessor(spanProcessor);
instrumentation.enable();
httpInstrumentation.enable();

import 'fastify-express';
import { FastifyInstance } from 'fastify/types/instance';

const Fastify = require('fastify');

function getSpans(): ReadableSpan[] {
  const spans = memoryExporter.getFinishedSpans().filter(s => {
    return (
      s.instrumentationLibrary.name === '@opentelemetry/instrumentation-fastify'
    );
  });
  return spans;
}

describe('fastify', () => {
  let PORT: number;
  let app: FastifyInstance;

  function startServer(): Promise<void> {
    return new Promise<void>(resolve =>
      app.listen(0, (err, address) => {
        const url = new URL(address);
        PORT = parseInt(url.port, 10);
        resolve();
      })
    );
  }

  beforeEach(async () => {
    instrumentation.enable();
    app = Fastify();
    app.register(require('fastify-express'));
  });

  afterEach(async () => {
    await new Promise<void>(resolve =>
      app.close(() => {
        resolve();
      })
    );

    contextManager.disable();
    contextManager.enable();
    memoryExporter.reset();
    instrumentation.disable();
  });

  describe('when fastify is disabled', () => {
    it('should not generate any spans', async () => {
      instrumentation.disable();
      app.get('/test', (req, res) => {
        res.send('OK');
      });
      await startServer();

      await httpRequest.get(`http://localhost:${PORT}/test`);

      const spans = getSpans();
      assert.strictEqual(spans.length, 0); // http instrumentation only
    });
  });

  describe('when fastify is enabled', () => {
    it('should generate span for anonymous middleware', async () => {
      app.get('/test', (req, res) => {
        res.send('OK');
      });

      await startServer();

      await httpRequest.get(`http://localhost:${PORT}/test`);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 5);
      const span = spans[1];
      assert.deepStrictEqual(span.attributes, {
        'fastify.type': 'request_handler',
        'plugin.name': 'fastify-express',
        [SemanticAttributes.HTTP_ROUTE]: '/test',
      });
      assert.strictEqual(span.name, `request handler - ${ANONYMOUS_NAME}`);
      const baseSpan = spans[0];
      assert.strictEqual(span.parentSpanId, baseSpan.spanContext().spanId);
    });

    it('should generate span for named handler', async () => {
      // eslint-disable-next-line prefer-arrow-callback
      app.get('/test', function namedHandler(req, res) {
        res.send('OK');
      });

      await startServer();

      await httpRequest.get(`http://localhost:${PORT}/test`);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 5);
      const span = spans[1];
      assert.deepStrictEqual(span.attributes, {
        'fastify.type': 'request_handler',
        'fastify.name': 'namedHandler',
        'plugin.name': 'fastify-express',
        [SemanticAttributes.HTTP_ROUTE]: '/test',
      });
      assert.strictEqual(span.name, 'request handler - namedHandler');

      const baseSpan = spans[0];
      assert.strictEqual(span.parentSpanId, baseSpan.spanContext().spanId);
    });

    describe('when subsystem is registered', () => {
      beforeEach(async () => {
        httpInstrumentation.enable();

        async function subsystem(fastify: FastifyInstance) {
          fastify.addHook(
            'onRequest',
            async (
              req: FastifyRequest,
              res: FastifyReply,
              next: HookHandlerDoneFunction
            ) => {
              next();
            }
          );
          fastify.use((req, res, next) => {
            next();
          });
          // eslint-disable-next-line prefer-arrow-callback
          fastify.get('/test', function foo(req, res) {
            res.send('OK');
          });
        }

        app.register(subsystem);

        await startServer();

        await httpRequest.get(`http://localhost:${PORT}/test`);
        assert.strictEqual(getSpans().length, 4);
      });

      it('should change name for parent http route', async () => {
        const spans = memoryExporter.getFinishedSpans();

        assert.strictEqual(spans.length, 6);
        const changedRootSpan = spans[2];
        const span = spans[3];
        assert.strictEqual(changedRootSpan.name, 'GET /test');
        assert.strictEqual(span.name, 'request handler - foo');
        assert.strictEqual(
          span.parentSpanId,
          changedRootSpan.spanContext().spanId
        );
      });

      it('should create span for fastify express runConnect', async () => {
        const spans = memoryExporter.getFinishedSpans();

        assert.strictEqual(spans.length, 6);
        const baseSpan = spans[2];
        const span = spans[0];
        assert.strictEqual(span.name, 'middleware - runConnect');
        assert.deepStrictEqual(span.attributes, {
          'fastify.type': 'middleware',
          'plugin.name': 'fastify-express',
          'hook.name': 'onRequest',
        });

        assert.strictEqual(span.parentSpanId, baseSpan.spanContext().spanId);
      });

      it('should create span for fastify express for enhanceRequest', async () => {
        const spans = memoryExporter.getFinishedSpans();

        assert.strictEqual(spans.length, 6);
        const baseSpan = spans[2];
        const span = spans[1];
        assert.strictEqual(span.name, 'middleware - enhanceRequest');
        assert.deepStrictEqual(span.attributes, {
          'fastify.type': 'middleware',
          'plugin.name': 'fastify-express',
          'hook.name': 'onRequest',
        });

        assert.strictEqual(span.parentSpanId, baseSpan.spanContext().spanId);
      });

      it('should create span for request', async () => {
        const spans = memoryExporter.getFinishedSpans();

        assert.strictEqual(spans.length, 6);
        const baseSpan = spans[2];
        const span = spans[3];
        assert.strictEqual(span.name, 'request handler - foo');
        assert.deepStrictEqual(span.attributes, {
          'plugin.name': 'subsystem',
          'fastify.type': 'request_handler',
          'fastify.name': 'foo',
          'http.route': '/test',
        });

        assert.strictEqual(span.parentSpanId, baseSpan.spanContext().spanId);
      });

      it('should create span for subsystem anonymous middleware', async () => {
        const spans = memoryExporter.getFinishedSpans();

        assert.strictEqual(spans.length, 6);
        const baseSpan = spans[2];
        const span = spans[4];
        assert.strictEqual(span.name, `middleware - ${ANONYMOUS_NAME}`);
        assert.deepStrictEqual(span.attributes, {
          'fastify.type': 'middleware',
          'plugin.name': 'subsystem',
          'hook.name': 'onRequest',
        });

        assert.strictEqual(span.parentSpanId, baseSpan.spanContext().spanId);
      });
    });
  });
});
