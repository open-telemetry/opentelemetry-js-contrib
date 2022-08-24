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
  testVariables.output.traceId = tracer.getTraceId();
  testVariables.output.mainSpanId = tracer.getCurrentSpanId();
  let span = tracer.startSpan('test-span');
  testVariables.output.firstChildSpanDetails = JSON.parse(
    JSON.stringify(span.getSpanDetails())
  );
  testVariables.output.firstChildSpanId = span.getSpanId();
  span.setAttribute('test-key-01', 'test-value-01');
  span.setAttribute('test-key-02', 222);
  span.setAttribute('test-key-03', []);
  span.setKind(1);
  if (!testVariables.input.successful) {
    span.setStatus(2);
  } else {
    span.setStatus(0);
  }
  span.updateName('renamed-test-span');
  testVariables.output.firstChildSpanDetailsUpdated = JSON.parse(
    JSON.stringify(span.getSpanDetails())
  );
  testVariables.output.firstChildParentContext = span.getParentSpanContext();
  span.end();
  testVariables.output.firstChildSpanDetailsEnded = JSON.parse(
    JSON.stringify(span.getSpanDetails())
  );
  let retrievedSpan = tracer.getSpanById(testVariables.output.firstChildSpanId);
  testVariables.output.retrievedFirstChildSpanId = retrievedSpan.getSpanId();

  if (!testVariables.input.successful) {
    let secondSpan = tracer.startSpan('another-test-span');
    testVariables.output.secondChildSpanId = secondSpan.getSpanId();
    testVariables.output.secondChildSpanDetails = secondSpan.getSpanDetails();
    failureFunction();
    secondSpan.end();
  }

  return new Response('test', {
    status: 200,
  });
}

