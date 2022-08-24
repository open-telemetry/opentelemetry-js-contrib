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
  tracer.setOtelCollectorBackend(testVariables.input.otelCollectorBackend);
  tracer.setOtelCollectorUrl(testVariables.input.otelCollectorUrl);
  if (testVariables.input.otelCollectorUserCredentials !== null) {
    tracer.setOtelCollectorUserCredentials(
      testVariables.input.otelCollectorUserCredentials
    );
  }

  return new Response('test', {
    status: 200,
  });
}

(async function () {
  describe('Send trace details to OTel Collector, #sendTrace()', function () {
    context('with user credentials', function () {
      before(async function () {
        testVariables.input.otelCollectorBackend = 'oi_collector';
        testVariables.input.otelCollectorUrl =
          'https://my.otelcollector.com/v1/traces';
        testVariables.input.otelCollectorUserCredentials = 'mybasicauth';
        testVariables.output = {};

        nock('https://my.otelcollector.com')
          .post('/v1/traces')
          .reply(function (uri, requestBody) {
            testVariables.output.collectorRequestBody =
              JSON.stringify(requestBody);
            testVariables.output.collectorRequestHeaders = {};
            if (this.req.headers['authorization']) {
              testVariables.output.collectorRequestHeaders['authorization'] =
                this.req.headers['authorization'][0];
            }
            if (this.req.headers['content-type']) {
              testVariables.output.collectorRequestHeaders['content-type'] =
                this.req.headers['content-type'][0];
            }
            return [
              200,
              '{status: "ok"}',
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
      it('received content-type header', function () {
        expect(
          testVariables.output.collectorRequestHeaders['content-type']
        ).to.equal('application/json');
      });
      it('received authorization header', function () {
        expect(
          testVariables.output.collectorRequestHeaders['authorization']
        ).to.equal('Basic mybasicauth');
      });
      it('received payload', function () {
        expect(testVariables.output.collectorRequestBody).to.equal(
          JSON.stringify(tracer.getOtlpOutput())
        );
      });
    });

    context('without user credentials', function () {
      before(async function () {
        testVariables.input.otelCollectorBackend = 'fastly_otel_collector';
        testVariables.input.otelCollectorUrl =
          'https://my.otelcollector.com/v1/traces';
        testVariables.input.otelCollectorUserCredentials = null;

        testVariables.output = {};

        nock('https://my.otelcollector.com')
          .post('/v1/traces')
          .reply(function (uri, requestBody) {
            testVariables.output.collectorRequestBody =
              JSON.stringify(requestBody);
            testVariables.output.collectorRequestHeaders = {};
            if (this.req.headers['authorization']) {
              testVariables.output.collectorRequestHeaders['authorization'] =
                this.req.headers['authorization'][0];
            }
            if (this.req.headers['content-type']) {
              testVariables.output.collectorRequestHeaders['content-type'] =
                this.req.headers['content-type'][0];
            }
            return [
              200,
              '{status: "ok"}',
              { 'Content-Type': 'application/json' },
            ];
          });

        global.fetch = node_fetch;
        global.Headers = node_fetch.Headers;
        global.Request = node_fetch.Request;
        global.Response = node_fetch.Response;
        let event = new fastlyMock.RequestEvent();
        tracer.reset();
        await tracer.wrapper(handleRequest, event);
      });
      it('received content-type header', function () {
        expect(
          testVariables.output.collectorRequestHeaders['content-type']
        ).to.equal('application/json');
      });
      it('received no authorization header', function () {
        expect(
          testVariables.output.collectorRequestHeaders['authorization']
        ).to.equal(undefined);
      });
      it('received payload', function () {
        expect(testVariables.output.collectorRequestBody).to.equal(
          JSON.stringify(tracer.getOtlpOutput())
        );
      });
    });
  });
})();
