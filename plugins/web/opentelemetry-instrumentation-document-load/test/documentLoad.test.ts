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

import {
  context,
  HrTime,
  propagation,
  SpanAttributes,
} from '@opentelemetry/api';
import {
  W3CTraceContextPropagator,
  TRACE_PARENT_HEADER,
} from '@opentelemetry/core';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  PerformanceTimingNames as PTN,
  StackContextManager,
} from '@opentelemetry/sdk-trace-web';

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DocumentLoadInstrumentation } from '../src';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { EventNames } from '../src/enums/EventNames';

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider();
const spanProcessor = new SimpleSpanProcessor(exporter);

provider.addSpanProcessor(spanProcessor);
provider.register();

const resources = [
  {
    name: 'http://localhost:8090/bundle.js',
    entryType: 'resource',
    startTime: 20.985000010114163,
    duration: 90.94999998342246,
    initiatorType: 'script',
    nextHopProtocol: 'http/1.1',
    workerStart: 0,
    redirectStart: 0,
    redirectEnd: 0,
    fetchStart: 20.985000010114163,
    domainLookupStart: 20.985000010114163,
    domainLookupEnd: 20.985000010114163,
    connectStart: 20.985000010114163,
    connectEnd: 20.985000010114163,
    secureConnectionStart: 20.985000010114163,
    requestStart: 29.28999997675419,
    responseStart: 31.88999998383224,
    responseEnd: 111.93499999353662,
    transferSize: 1446645,
    encodedBodySize: 1446396,
    decodedBodySize: 1446396,
    serverTiming: [],
  },
  {
    name: 'http://localhost:8090/sockjs-node/info?t=1572620894466',
    entryType: 'resource',
    startTime: 1998.5950000118464,
    duration: 4.209999984595925,
    initiatorType: 'xmlhttprequest',
    nextHopProtocol: 'http/1.1',
    workerStart: 0,
    redirectStart: 0,
    redirectEnd: 0,
    fetchStart: 1998.5950000118464,
    domainLookupStart: 1998.5950000118464,
    domainLookupEnd: 1998.5950000118464,
    connectStart: 1998.5950000118464,
    connectEnd: 1998.5950000118464,
    secureConnectionStart: 1998.5950000118464,
    requestStart: 2001.7900000093505,
    responseStart: 2002.3700000019744,
    responseEnd: 2002.8049999964423,
    transferSize: 368,
    encodedBodySize: 79,
    decodedBodySize: 79,
    serverTiming: [],
  },
];
const resourcesNoSecureConnectionStart = [
  {
    name: 'http://localhost:8090/bundle.js',
    entryType: 'resource',
    startTime: 20.985000010114163,
    duration: 90.94999998342246,
    initiatorType: 'script',
    nextHopProtocol: 'http/1.1',
    workerStart: 0,
    redirectStart: 0,
    redirectEnd: 0,
    fetchStart: 20.985000010114163,
    domainLookupStart: 20.985000010114163,
    domainLookupEnd: 20.985000010114163,
    connectStart: 20.985000010114163,
    connectEnd: 20.985000010114163,
    secureConnectionStart: 0,
    requestStart: 29.28999997675419,
    responseStart: 31.88999998383224,
    responseEnd: 111.93499999353662,
    transferSize: 1446645,
    encodedBodySize: 1446396,
    decodedBodySize: 1446396,
    serverTiming: [],
  },
];
const entries = {
  name: 'http://localhost:8090/',
  entryType: 'navigation',
  startTime: 0,
  duration: 374.0100000286475,
  initiatorType: 'navigation',
  nextHopProtocol: 'http/1.1',
  workerStart: 0,
  redirectStart: 0,
  redirectEnd: 0,
  fetchStart: 0.7999999215826392,
  domainLookupStart: 0.7999999215826392,
  domainLookupEnd: 0.7999999215826392,
  connectStart: 0.7999999215826392,
  connectEnd: 0.7999999215826393,
  secureConnectionStart: 0.7999999215826392,
  requestStart: 4.480000003241003,
  responseStart: 5.729999975301325,
  responseEnd: 6.154999951831996,
  transferSize: 655,
  encodedBodySize: 362,
  decodedBodySize: 362,
  serverTiming: [],
  unloadEventStart: 12.63499993365258,
  unloadEventEnd: 13.514999998733401,
  domInteractive: 200.12499997392297,
  domContentLoadedEventStart: 200.13999997172505,
  domContentLoadedEventEnd: 201.6000000294298,
  domComplete: 370.62499998137355,
  loadEventStart: 370.64999993890524,
  loadEventEnd: 374.0100000286475,
  type: 'reload',
  redirectCount: 0,
} as any;