(async function () {
  describe('Verify span methods when function successful', function () {
    before(async function () {
      global.fetch = node_fetch;
      global.Headers = node_fetch.Headers;
      global.Request = node_fetch.Request;
      global.Response = node_fetch.Response;
      let event = new fastlyMock.RequestEvent();
      testVariables.input.successful = true;

      await tracer.wrapper(handleRequest, event);
    });

    it('Create new span', function () {
      expect(testVariables.output.firstChildSpanDetails)
        .to.have.property('name')
        .to.equal('test-span');
    });

    it('Set span attribute', function () {
      let spanDetails = testVariables.output.firstChildSpanDetailsUpdated;
      expect(spanDetails).to.have.property('attributes').to.have.lengthOf(3);
      expect(spanDetails.attributes).to.deep.members([
        { key: 'test-key-01', value: { stringValue: 'test-value-01' } },
        { key: 'test-key-02', value: { intValue: 222 } },
        { key: 'test-key-03', value: { stringValue: 'NO_STRING_OR_NUMBER' } },
      ]);
    });
    it('Set span kind', function () {
      expect(testVariables.output.firstChildSpanDetailsUpdated)
        .to.have.property('kind')
        .to.equal(1);
    });
    it('Set span status', function () {
      expect(testVariables.output.firstChildSpanDetailsUpdated)
        .to.have.property('status')
        .to.have.property('code')
        .to.equal(0);
    });
    it('Update span name', function () {
      expect(testVariables.output.firstChildSpanDetailsUpdated)
        .to.have.property('name')
        .to.equal('renamed-test-span');
    });

    it('End span', function () {
      let spanDetails = testVariables.output.firstChildSpanDetailsUpdated;
      let spanDetailsEnded = testVariables.output.firstChildSpanDetailsEnded;
      expect(spanDetails).to.have.property('endTimeUnixNano').to.equal(0);
      expect(spanDetails)
        .to.have.property('status')
        .to.have.property('code')
        .to.equal(0);
      expect(spanDetailsEnded)
        .to.have.property('endTimeUnixNano')
        .to.match(/^[0-9]{19,19}$/);
      expect(spanDetailsEnded)
        .to.have.property('status')
        .to.have.property('code')
        .to.equal(1);
    });

    it('Get span id', function () {
      expect(testVariables.output.retrievedFirstChildSpanId).to.equal(
        testVariables.output.firstChildSpanId
      );
    });

    it('Get parent span context', function () {
      let parentContext = testVariables.output.firstChildParentContext;
      expect(parentContext)
        .to.have.property('traceId')
        .to.equal(testVariables.output.traceId);
      expect(parentContext)
        .to.have.property('spanId')
        .to.equal(testVariables.output.mainSpanId);
      expect(parentContext).to.have.property('traceFlag').to.equal('00');
      expect(parentContext).to.have.property('traceState').to.deep.equal({});
    });
    it('Get span details', function () {
      let spanDetails = testVariables.output.firstChildSpanDetailsEnded;
      expect(spanDetails)
        .to.have.property('traceId')
        .to.match(/^[0-9,a-f]{32,32}$/i);
      expect(spanDetails)
        .to.have.property('name')
        .to.equal('renamed-test-span');
      expect(spanDetails)
        .to.have.property('spanId')
        .to.match(/^[0-9,a-f]{16,16}$/i);
      expect(spanDetails).to.have.property('kind').to.equal(1);
      expect(spanDetails)
        .to.have.property('startTimeUnixNano')
        .to.match(/^[0-9]{19,19}$/);
      expect(spanDetails)
        .to.have.property('endTimeUnixNano')
        .to.match(/^[0-9]{19,19}$/);
      expect(spanDetails)
        .to.have.property('droppedAttributesCount')
        .to.equal(0);
      expect(spanDetails).to.have.property('droppedEventsCount').to.equal(0);
      expect(spanDetails)
        .to.have.property('attributes')
        .to.deep.members([
          { key: 'test-key-01', value: { stringValue: 'test-value-01' } },
          { key: 'test-key-02', value: { intValue: 222 } },
          { key: 'test-key-03', value: { stringValue: 'NO_STRING_OR_NUMBER' } },
        ]);
      expect(spanDetails)
        .to.have.property('status')
        .to.have.property('code')
        .to.equal(1);
      expect(spanDetails).to.have.property('events').to.deep.equal([]);
    });
  });

  describe('Verify span methods when function is failing', function () {
    before(async function () {
      global.fetch = node_fetch;
      global.Headers = node_fetch.Headers;
      global.Request = node_fetch.Request;
      global.Response = node_fetch.Response;
      let event = new fastlyMock.RequestEvent();
      testVariables.output = {};
      tracer.reset();
      testVariables.input.successful = false;
      // supress console.log
      let consoleLog = console.log;
      console.log = function () {};
      try {
        await tracer.wrapper(handleRequest, event);
      } catch (e) {
        // do nothing
      }
      // restore console log
      console.log = consoleLog;
      //await fastlyMock.wait(500);
    });

    it('Create new span', function () {
      expect(testVariables.output.firstChildSpanDetails)
        .to.have.property('name')
        .to.equal('test-span');
    });

    it('Set span attribute', function () {
      let spanDetails = testVariables.output.firstChildSpanDetailsUpdated;
      expect(spanDetails).to.have.property('attributes').to.have.lengthOf(3);
      expect(spanDetails.attributes).to.deep.members([
        { key: 'test-key-01', value: { stringValue: 'test-value-01' } },
        { key: 'test-key-02', value: { intValue: 222 } },
        { key: 'test-key-03', value: { stringValue: 'NO_STRING_OR_NUMBER' } },
      ]);

      // TO DO - Not right span if not ended? :( / VERIFY
    });
    it('Set span kind', function () {
      expect(testVariables.output.firstChildSpanDetailsUpdated)
        .to.have.property('kind')
        .to.equal(1);
    });
    it('Set span status', function () {
      expect(testVariables.output.firstChildSpanDetailsUpdated)
        .to.have.property('status')
        .to.have.property('code')
        .to.equal(2);
    });
    it('Update span name', function () {
      expect(testVariables.output.firstChildSpanDetailsUpdated)
        .to.have.property('name')
        .to.equal('renamed-test-span');
    });

    it('End span', function () {
      let spanDetails = testVariables.output.firstChildSpanDetailsUpdated;
      let spanDetailsEnded = testVariables.output.firstChildSpanDetailsEnded;
      expect(spanDetails).to.have.property('endTimeUnixNano').to.equal(0);
      expect(spanDetails)
        .to.have.property('status')
        .to.have.property('code')
        .to.equal(2);
      expect(spanDetailsEnded)
        .to.have.property('endTimeUnixNano')
        .to.match(/^[0-9]{19,19}$/);
      expect(spanDetailsEnded)
        .to.have.property('status')
        .to.have.property('code')
        .to.equal(2);
    });

    it('Get span id', function () {
      expect(testVariables.output.retrievedFirstChildSpanId).to.equal(
        testVariables.output.firstChildSpanId
      );
    });

    it('Get parent span context', function () {
      let parentContext = testVariables.output.firstChildParentContext;
      expect(parentContext)
        .to.have.property('traceId')
        .to.equal(testVariables.output.traceId);
      expect(parentContext)
        .to.have.property('spanId')
        .to.equal(testVariables.output.mainSpanId);
      expect(parentContext).to.have.property('traceFlag').to.equal('00');
      expect(parentContext).to.have.property('traceState').to.deep.equal({});
    });
    it('Get span details', function () {
      let spanDetails = testVariables.output.firstChildSpanDetailsEnded;
      expect(spanDetails)
        .to.have.property('traceId')
        .to.match(/^[0-9,a-f]{32,32}$/i);
      expect(spanDetails)
        .to.have.property('name')
        .to.equal('renamed-test-span');
      expect(spanDetails)
        .to.have.property('spanId')
        .to.match(/^[0-9,a-f]{16,16}$/i);
      expect(spanDetails).to.have.property('kind').to.equal(1);
      expect(spanDetails)
        .to.have.property('startTimeUnixNano')
        .to.match(/^[0-9]{19,19}$/);
      expect(spanDetails)
        .to.have.property('endTimeUnixNano')
        .to.match(/^[0-9]{19,19}$/);
      expect(spanDetails)
        .to.have.property('droppedAttributesCount')
        .to.equal(0);
      expect(spanDetails).to.have.property('droppedEventsCount').to.equal(0);
      expect(spanDetails)
        .to.have.property('attributes')
        .to.deep.members([
          { key: 'test-key-01', value: { stringValue: 'test-value-01' } },
          { key: 'test-key-02', value: { intValue: 222 } },
          { key: 'test-key-03', value: { stringValue: 'NO_STRING_OR_NUMBER' } },
        ]);
      expect(spanDetails)
        .to.have.property('status')
        .to.have.property('code')
        .to.equal(2);
      expect(spanDetails).to.have.property('events').to.deep.equal([]);
    });
    it('End of failing span', function () {
      let spanDetails = testVariables.output.secondChildSpanDetails;
      expect(spanDetails)
        .to.have.property('traceId')
        .to.match(/^[0-9,a-f]{32,32}$/i);
      expect(spanDetails)
        .to.have.property('name')
        .to.equal('another-test-span');
      expect(spanDetails)
        .to.have.property('spanId')
        .to.match(/^[0-9,a-f]{16,16}$/i);
      expect(spanDetails).to.have.property('kind').to.equal(1);
      expect(spanDetails)
        .to.have.property('startTimeUnixNano')
        .to.match(/^[0-9]{19,19}$/);
      expect(spanDetails)
        .to.have.property('endTimeUnixNano')
        .to.match(/^[0-9]{19,19}$/);
      expect(spanDetails)
        .to.have.property('droppedAttributesCount')
        .to.equal(0);
      expect(spanDetails).to.have.property('droppedEventsCount').to.equal(0);
      expect(spanDetails).to.have.property('attributes').to.deep.members([]);
      expect(spanDetails)
        .to.have.property('status')
        .to.have.property('code')
        .to.equal(2);
      expect(spanDetails).to.have.property('events').to.deep.equal([]);
    });
  });
})();
