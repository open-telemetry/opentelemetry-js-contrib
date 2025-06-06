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

import {
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

import { UndiciInstrumentation } from '../src/undici';

import { MockPropagation } from './utils/mock-propagation';
import { MockServer } from './utils/mock-server';
import { assertSpan } from './utils/assertSpan';

describe('UndiciInstrumentation `fetch` tests', function () {
  let instrumentation: UndiciInstrumentation;

  const protocol = 'http';
  const hostname = 'localhost';
  const mockServer = new MockServer();
  const memoryExporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });

  before(function (done) {
    // Do not test if the `fetch` global API is not available
    // This applies to nodejs < v18 or nodejs < v16.15 wihtout the flag
    // `--experimental-global-fetch` set
    // https://nodejs.org/api/globals.html#fetch
    if (typeof globalThis.fetch !== 'function') {
      this.skip();
    }

    instrumentation = new UndiciInstrumentation();
    instrumentation.setTracerProvider(provider);

    propagation.setGlobalPropagator(new MockPropagation());
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable()
    );
    mockServer.start(done);
    mockServer.mockListener((req, res) => {
      // There are some situations where there is no way to access headers
      // for trace propagation asserts like:
      // const resp = await fetch('http://host:port')
      // so we need to do the assertion here
      try {
        assert.ok(
          req.headers[MockPropagation.TRACE_CONTEXT_KEY],
          `trace propagation for ${MockPropagation.TRACE_CONTEXT_KEY} works`
        );
        assert.ok(
          req.headers[MockPropagation.SPAN_CONTEXT_KEY],
          `trace propagation for ${MockPropagation.SPAN_CONTEXT_KEY} works`
        );
      } catch (assertErr) {
        // The exception will hang the server and the test so we set a header
        // back to the test to make an assertion
        res.setHeader('propagation-error', (assertErr as Error).message);
      }

      // Retur a valid response always
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.setHeader('foo-server', 'bar');
      res.write(JSON.stringify({ success: true }));
      res.end();
    });
  });

  after(function (done) {
    context.disable();
    propagation.disable();
    mockServer.mockListener(undefined);
    mockServer.stop(done);
  });

  beforeEach(function () {
    memoryExporter.reset();
  });

  describe('disable()', function () {
    it('should not create spans when disabled', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Disable
      instrumentation.disable();

      const fetchUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const response = await fetch(fetchUrl);
      assert.ok(
        response.headers.get('propagation-error') != null,
        'propagation is not set if instrumentation disabled'
      );

      spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0, 'no spans are created');
    });
  });

  describe('enable()', function () {
    beforeEach(function () {
      instrumentation.enable();
    });
    afterEach(function () {
      // Empty configuration & disable
      instrumentation.setConfig({});
      instrumentation.disable();
    });

    it('should create valid spans even if the configuration hooks fail', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Set the bad configuration
      instrumentation.setConfig({
        ignoreRequestHook: () => {
          throw new Error('ignoreRequestHook error');
        },
        requestHook: () => {
          throw new Error('requestHook error');
        },
        responseHook: () => {
          throw new Error('responseHook error');
        },
        startSpanHook: () => {
          throw new Error('startSpanHook error');
        },
      });

      const fetchUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const response = await fetch(fetchUrl);
      assert.ok(
        response.headers.get('propagation-error') == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];

      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'localhost',
        httpStatusCode: response.status,
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        resHeaders: response.headers,
      });
    });

    it('should create valid spans with empty configuration', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      const fetchUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const response = await fetch(fetchUrl);
      assert.ok(
        response.headers.get('propagation-error') == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];

      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'localhost',
        httpStatusCode: response.status,
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        resHeaders: response.headers,
      });
    });

    it('should create valid spans with the given configuration', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Set configuration
      instrumentation.setConfig({
        ignoreRequestHook: req => {
          return req.path.indexOf('/ignore/path') !== -1;
        },
        requestHook: (span, req) => {
          // We should mind the type of headers
          if (typeof req.headers === 'string') {
            req.headers += 'x-requested-with: undici\r\n';
          } else {
            req.headers.push('x-requested-with', 'undici');
          }
        },
        responseHook: (span, { response }) => {
          span.setAttribute(
            'test.response-hook.attribute',
            response.statusText
          );
        },
        startSpanHook: request => {
          return {
            'test.hook.attribute': 'hook-value',
          };
        },
        headersToSpanAttributes: {
          requestHeaders: ['foo-client', 'x-requested-with'],
          responseHeaders: ['foo-server'],
        },
      });

      // Do some requests
      const ignoreResponse = await fetch(
        `${protocol}://${hostname}:${mockServer.port}/ignore/path`
      );
      const reqInit = {
        headers: new Headers({
          'user-agent': 'custom',
          'foo-client': 'bar',
        }),
      };
      assert.ok(
        ignoreResponse.headers.get('propagation-error'),
        'propagation is not set for ignored requests'
      );

      const queryResponse = await fetch(
        `${protocol}://${hostname}:${mockServer.port}/?query=test`,
        reqInit
      );
      assert.ok(
        queryResponse.headers.get('propagation-error') == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];
      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'localhost',
        httpStatusCode: queryResponse.status,
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        reqHeaders: reqInit.headers,
        resHeaders: queryResponse.headers,
      });
      assert.strictEqual(
        span.attributes['http.request.header.foo-client'],
        'bar',
        'request headers from fetch options are captured'
      );
      assert.strictEqual(
        span.attributes['http.request.header.x-requested-with'],
        'undici',
        'request headers from requestHook are captured'
      );
      assert.strictEqual(
        span.attributes['http.response.header.foo-server'],
        'bar',
        'response headers from the server are captured'
      );
      assert.strictEqual(
        span.attributes['test.hook.attribute'],
        'hook-value',
        'startSpanHook is called'
      );
      assert.strictEqual(
        span.attributes['test.response-hook.attribute'],
        'OK',
        'responseHook is called'
      );
    });

    it('should not create spans without parent if required in configuration', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      instrumentation.setConfig({
        requireParentforSpans: true,
      });

      const fetchUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const response = await fetch(fetchUrl);
      assert.ok(
        response.headers.get('propagation-error') == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0, 'no spans are created');
    });

    it('should not create spans with parent if required in configuration', function (done) {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      instrumentation.setConfig({
        requireParentforSpans: true,
      });

      const tracer = provider.getTracer('default');
      const span = tracer.startSpan('parentSpan', {
        kind: SpanKind.INTERNAL,
      });

      context.with(trace.setSpan(context.active(), span), async () => {
        const fetchUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
        const response = await fetch(fetchUrl);

        span.end();
        assert.ok(
          response.headers.get('propagation-error') == null,
          'propagation is set for instrumented requests'
        );

        spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 2, 'child span is created');
        assert.strictEqual(
          spans.filter(span => span.kind === SpanKind.CLIENT).length,
          1,
          'child span is created'
        );
        assert.strictEqual(
          spans.filter(span => span.kind === SpanKind.INTERNAL).length,
          1,
          'parent span is present'
        );

        done();
      });
    });

    it('should capture errors using fetch API', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      let fetchError;
      try {
        const fetchUrl = 'http://unexistent-host-name/path';
        await fetch(fetchUrl);
      } catch (err) {
        // Expected error
        fetchError = err as Error;
      }

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];
      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'unexistent-host-name',
        httpMethod: 'GET',
        path: '/path',
        error: fetchError,
        noNetPeer: true, // do not check network attribs
        forceStatus: {
          code: SpanStatusCode.ERROR,
          message: 'getaddrinfo ENOTFOUND unexistent-host-name',
        },
      });
    });

    it('should capture error if fetch request is aborted', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      let fetchError;
      const controller = new AbortController();
      const fetchUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const fetchPromise = fetch(fetchUrl, { signal: controller.signal });
      controller.abort();
      try {
        await fetchPromise;
      } catch (err) {
        // Expected error
        fetchError = err as Error;
      }

      // Let the error be published to diagnostics channel
      await new Promise(r => setTimeout(r, 5));

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];
      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'localhost',
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        error: fetchError,
        noNetPeer: true, // do not check network attribs
        forceStatus: {
          code: SpanStatusCode.ERROR,
          message: 'The operation was aborted.',
        },
      });
    });
  });
});
