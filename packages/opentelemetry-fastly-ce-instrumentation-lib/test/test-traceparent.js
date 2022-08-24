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
  testVariables.traceId = tracer.getTraceId();
  testVariables.parentSpanContext = {};
  testVariables.parentSpanContext.traceId = tracer
    .getCurrentSpan()
    .getParentSpanContext().traceId;
  testVariables.parentSpanContext.spanId = tracer
    .getCurrentSpan()
    .getParentSpanContext().spanId;
  testVariables.parentSpanContext.traceFlag = tracer
    .getCurrentSpan()
    .getParentSpanContext().traceFlag;
  testVariables.parentSpanContext.traceState = tracer
    .getCurrentSpan()
    .getParentSpanContext().traceState;

  return new Response('test', {
    status: 200,
  });
}

(async function () {
  describe('Incoming traceparent header', function () {
    let event = new fastlyMock.RequestEvent();

    context('Properly formatted traceparent header', function () {
      before(async function () {
        global.fetch = node_fetch;
        global.Headers = node_fetch.Headers;
        global.Request = node_fetch.Request;
        global.Response = node_fetch.Response;
        event.request.headers.set(
          'traceparent',
          '00-4372d5071bbe8f42f0da44fdc118c78f-15818b24e5dda64c-01'
        );
        await tracer.wrapper(handleRequest, event);
      });

      it('Incoming trace id used', function () {
        expect(testVariables.traceId).to.equal(
          '4372d5071bbe8f42f0da44fdc118c78f'
        );
      });
      it('Incoming spand id used in parent span context', function () {
        expect(testVariables.parentSpanContext)
          .to.have.property('traceId')
          .to.equal('4372d5071bbe8f42f0da44fdc118c78f');
        expect(testVariables.parentSpanContext)
          .to.have.property('spanId')
          .to.equal('15818b24e5dda64c');
        expect(testVariables.parentSpanContext)
          .to.have.property('traceFlag')
          .to.equal('00');
        expect(testVariables.parentSpanContext)
          .to.have.property('traceState')
          .to.deep.equal({});
      });
    });

    context(
      'Malformed traceparent header (4 parts, invalid lenght for trace id and span id)',
      function () {
        before(async function () {
          global.fetch = node_fetch;
          global.Headers = node_fetch.Headers;
          global.Request = node_fetch.Request;
          global.Response = node_fetch.Response;
          event.request.headers.set('traceparent', '00-1111-2222-01');
          await tracer.wrapper(handleRequest, event);
        });

        it('New trace id generated', function () {
          expect(testVariables.traceId).to.not.equal('1111');
          expect(testVariables.traceId).to.match(/^[0-9,a-f]{32,32}$/i);
        });
        it('spanId value and parent span context', function () {
          expect(testVariables.parentSpanContext)
            .to.have.property('traceId')
            .not.to.equal('1111');
          expect(testVariables.parentSpanContext)
            .to.have.property('traceId')
            .to.match(/^[0-9,a-f]{32,32}$/i);
          expect(testVariables.parentSpanContext)
            .to.have.property('spanId')
            .not.to.equal('2222');
          expect(testVariables.parentSpanContext)
            .to.have.property('spanId')
            .to.match(/^[0-9,a-f]{16,16}$/i);
          expect(testVariables.parentSpanContext)
            .to.have.property('traceFlag')
            .to.equal('00');
          expect(testVariables.parentSpanContext)
            .to.have.property('traceState')
            .to.deep.equal({});
        });
      }
    );

    context('Malformed traceparentheader (2 parts only)', function () {
      before(async function () {
        global.fetch = node_fetch;
        global.Headers = node_fetch.Headers;
        global.Request = node_fetch.Request;
        global.Response = node_fetch.Response;
        event.request.headers.set('traceparent', '00-1111222201');
        await tracer.wrapper(handleRequest, event);
      });

      it('New trace id generated', function () {
        expect(testVariables.traceId).to.not.equal('1111222201');
        expect(testVariables.traceId).to.match(/^[0-9,a-f]{32,32}$/i);
      });
      it('spanId value and parent span context', function () {
        expect(testVariables.parentSpanContext)
          .to.have.property('traceId')
          .not.to.equal('1111');
        expect(testVariables.parentSpanContext)
          .to.have.property('traceId')
          .to.match(/^[0-9,a-f]{32,32}$/i);
        expect(testVariables.parentSpanContext)
          .to.have.property('spanId')
          .not.to.equal('');
        expect(testVariables.parentSpanContext)
          .to.have.property('spanId')
          .to.match(/^[0-9,a-f]{16,16}$/i);
        expect(testVariables.parentSpanContext)
          .to.have.property('traceFlag')
          .to.equal('00');
        expect(testVariables.parentSpanContext)
          .to.have.property('traceState')
          .to.deep.equal({});
      });
    });
  });
})();
