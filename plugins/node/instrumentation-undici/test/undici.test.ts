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
import { Writable } from 'stream';

import {
  INVALID_SPAN_CONTEXT,
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
} from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

import { UndiciInstrumentation } from '../src/undici';

import { MockPropagation } from './utils/mock-propagation';
import { MockServer } from './utils/mock-server';
import { assertSpan } from './utils/assertSpan';

import type { fetch, stream, request, Client, Dispatcher } from 'undici';

const instrumentation = new UndiciInstrumentation();
instrumentation.enable();
instrumentation.disable();

// Reference to the `undici` module
let undici: {
  fetch: typeof fetch;
  request: typeof request;
  stream: typeof stream;
  Client: typeof Client;
};

const protocol = 'http';
const hostname = 'localhost';
const mockServer = new MockServer();
const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
instrumentation.setTracerProvider(provider);

// Undici docs (https://github.com/nodejs/undici#garbage-collection) suggest
// that an undici response body should always be consumed.
async function consumeResponseBody(body: Dispatcher.ResponseData['body']) {
  return new Promise(resolve => {
    const devNull = new Writable({
      write(_chunk, _encoding, cb) {
        setImmediate(cb);
      },
    });
    body.pipe(devNull);
    body.on('end', resolve);
  });
}

describe('UndiciInstrumentation `undici` tests', function () {
  before(function (done) {
    // Load `undici`. It may fail if nodejs version is <18 because the module uses
    // features only available from that version. In that case skip the test.
    try {
      undici = require('undici');
    } catch (loadErr) {
      this.skip();
    }

    propagation.setGlobalPropagator(new MockPropagation());
    context.setGlobalContextManager(new AsyncHooksContextManager().enable());
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

    // Close kept-alive sockets. This can save a 4s keep-alive delay before the
    // process exits.
    (undici as any).getGlobalDispatcher().close();
  });

  beforeEach(function () {
    memoryExporter.reset();
  });

  describe('disable()', function () {
    it('should not create spans when disabled', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Disable via config
      instrumentation.setConfig({ enabled: false });

      const requestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const { headers, body } = await undici.request(requestUrl);
      await consumeResponseBody(body);

      assert.ok(
        headers['propagation-error'] != null,
        'propagation is not set if instrumentation disabled'
      );

      spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0, 'no spans are created');
    });
  });

  describe('enable()', function () {
    beforeEach(function () {
      instrumentation.enable();
      // Set configuration
      instrumentation.setConfig({
        enabled: true,
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
    });
    afterEach(function () {
      // Empty configuration & disable
      instrumentation.setConfig({ enabled: false });
    });

    it('should ignore requests based on the result of ignoreRequestHook', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Do some requests
      const headers = {
        'user-agent': 'custom',
        'foo-client': 'bar',
      };

      const ignoreRequestUrl = `${protocol}://${hostname}:${mockServer.port}/ignore/path`;
      const ignoreResponse = await undici.request(ignoreRequestUrl, {
        headers,
      });
      await consumeResponseBody(ignoreResponse.body);

      assert.ok(
        ignoreResponse.headers['propagation-error'],
        'propagation is not set for ignored requests'
      );

      spans = memoryExporter.getFinishedSpans();
      assert.ok(spans.length === 0, 'ignoreRequestHook is filtering requests');
    });

    it('should create valid spans for different request methods', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Do some requests
      const headers = {
        'user-agent': 'custom',
        'foo-client': 'bar',
      };

      const queryRequestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      let firstQueryResponse;
      try {
        firstQueryResponse = await undici.request(queryRequestUrl, {
          headers,
          // @ts-expect-error - method type expects in uppercase
          method: 'get',
        });
      } catch (err: any) {
        // This request is using a bogus HTTP method `get`. If (a) using Node.js
        // v14, v16, or early v18.x versions and (b) this request is re-using
        // a socket (from an earlier keep-alive request in this test file),
        // then Node.js will emit 'end' on the socket. Undici then throws
        // `SocketError: other side closed`.  Given this is only for old Node.js
        // versions and for this rare case of using a bogus HTTP method, we will
        // skip out of this test instead of attempting to fully understand it.
        assert.strictEqual(err.message, 'other side closed');
        this.skip();
      }
      if (!firstQueryResponse) {
        return;
      }
      await consumeResponseBody(firstQueryResponse.body);

      const secondQueryResponse = await undici.request(queryRequestUrl, {
        headers,
        // @ts-expect-error - method type expects known HTTP method (GET, POST, PUT, ...)
        method: 'custom',
      });
      await consumeResponseBody(secondQueryResponse.body);

      assert.ok(
        firstQueryResponse!.headers['propagation-error'] === undefined,
        'propagation is set for instrumented requests'
      );
      assert.ok(
        secondQueryResponse!.headers['propagation-error'] === undefined,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      assertSpan(spans[0], {
        hostname: 'localhost',
        httpStatusCode: firstQueryResponse!.statusCode,
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        reqHeaders: headers,
        resHeaders: firstQueryResponse!.headers,
      });
      assert.strictEqual(
        spans[0].attributes['http.request.method_original'],
        'get',
        'request original method is captured'
      );

      assertSpan(spans[1], {
        hostname: 'localhost',
        httpStatusCode: secondQueryResponse!.statusCode,
        spanName: 'HTTP',
        httpMethod: '_OTHER',
        path: '/',
        query: '?query=test',
        reqHeaders: headers,
        resHeaders: secondQueryResponse!.headers,
      });
      assert.strictEqual(
        spans[1].attributes['http.request.method_original'],
        'custom',
        'request original method is captured'
      );
    });

    it('should create valid spans for "request" method', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Do some requests
      const headers = {
        'user-agent': 'custom',
        'foo-client': 'bar',
      };

      const ignoreRequestUrl = `${protocol}://${hostname}:${mockServer.port}/ignore/path`;
      const ignoreResponse = await undici.request(ignoreRequestUrl, {
        headers,
      });
      await consumeResponseBody(ignoreResponse.body);

      assert.ok(
        ignoreResponse.headers['propagation-error'],
        'propagation is not set for ignored requests'
      );

      const queryRequestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const queryResponse = await undici.request(queryRequestUrl, { headers });
      await consumeResponseBody(queryResponse.body);

      assert.ok(
        queryResponse.headers['propagation-error'] == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];
      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'localhost',
        httpStatusCode: queryResponse.statusCode,
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        reqHeaders: headers,
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

    it('should create valid spans for "fetch" method', async function () {
      // Fetch method is available from node v16.5
      // we want to skip this test for lowe versions
      // https://github.com/nodejs/undici/blob/08839e450aa6dd1b0e2c019d6e5869cd5b966be1/index.js#L95
      if (typeof undici.fetch === 'undefined') {
        this.skip();
      }

      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Do some requests
      const headers = {
        'user-agent': 'custom',
        'foo-client': 'bar',
      };
      const queryRequestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const queryResponse = await undici.fetch(queryRequestUrl, { headers });
      await queryResponse.text();

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
        reqHeaders: headers,
        resHeaders: queryResponse.headers as unknown as Headers,
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

    it('should create valid spans for "stream" method', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Do some requests
      const headers = {
        'user-agent': 'custom',
        'foo-client': 'bar',
      };
      // https://undici.nodejs.org/#/docs/api/Dispatcher?id=example-1-basic-get-stream-request
      const queryRequestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const queryResponse: Record<string, any> = {};
      const bufs: any[] = [];
      await undici.stream(
        queryRequestUrl,
        { opaque: { bufs }, headers } as any,
        ({ statusCode, headers, opaque }) => {
          queryResponse.statusCode = statusCode;
          queryResponse.headers = headers;
          return new Writable({
            write(chunk, encoding, callback) {
              (opaque as any).bufs.push(chunk);
              callback();
            },
          });
        }
      );

      assert.ok(
        queryResponse.headers['propagation-error'] == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];
      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'localhost',
        httpStatusCode: queryResponse.statusCode,
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        reqHeaders: headers,
        resHeaders: queryResponse.headers as unknown as Headers,
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

    it('should create valid spans for "dispatch" method', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Do some requests
      const headers = {
        'user-agent': 'custom',
        'foo-client': 'bar',
      };

      const queryRequestUrl = `${protocol}://${hostname}:${mockServer.port}`;
      const queryResponse: Record<string, any> = {};
      const client = new undici.Client(queryRequestUrl);
      await new Promise((resolve, reject) => {
        client.dispatch(
          {
            path: '/?query=test',
            method: 'GET',
            headers,
          },
          {
            onHeaders: (statusCode, headers) => {
              queryResponse.statusCode = statusCode;
              queryResponse.headers = headers;
              return true; // unidici types require to return boolean
            },
            onError: reject,
            onComplete: resolve,
            // Although the types say these following handlers are optional they must
            // be defined to avoid a TypeError
            onConnect: () => undefined,
            onData: () => true,
          }
        );
      });

      assert.ok(
        queryResponse.headers['propagation-error'] == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];
      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'localhost',
        httpStatusCode: queryResponse.statusCode,
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        reqHeaders: headers,
        resHeaders: queryResponse.headers as unknown as Headers,
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

    it('should create valid spans even if the configuration hooks fail', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Set the bad configuration
      instrumentation.setConfig({
        enabled: true,
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

      const requestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const { headers, statusCode, body } = await undici.request(requestUrl);
      await consumeResponseBody(body);

      assert.ok(
        headers['propagation-error'] == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];

      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'localhost',
        httpStatusCode: statusCode,
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        resHeaders: headers,
      });
    });

    it('should not create spans without parent if required in configuration', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      instrumentation.setConfig({
        enabled: true,
        requireParentforSpans: true,
      });

      const requestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const response = await undici.request(requestUrl);
      await consumeResponseBody(response.body);

      assert.ok(
        response.headers['propagation-error'] == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0, 'no spans are created');
    });

    it('should not create spans with INVALID_SPAN_CONTEXT parent if required in configuration', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      instrumentation.setConfig({
        enabled: true,
        requireParentforSpans: true,
      });

      const root = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
      await context.with(trace.setSpan(context.active(), root), async () => {
        const requestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
        const response = await undici.request(requestUrl);
        await consumeResponseBody(response.body);
        assert.ok(
          response.headers['propagation-error'] == null,
          'propagation is set for instrumented requests'
        );
      });

      spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0, 'no spans are created');
    });

    it('should create spans with parent if required in configuration', function (done) {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      instrumentation.setConfig({
        enabled: true,
        requireParentforSpans: true,
      });

      const tracer = provider.getTracer('default');
      const span = tracer.startSpan('parentSpan', {
        kind: SpanKind.INTERNAL,
      });

      context.with(trace.setSpan(context.active(), span), async () => {
        const requestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
        const response = await undici.request(requestUrl);
        await consumeResponseBody(response.body);

        span.end();
        assert.ok(
          response.headers['propagation-error'] == null,
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

    it('should capture errors while doing request', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      let fetchError;
      try {
        const requestUrl = 'http://unexistent-host-name/path';
        await undici.request(requestUrl);
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

    it('should capture error if undici request is aborted', async function () {
      // AbortController was added in: v15.0.0, v14.17.0
      // but we still run tests for node v14
      // https://nodejs.org/api/globals.html#class-abortcontroller
      if (typeof AbortController === 'undefined') {
        this.skip();
      }

      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      let requestError;
      const controller = new AbortController();
      const requestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const requestPromise = undici.request(requestUrl, {
        signal: controller.signal,
      });
      controller.abort();
      try {
        await requestPromise;
      } catch (err) {
        // Expected error
        requestError = err as Error;
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
        error: requestError,
        noNetPeer: true, // do not check network attribs
        forceStatus: {
          code: SpanStatusCode.ERROR,
          message: requestError?.message,
        },
      });
    });

    it('should not report an user-agent if it was not defined', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Do some requests
      const headers = {
        'foo-client': 'bar',
      };

      const queryRequestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const queryResponse = await undici.request(queryRequestUrl, { headers });
      await consumeResponseBody(queryResponse.body);

      assert.ok(
        queryResponse.headers['propagation-error'] == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];
      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'localhost',
        httpStatusCode: queryResponse.statusCode,
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        reqHeaders: headers,
        resHeaders: queryResponse.headers,
      });
      assert.strictEqual(
        span.attributes['user_agent.original'],
        undefined,
        'user-agent is undefined'
      );
    });

    it('should block headers if present in `blockHeadersToSpanAttributes`, overriding `headersToSpanAttributes`', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      instrumentation.setConfig({
        ...instrumentation.getConfig(),
        blockHeadersToSpanAttributes: {
          requestHeaders: ['foo-client'],
          responseHeaders: ['foo-server'],
        },
      });

      // Do some requests
      const headers = {
        'foo-client': 'bar',
        'bar-client': 'baz',
      };

      const queryRequestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const queryResponse = await undici.request(queryRequestUrl, { headers });
      await consumeResponseBody(queryResponse.body);

      assert.ok(
        queryResponse.headers['propagation-error'] == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];
      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'localhost',
        httpStatusCode: queryResponse.statusCode,
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        reqHeaders: headers,
        resHeaders: queryResponse.headers,
      });
      assert.equal(
        'http.request.header.foo-client' in span.attributes,
        false,
        'request headers in `blockHeadersToSpanAttributes` are blocked'
      );
      assert.equal(
        'http.request.header.bar-client' in span.attributes,
        false,
        'request headers not in `headersToSpanAttributes` and `blockHeadersToSpanAttributes` are blocked'
      );
      assert.equal(
        'http.response.header.foo-server' in span.attributes,
        false,
        'response headers in `blockHeadersToSpanAttributes` are blocked'
      );
    });

    it('should block only headers present in `blockHeadersToSpanAttributes`, if `headersToSpanAttributes` is not defined', async function () {
      let spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);

      // Set a configuration with only the block list
      const config =({
        ...instrumentation.getConfig(),
        blockHeadersToSpanAttributes: {
          requestHeaders: ['foo-client'],
          responseHeaders: ['foo-server'],
        },
      });
      delete config.headersToSpanAttributes;
      instrumentation.setConfig(config);

      // Do some requests
      const headers = {
        'foo-client': 'bar',
        'bar-client': 'baz'
      };

      const queryRequestUrl = `${protocol}://${hostname}:${mockServer.port}/?query=test`;
      const queryResponse = await undici.request(queryRequestUrl, { headers });
      await consumeResponseBody(queryResponse.body);

      assert.ok(
        queryResponse.headers['propagation-error'] == null,
        'propagation is set for instrumented requests'
      );

      spans = memoryExporter.getFinishedSpans();
      const span = spans[0];
      assert.ok(span, 'a span is present');
      assert.strictEqual(spans.length, 1);
      assertSpan(span, {
        hostname: 'localhost',
        httpStatusCode: queryResponse.statusCode,
        httpMethod: 'GET',
        path: '/',
        query: '?query=test',
        reqHeaders: headers,
        resHeaders: queryResponse.headers,
      });
      assert.equal(
        'http.request.header.foo-client' in span.attributes,
        false,
        'request headers in `blockHeadersToSpanAttributes` are blocked'
      );
      assert.equal(
        'http.request.header.bar-client' in span.attributes,
        true,
        'request headers not in `blockHeadersToSpanAttributes` are captured'
      );
      assert.equal(
        'http.response.header.foo-server' in span.attributes,
        false,
        'response headers in `blockHeadersToSpanAttributes` are blocked'
      );
      assert.equal(
        'http.response.header.content-type' in span.attributes,
        true,
        'response headers not in `blockHeadersToSpanAttributes` are captured'
      );
    });
  });
});
