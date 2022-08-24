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

'use strict';

const Tracer = require('../src/opentelemetry-fastly-ec.js');
const fastlyMock = require('./fastly-mock.js');
const node_fetch = require('node-fetch');
const expect = require('chai').expect;
const nock = require('nock');
const tracer = new Tracer();

let testVariables = {
  input: {},
  output: {},
};

async function handleRequest() {
  testVariables.traceId = tracer.getTraceId();

  let strURL = testVariables.input.fetchURL;
  let myExtResponse;

  // sends a https request
  const FASTLY_BACKEND_MY_SERVICE = 'httpbin';

  let myExtRequestHeaders = new Headers({});
  if (testVariables.input.fetchRequestObject) {
    let myExtRequest = new Request(strURL, {
      method: 'GET',
      headers: myExtRequestHeaders,
    });
    myExtResponse = await fetch(myExtRequest, {
      backend: FASTLY_BACKEND_MY_SERVICE,
    });
  } else {
    myExtResponse = await fetch(strURL, {
      backend: FASTLY_BACKEND_MY_SERVICE,
    });
  }

  testVariables.fetchSpandId = myExtResponse.spanId;

  return new Response('test', {
    status: 200,
  });
}

(async function () {
  describe('Verify fetch instrumentation', function () {
    context('fetch with request object', function () {
      before(async function () {
        testVariables.output = {};
        testVariables.input.fetchURL = 'https://httpbin.org/json';
        testVariables.input.fetchRequestObject = true;

        nock('https://httpbin.org')
          .get('/json')
          .reply(function () {
            testVariables.fetchTraceParent = this.req.headers.traceparent[0];
            return [
              200,
              '{"status": "ok"}',
              { 'Content-Type': 'application/json' },
            ];
          });

        global.fetch = node_fetch;
        global.Headers = node_fetch.Headers;
        global.Request = node_fetch.Request;
        global.Response = node_fetch.Response;
        let event = new fastlyMock.RequestEvent();
        await tracer.wrapper(handleRequest, event);
      });

      it('new span id created', function () {
        expect(testVariables.fetchSpandId).to.match(/^[0-9,a-f]{16,16}$/i);
      });
      it('correct traceparent header sent', function () {
        expect(testVariables.fetchTraceParent).to.equal(
          '00-' +
            testVariables.traceId +
            '-' +
            testVariables.fetchSpandId +
            '-01'
        );
      });
      it('span contains correct http details', function () {
        let fetchSpanDetails = tracer
          .getSpanById(testVariables.fetchSpandId)
          .getSpanDetails();
        expect(fetchSpanDetails)
          .to.have.property('status')
          .to.have.property('code')
          .to.equal(1);
        expect(fetchSpanDetails)
          .to.have.property('attributes')
          .to.deep.members([
            {
              key: 'http.url',
              value: { stringValue: 'https://httpbin.org/json' },
            },
            { key: 'http.method', value: { stringValue: 'GET' } },
            { key: 'http.status_code', value: { intValue: 200 } },
          ]);
      });
    });

    context('fetch with URL string', function () {
      before(async function () {
        testVariables.output = {};
        testVariables.input.fetchURL = 'https://httpbin.org/json';
        testVariables.input.fetchRequestObject = false;

        nock('https://httpbin.org')
          .get('/json')
          .reply(function () {
            testVariables.fetchTraceParent = this.req.headers.traceparent[0];
            return [
              200,
              '{"status": "ok"}',
              { 'Content-Type': 'application/json' },
            ];
          });

        global.fetch = node_fetch;
        global.Headers = node_fetch.Headers;
        global.Request = node_fetch.Request;
        global.Response = node_fetch.Response;
        let event = new fastlyMock.RequestEvent();
        await tracer.wrapper(handleRequest, event);
      });

      it('new span id created', function () {
        expect(testVariables.fetchSpandId).to.match(/^[0-9,a-f]{16,16}$/i);
      });
      it('correct traceparent header sent', function () {
        expect(testVariables.fetchTraceParent).to.equal(
          '00-' +
            testVariables.traceId +
            '-' +
            testVariables.fetchSpandId +
            '-01'
        );
      });
      it('span contains correct http details', function () {
        let fetchSpanDetails = tracer
          .getSpanById(testVariables.fetchSpandId)
          .getSpanDetails();
        expect(fetchSpanDetails)
          .to.have.property('status')
          .to.have.property('code')
          .to.equal(1);
        expect(fetchSpanDetails)
          .to.have.property('attributes')
          .to.deep.members([
            {
              key: 'http.url',
              value: { stringValue: 'https://httpbin.org/json' },
            },
            { key: 'http.method', value: { stringValue: 'GET' } },
            { key: 'http.status_code', value: { intValue: 200 } },
          ]);
      });
    });

    context('fetch with 404 response', function () {
      before(async function () {
        testVariables.output = {};
        testVariables.input.fetchURL = 'https://httpbin.org/status/404';
        testVariables.input.fetchRequestObject = true;

        nock('https://httpbin.org')
          .get('/status/404')
          .reply(function () {
            testVariables.fetchTraceParent = this.req.headers.traceparent[0];
            return [
              404,
              '{"status": "not_found"}',
              { 'Content-Type': 'application/json' },
            ];
          });

        global.fetch = node_fetch;
        global.Headers = node_fetch.Headers;
        global.Request = node_fetch.Request;
        global.Response = node_fetch.Response;
        let event = new fastlyMock.RequestEvent();
        await tracer.wrapper(handleRequest, event);
      });

      it('new span id created', function () {
        expect(testVariables.fetchSpandId).to.match(/^[0-9,a-f]{16,16}$/i);
      });
      it('correct traceparent header sent', function () {
        expect(testVariables.fetchTraceParent).to.equal(
          '00-' +
            testVariables.traceId +
            '-' +
            testVariables.fetchSpandId +
            '-01'
        );
      });
      it('span contains correct http details', function () {
        let fetchSpanDetails = tracer
          .getSpanById(testVariables.fetchSpandId)
          .getSpanDetails();
        expect(fetchSpanDetails)
          .to.have.property('status')
          .to.have.property('code')
          .to.equal(2);
        expect(fetchSpanDetails)
          .to.have.property('attributes')
          .to.deep.members([
            {
              key: 'http.url',
              value: { stringValue: 'https://httpbin.org/status/404' },
            },
            { key: 'http.method', value: { stringValue: 'GET' } },
            { key: 'http.status_code', value: { intValue: 404 } },
          ]);
      });
    });
  });
})();
