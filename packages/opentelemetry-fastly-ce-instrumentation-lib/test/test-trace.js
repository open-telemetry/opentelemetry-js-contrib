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
  tracer.setOtelCollectorBackend(testVariables.input.otelCollectorBackend);
  tracer.setOtelCollectorUrl(testVariables.input.otelCollectorUrl);

  testVariables.output.traceId = tracer.getTraceId();
  testVariables.output.currentSpanName = tracer.getCurrentSpanName();
  testVariables.output.spanId = tracer.getCurrentSpanId();
  testVariables.output.spanDetailsOngoingByCurrent = JSON.parse(
    JSON.stringify(tracer.getCurrentSpan().getSpanDetails())
  );
  testVariables.output.spanDetailsOngoingById = JSON.parse(
    JSON.stringify(
      tracer.getSpanById(tracer.getCurrentSpanId()).getSpanDetails()
    )
  );
  tracer.setResourceAttribute('test-key-01', 'test-value-01');
  tracer.setResourceAttribute('test-key-02', 222);
  tracer.setResourceAttribute('test-key-03', []);

  if (!testVariables.input.successful) {
    failureFunction();
  }

  return new Response('test', {
    status: 200,
  });
}

(async function () {
  describe('Verify trace methods', function () {
    context('Successful function', function () {
      before(async function () {
        testVariables.input.successful = true;
        testVariables.output = {};

        global.fetch = node_fetch;
        global.Headers = node_fetch.Headers;
        global.Request = node_fetch.Request;
        global.Response = node_fetch.Response;
        let event = new fastlyMock.RequestEvent();
        testVariables.output.response = await tracer.wrapper(
          handleRequest,
          event
        );
      });

      it('Get TraceId', function () {
        expect(testVariables.output.traceId).to.match(/^[0-9,a-f]{32,32}$/i);
        testVariables.output.traceId = tracer.getTraceId();
      });
      it('Get current span name', function () {
        expect(testVariables.output.currentSpanName).to.equal('C@E-Main');
      });
      it('Get SpanId', function () {
        expect(testVariables.output.spanId).to.match(/^[0-9,a-f]{16,16}$/i);
      });
      it('Get current span (object)', function () {
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('traceId')
          .to.match(/^[0-9,a-f]{32,32}$/i);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('name')
          .to.equal('C@E-Main');
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('spanId')
          .to.match(/^[0-9,a-f]{16,16}$/i);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('kind')
          .to.equal(2);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('startTimeUnixNano')
          .to.match(/^[0-9]{19,19}$/);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('endTimeUnixNano')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('droppedAttributesCount')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('droppedEventsCount')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('attributes')
          .to.deep.equal([]);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('status')
          .to.have.property('code')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('events')
          .to.deep.equal([]);
      });
      it('Get span by id (object)', function () {
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('traceId')
          .to.match(/^[0-9,a-f]{32,32}$/i);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('name')
          .to.equal('C@E-Main');
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('spanId')
          .to.match(/^[0-9,a-f]{16,16}$/i);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('kind')
          .to.equal(2);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('startTimeUnixNano')
          .to.match(/^[0-9]{19,19}$/);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('endTimeUnixNano')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('droppedAttributesCount')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('droppedEventsCount')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('attributes')
          .to.deep.equal([]);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('status')
          .to.have.property('code')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('events')
          .to.deep.equal([]);
      });
      it('Trace resource attributes', function () {
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'service.name',
          value: { stringValue: 'C@E-service' },
        });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'fastly.hostname',
          value: { stringValue: 'cache-ams12345' },
        });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'fastly.service.id',
          value: { stringValue: '123456789' },
        });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'fastly.service.version',
          value: { stringValue: '101' },
        });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'test-key-01',
          value: { stringValue: 'test-value-01' },
        });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({ key: 'test-key-02', value: { intValue: 222 } });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'test-key-03',
          value: { stringValue: 'NO_STRING_OR_NUMBER' },
        });
      });

      it('Response headers', function () {
        expect(
          testVariables.output.response.headers.get('server-timing')
        ).to.equal(
          'traceparent;desc="00-' +
            testVariables.output.traceId +
            '-' +
            testVariables.output.spanId +
            '-01"'
        );
        expect(
          testVariables.output.response.headers.get('timing-allowed-origin')
        ).to.equal('*');
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
        // supress console.log
        let consoleLog = console.log;
        console.log = function () {};
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

      it('Get TraceId', function () {
        expect(testVariables.output.traceId).to.match(/^[0-9,a-f]{32,32}$/i);
      });
      it('Get current span name', function () {
        expect(testVariables.output.currentSpanName).to.equal('C@E-Main');
      });
      it('Get SpanId', function () {
        expect(testVariables.output.spanId).to.match(/^[0-9,a-f]{16,16}$/i);
      });
      it('Get current span (object)', function () {
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('traceId')
          .to.match(/^[0-9,a-f]{32,32}$/i);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('name')
          .to.equal('C@E-Main');
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('spanId')
          .to.match(/^[0-9,a-f]{16,16}$/i);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('kind')
          .to.equal(2);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('startTimeUnixNano')
          .to.match(/^[0-9]{19,19}$/);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('endTimeUnixNano')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('droppedAttributesCount')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('droppedEventsCount')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('attributes')
          .to.deep.equal([]);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('status')
          .to.have.property('code')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingByCurrent)
          .to.have.property('events')
          .to.deep.equal([]);
      });
      it('Get span by id (object)', function () {
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('traceId')
          .to.match(/^[0-9,a-f]{32,32}$/i);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('name')
          .to.equal('C@E-Main');
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('spanId')
          .to.match(/^[0-9,a-f]{16,16}$/i);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('kind')
          .to.equal(2);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('startTimeUnixNano')
          .to.match(/^[0-9]{19,19}$/);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('endTimeUnixNano')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('droppedAttributesCount')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('droppedEventsCount')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('attributes')
          .to.deep.equal([]);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('status')
          .to.have.property('code')
          .to.equal(0);
        expect(testVariables.output.spanDetailsOngoingById)
          .to.have.property('events')
          .to.deep.equal([]);
      });
      it('Trace resource attributes', function () {
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'service.name',
          value: { stringValue: 'C@E-service' },
        });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'fastly.hostname',
          value: { stringValue: 'cache-ams12345' },
        });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'fastly.service.id',
          value: { stringValue: '123456789' },
        });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'fastly.service.version',
          value: { stringValue: '101' },
        });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'test-key-01',
          value: { stringValue: 'test-value-01' },
        });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({ key: 'test-key-02', value: { intValue: 222 } });
        expect(
          tracer.getOtlpOutput().resourceSpans[0].resource.attributes
        ).to.deep.include({
          key: 'test-key-03',
          value: { stringValue: 'NO_STRING_OR_NUMBER' },
        });
      });
      it('Trace status code and error message', function () {
        expect(
          tracer.getOtlpOutput().resourceSpans[0].instrumentationLibrarySpans[0]
            .spans[0].status.code
        ).to.equal(2);
        expect(
          tracer.getOtlpOutput().resourceSpans[0].instrumentationLibrarySpans[0]
            .spans[0].status.message
        ).to.include('ReferenceError:failureFunction');
      });
      it('Response headers', function () {
        expect(
          testVariables.output.response.headers.get('server-timing')
        ).to.equal(
          'traceparent;desc="00-' +
            testVariables.output.traceId +
            '-' +
            testVariables.output.spanId +
            '-01"'
        );
        expect(
          testVariables.output.response.headers.get('timing-allowed-origin')
        ).to.equal('*');
      });
    });
  });
})();