const entriesFallback = {
  navigationStart: 1571078170305,
  unloadEventStart: 0,
  unloadEventEnd: 0,
  redirectStart: 0,
  redirectEnd: 0,
  fetchStart: 1571078170305,
  domainLookupStart: 1571078170307,
  domainLookupEnd: 1571078170308,
  connectStart: 1571078170309,
  connectEnd: 1571078170310,
  secureConnectionStart: 1571078170310,
  requestStart: 1571078170310,
  responseStart: 1571078170313,
  responseEnd: 1571078170330,
  domLoading: 1571078170331,
  domInteractive: 1571078170392,
  domContentLoadedEventStart: 1571078170392,
  domContentLoadedEventEnd: 1571078170392,
  domComplete: 1571078170393,
  loadEventStart: 1571078170393,
  loadEventEnd: 1571078170394,
} as any;

const paintEntries: PerformanceEntryList = [
  {
    duration: 0,
    entryType: 'paint',
    name: 'first-paint',
    startTime: 7.480000003241003,
    toJSON() {},
  },
  {
    duration: 0,
    entryType: 'paint',
    name: 'first-contentful-paint',
    startTime: 8.480000003241003,
    toJSON() {},
  },
];

performance.getEntriesByType;

const userAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36';

function ensureNetworkEventsExists(events: TimedEvent[]) {
  assert.strictEqual(events[0].name, PTN.FETCH_START);
  assert.strictEqual(events[1].name, PTN.DOMAIN_LOOKUP_START);
  assert.strictEqual(events[2].name, PTN.DOMAIN_LOOKUP_END);
  assert.strictEqual(events[3].name, PTN.CONNECT_START);
  assert.strictEqual(events[4].name, PTN.SECURE_CONNECTION_START);
  assert.strictEqual(events[5].name, PTN.CONNECT_END);
  assert.strictEqual(events[6].name, PTN.REQUEST_START);
  assert.strictEqual(events[7].name, PTN.RESPONSE_START);
  assert.strictEqual(events[8].name, PTN.RESPONSE_END);
}

