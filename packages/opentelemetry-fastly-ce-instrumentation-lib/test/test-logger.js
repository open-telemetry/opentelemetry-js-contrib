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

async function handleRequest() {
  let logger, myLogMessage;

  describe('Log instrumentation, #fastly.getLogger().log()', function () {
    context('loggin without trace wrapping', function () {
      before(function () {
        logger = fastly.getLogger('some-logger');
        myLogMessage = {
          event: {
            message: 'Log message from the Edge',
          },
          sourcetype: 'fastly-compute@edge',
        };
      });

      it('json object without properties property not impacted', function () {
        let logOutput = JSON.parse(logger.log(JSON.stringify(myLogMessage)));
        expect(logOutput)
          .to.have.property('event')
          .that.includes.all.keys('message');
        expect(logOutput).to.have.property('sourcetype');
        expect(logOutput)
          .to.have.property('event')
          .not.to.have.property('properties');
      });

      it('string not impacted', function () {
        let logOutput = logger.log('plain logmessage');
        expect(logOutput).to.equal('plain logmessage');
      });
    });

    context('logging with trace wrapping', function () {
      before(function () {
        logger = fastly.getLogger('some-logger');
        myLogMessage = {
          event: {
            message: 'Log message from the Edge',
          },
          sourcetype: 'fastly-compute@edge',
        };
        tracer.logWrapper(logger);
      });

      it('json object without properties property enriched with trace details', function () {
        let logOutput = JSON.parse(logger.log(JSON.stringify(myLogMessage)));
        expect(logOutput)
          .to.have.property('event')
          .that.includes.all.keys('message', 'properties');
        expect(logOutput)
          .to.have.property('event')
          .to.have.property('properties')
          .that.includes.all.keys('trace_id', 'span_id', 'trace_flags');
        expect(logOutput).to.have.property('sourcetype');
        expect(logOutput)
          .to.have.property('event')
          .to.have.property('properties');
      });

      it('json object with properties property enriched with trace details', function () {
        myLogMessage.event.properties = {};
        let logOutput = JSON.parse(logger.log(JSON.stringify(myLogMessage)));
        expect(logOutput)
          .to.have.property('event')
          .that.includes.all.keys('message', 'properties');
        expect(logOutput)
          .to.have.property('event')
          .to.have.property('properties')
          .that.includes.all.keys('trace_id', 'span_id', 'trace_flags');
        expect(logOutput).to.have.property('sourcetype');
        expect(logOutput)
          .to.have.property('event')
          .to.have.property('properties');
      });

      it('string not impacted', function () {
        let logOutput = logger.log('plain logmessage');
        expect(logOutput).to.equal('plain logmessage');
      });
    });
  });

  return new Response('ok', {
    status: 200,
  });
}

(async function () {
  global.fetch = node_fetch;
  global.Headers = node_fetch.Headers;
  global.Request = node_fetch.Request;
  global.Response = node_fetch.Response;
  let event = new fastlyMock.RequestEvent();
  await tracer.wrapper(handleRequest, event);
})();
