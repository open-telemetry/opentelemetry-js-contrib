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
const tracer = new Tracer();

let testVariables = {
  input: {},
  output: {},
};

async function handleRequest() {
  tracer.outputTracetoStdOut(true);
  tracer.setOtelCollectorBackend(testVariables.input.otelCollectorBackend);
  tracer.setOtelCollectorUrl(testVariables.input.otelCollectorUrl);

  if (!testVariables.input.successful) {
    failureFunction();
  }

  return new Response('test', {
    status: 200,
  });
}

(async function () {
  describe('Verify trace to log feature, #outputTracetoStdOut()', function () {
    context('Successful function', function () {
      before(async function () {
        testVariables.input.successful = true;

        global.fetch = node_fetch;
        global.Headers = node_fetch.Headers;
        global.Request = node_fetch.Request;
        global.Response = node_fetch.Response;
        tracer.reset();
        let event = new fastlyMock.RequestEvent();
        // override console.log
        let consoleLog = console.log;
        console.log = function (output) {
          testVariables.output.log = output;
        };
        testVariables.output.response = await tracer.wrapper(
          handleRequest,
          event
        );
        console.log = consoleLog;
      });

      it('Console output matches generated otlp data', function () {
        expect(JSON.stringify(tracer.getOtlpOutput())).to.equal(
          testVariables.output.log
        );
      });
    });

    context('Failing function', function () {
      before(async function () {
        testVariables.input.successful = false;
        testVariables.output = {};

        global.fetch = node_fetch;
        global.Headers = node_fetch.Headers;
        global.Request = node_fetch.Request;
        global.Response = node_fetch.Response;
        tracer.reset();
        let event = new fastlyMock.RequestEvent();
        // override console.log
        let consoleLog = console.log;
        console.log = function (output) {
          testVariables.output.log = output;
        };
        try {
          testVariables.output.response = await tracer.wrapper(
            handleRequest,
            event
          );
        } catch (e) {
          // do nothing
        }
        // restore console log
        console.log = consoleLog;
      });

      it('Console output matches generated otlp data', function () {
        expect(JSON.stringify(tracer.getOtlpOutput())).to.equal(
          testVariables.output.log
        );
      });
    });
  });
})();