describe('DocumentLoad Instrumentation', () => {
  let plugin: DocumentLoadInstrumentation;
  let contextManager: StackContextManager;
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    contextManager = new StackContextManager().enable();
    context.setGlobalContextManager(contextManager);
    Object.defineProperty(window.document, 'readyState', {
      writable: true,
      value: 'complete',
    });
    sandbox.replaceGetter(navigator, 'userAgent', () => userAgent);
    plugin = new DocumentLoadInstrumentation({
      enabled: false,
    });
    plugin.setTracerProvider(provider);
    exporter.reset();
  });

  afterEach(async () => {
    sandbox.restore();
    context.disable();
    Object.defineProperty(window.document, 'readyState', {
      writable: true,
      value: 'complete',
    });
    plugin.disable();
  });

  before(() => {
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  });

  describe('constructor', () => {
    it('should construct an instance', () => {
      plugin = new DocumentLoadInstrumentation({
        enabled: false,
      });
      assert.ok(plugin instanceof DocumentLoadInstrumentation);
    });
  });

  describe('when document readyState is complete', () => {
    let spyEntries: any;
    beforeEach(() => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns([]);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });
    it('should start collecting the performance immediately', done => {
      plugin.enable();
      setTimeout(() => {
        assert.strictEqual(window.document.readyState, 'complete');
        assert.strictEqual(spyEntries.callCount, 3);
        done();
      });
    });
  });

  describe('when document readyState is not complete', () => {
    let spyEntries: any;
    beforeEach(() => {
      Object.defineProperty(window.document, 'readyState', {
        writable: true,
        value: 'loading',
      });
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns([]);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should collect performance after document load event', done => {
      const spy = sandbox.spy(window, 'addEventListener');
      plugin.enable();
      const args = spy.args[0];
      const name = args[0];
      assert.strictEqual(name, 'load');
      assert.ok(spy.calledOnce);
      assert.ok(spyEntries.callCount === 0);

      window.dispatchEvent(
        new CustomEvent('load', {
          bubbles: true,
          cancelable: false,
          composed: true,
          detail: {},
        })
      );
      setTimeout(() => {
        assert.strictEqual(spyEntries.callCount, 3);
        done();
      });
    });
  });

  describe('when navigation entries types are available', () => {
    let spyEntries: sinon.SinonStub;
    beforeEach(() => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns([]);
      spyEntries.withArgs('paint').returns(paintEntries);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should export correct span with events', done => {
      plugin.enable();

      setTimeout(() => {
        const rootSpan = exporter.getFinishedSpans()[0] as ReadableSpan;
        const fetchSpan = exporter.getFinishedSpans()[1] as ReadableSpan;
        const rsEvents = rootSpan.events;
        const fsEvents = fetchSpan.events;

        assert.strictEqual(rootSpan.name, 'documentFetch');
        assert.ok(
          (rootSpan.attributes[
            SemanticAttributes.HTTP_RESPONSE_CONTENT_LENGTH
          ] as number) > 0
        );
        assert.strictEqual(fetchSpan.name, 'documentLoad');
        ensureNetworkEventsExists(rsEvents);

        assert.strictEqual(fsEvents[9].name, EventNames.FIRST_PAINT);
        assert.strictEqual(
          fsEvents[10].name,
          EventNames.FIRST_CONTENTFUL_PAINT
        );

        assert.strictEqual(fsEvents[0].name, PTN.FETCH_START);
        assert.strictEqual(fsEvents[1].name, PTN.UNLOAD_EVENT_START);
        assert.strictEqual(fsEvents[2].name, PTN.UNLOAD_EVENT_END);
        assert.strictEqual(fsEvents[3].name, PTN.DOM_INTERACTIVE);
        assert.strictEqual(
          fsEvents[4].name,
          PTN.DOM_CONTENT_LOADED_EVENT_START
        );
        assert.strictEqual(fsEvents[5].name, PTN.DOM_CONTENT_LOADED_EVENT_END);
        assert.strictEqual(fsEvents[6].name, PTN.DOM_COMPLETE);
        assert.strictEqual(fsEvents[7].name, PTN.LOAD_EVENT_START);
        assert.strictEqual(fsEvents[8].name, PTN.LOAD_EVENT_END);

        assert.strictEqual(rsEvents.length, 9);
        assert.strictEqual(fsEvents.length, 11);
        assert.strictEqual(exporter.getFinishedSpans().length, 2);
        done();
      });
    });

    describe('AND window has information about server root span', () => {
      let spyGetElementsByTagName: any;
      beforeEach(() => {
        const element = {
          content: '00-ab42124a3c573678d4d8b21ba52df3bf-d21f7bc17caa5aba-01',
          getAttribute: (value: string) => {
            if (value === 'name') {
              return TRACE_PARENT_HEADER;
            }
            return undefined;
          },
        };

        spyGetElementsByTagName = sandbox.stub(
          window.document,
          'getElementsByTagName'
        );
        spyGetElementsByTagName.withArgs('meta').returns([element]);
      });
      afterEach(() => {
        spyGetElementsByTagName.restore();
      });

      it('should create a root span with server context traceId', done => {
        plugin.enable();
        setTimeout(() => {
          const rootSpan = exporter.getFinishedSpans()[0] as ReadableSpan;
          const fetchSpan = exporter.getFinishedSpans()[1] as ReadableSpan;
          assert.strictEqual(rootSpan.name, 'documentFetch');
          assert.strictEqual(fetchSpan.name, 'documentLoad');

          assert.strictEqual(
            rootSpan.spanContext().traceId,
            'ab42124a3c573678d4d8b21ba52df3bf'
          );
          assert.strictEqual(
            fetchSpan.spanContext().traceId,
            'ab42124a3c573678d4d8b21ba52df3bf'
          );

          assert.strictEqual(exporter.getFinishedSpans().length, 2);
          done();
        }, 100);
      });
    });
  });

  describe('when resource entries are available', () => {
    let spyEntries: any;
    beforeEach(() => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns(resources);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should create span for each of the resource', done => {
      plugin.enable();
      setTimeout(() => {
        const spanResource1 = exporter.getFinishedSpans()[1] as ReadableSpan;
        const spanResource2 = exporter.getFinishedSpans()[2] as ReadableSpan;

        const srEvents1 = spanResource1.events;
        const srEvents2 = spanResource2.events;

        assert.strictEqual(
          spanResource1.attributes[SemanticAttributes.HTTP_URL],
          'http://localhost:8090/bundle.js'
        );
        assert.strictEqual(
          spanResource2.attributes[SemanticAttributes.HTTP_URL],
          'http://localhost:8090/sockjs-node/info?t=1572620894466'
        );

        ensureNetworkEventsExists(srEvents1);
        ensureNetworkEventsExists(srEvents2);

        assert.strictEqual(exporter.getFinishedSpans().length, 4);
        done();
      });
    });
  });
  describe('when resource entries are available AND secureConnectionStart is 0', () => {
    let spyEntries: any;
    beforeEach(() => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns(resourcesNoSecureConnectionStart);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should create span for each of the resource', done => {
      plugin.enable();
      setTimeout(() => {
        const spanResource1 = exporter.getFinishedSpans()[1] as ReadableSpan;

        const srEvents1 = spanResource1.events;

        assert.strictEqual(
          spanResource1.attributes[SemanticAttributes.HTTP_URL],
          'http://localhost:8090/bundle.js'
        );

        assert.strictEqual(srEvents1[0].name, PTN.FETCH_START);
        assert.strictEqual(srEvents1[1].name, PTN.DOMAIN_LOOKUP_START);
        assert.strictEqual(srEvents1[2].name, PTN.DOMAIN_LOOKUP_END);
        assert.strictEqual(srEvents1[3].name, PTN.CONNECT_START);
        assert.strictEqual(srEvents1[4].name, PTN.SECURE_CONNECTION_START);
        assert.strictEqual(srEvents1[5].name, PTN.CONNECT_END);
        assert.strictEqual(srEvents1[6].name, PTN.REQUEST_START);
        assert.strictEqual(srEvents1[7].name, PTN.RESPONSE_START);
        assert.strictEqual(srEvents1[8].name, PTN.RESPONSE_END);

        assert.strictEqual(exporter.getFinishedSpans().length, 3);
        done();
      });
    });
  });

  describe('when navigation entries types are available and property "loadEventEnd" is missing', () => {
    let spyEntries: any;
    beforeEach(() => {
      const entriesWithoutLoadEventEnd = Object.assign({}, entries);
      delete entriesWithoutLoadEventEnd.loadEventEnd;
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entriesWithoutLoadEventEnd]);
      spyEntries.withArgs('resource').returns([]);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should still export rootSpan and fetchSpan', done => {
      plugin.enable();

      setTimeout(() => {
        const rootSpan = exporter.getFinishedSpans()[0] as ReadableSpan;
        const fetchSpan = exporter.getFinishedSpans()[1] as ReadableSpan;

        assert.strictEqual(rootSpan.name, 'documentFetch');
        assert.strictEqual(fetchSpan.name, 'documentLoad');

        assert.strictEqual(exporter.getFinishedSpans().length, 2);
        done();
      });
    });
  });

  function shouldExportCorrectSpan() {
    it('should export correct span with events', done => {
      plugin.enable();
      setTimeout(() => {
        const fetchSpan = exporter.getFinishedSpans()[0] as ReadableSpan;
        const rootSpan = exporter.getFinishedSpans()[1] as ReadableSpan;
        const fsEvents = fetchSpan.events;
        const rsEvents = rootSpan.events;

        assert.strictEqual(fetchSpan.name, 'documentFetch');
        assert.strictEqual(rootSpan.name, 'documentLoad');

        assert.strictEqual(
          rootSpan.attributes['http.url'],
          'http://localhost:9876/context.html'
        );
        assert.strictEqual(rootSpan.attributes['http.user_agent'], userAgent);

        ensureNetworkEventsExists(fsEvents);

        assert.strictEqual(rsEvents[0].name, PTN.FETCH_START);
        assert.strictEqual(rsEvents[1].name, PTN.UNLOAD_EVENT_START);
        assert.strictEqual(rsEvents[2].name, PTN.UNLOAD_EVENT_END);
        assert.strictEqual(rsEvents[3].name, PTN.DOM_INTERACTIVE);
        assert.strictEqual(
          rsEvents[4].name,
          PTN.DOM_CONTENT_LOADED_EVENT_START
        );
        assert.strictEqual(rsEvents[5].name, PTN.DOM_CONTENT_LOADED_EVENT_END);
        assert.strictEqual(rsEvents[6].name, PTN.DOM_COMPLETE);
        assert.strictEqual(rsEvents[7].name, PTN.LOAD_EVENT_START);
        assert.strictEqual(rsEvents[8].name, PTN.LOAD_EVENT_END);

        assert.strictEqual(fsEvents.length, 9);
        assert.strictEqual(rsEvents.length, 9);
        assert.strictEqual(exporter.getFinishedSpans().length, 2);
        done();
      });
    });
  }

  describe('when navigation entries types are NOT available then fallback to "performance.timing"', () => {
    const sandbox = sinon.createSandbox();
    beforeEach(() => {
      sandbox.stub(window.performance, 'getEntriesByType').value(undefined);
      sandbox.stub(window.performance, 'timing').get(() => {
        return entriesFallback;
      });
    });
    afterEach(() => {
      sandbox.restore();
    });

    shouldExportCorrectSpan();
  });

  describe('when getEntriesByType is not defined then fallback to "performance.timing"', () => {
    const sandbox = sinon.createSandbox();
    beforeEach(() => {
      sandbox.stub(window.performance, 'getEntriesByType').value(undefined);
      sandbox.stub(window.performance, 'timing').get(() => {
        return entriesFallback;
      });
    });
    afterEach(() => {
      sandbox.restore();
    });

    shouldExportCorrectSpan();
  });

  describe('when navigation entries types and "performance.timing" are NOT available', () => {
    const sandbox = sinon.createSandbox();
    beforeEach(() => {
      sandbox.stub(window.performance, 'getEntriesByType').value(undefined);
      sandbox.stub(window.performance, 'timing').get(() => {
        return undefined;
      });
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('should not create any span', done => {
      plugin.enable();
      setTimeout(() => {
        assert.ok(exporter.getFinishedSpans().length === 0);
        done();
      });
    });
  });

  describe('when fetchStart is negative still create spans', () => {
    const sandbox = sinon.createSandbox();
    beforeEach(() => {
      const navEntriesWithNegativeFetch = Object.assign({}, entries, {
        fetchStart: -1,
      });
      sandbox
        .stub(window.performance, 'getEntriesByType')
        .withArgs('navigation')
        .returns([navEntriesWithNegativeFetch])
        .withArgs('resource')
        .returns([])
        .withArgs('paint')
        .returns([]);

      sandbox.stub(window.performance, 'timing').get(() => {
        return undefined;
      });
    });
    afterEach(() => {
      sandbox.restore();
    });
    shouldExportCorrectSpan();
  });
});

/**
 * Represents a timed event.
 * A timed event is an event with a timestamp.
 */
interface TimedEvent {
  time: HrTime;
  /** The name of the event. */
  name: string;
  /** The attributes of the event. */
  attributes?: SpanAttributes;
}
