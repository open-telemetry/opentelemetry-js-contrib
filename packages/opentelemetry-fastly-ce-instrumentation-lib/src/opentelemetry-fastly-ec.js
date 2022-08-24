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
 *
 *
 *
 * Summary. Light weight OpenTelemetry tracing library for Fastly Compute@Edge.
 *
 * Description. This library enables auto trace instrumentation for the fetch function and manual instrumentation in the Fastly Compute@Edge.
 *
 * Typically an event listener for fetch looks per below:
 * addEventListener('fetch', event => event.respondWith(handleRequest(event)));
 *
 * Adding using the wrapper it would look like below instead:
 * addEventListener('fetch', event => event.respondWith(tracer.wrapper(handleRequest, event)));
 *
 * This assumes that this library is added with the following name:
 * const tracer = require('./opentelemetry-fastly-ec.js');
 *
 */

'use strict';

/**
 * set global variables and initiate object that contains the trace and associated information
 */

const INSTRUMENTATION_LIBRARY = 'compute@edge-js-v0.1';
const DEFAULT_SERVICE_NAME = 'C@E-service';

class Trace {
  myTrace = {};

  constructor() {
    // set span attributes
    this.reset();
  }

  /**
   * Wrapper that catches exceptions and make sure that error information is added to the traces.
   * Also initiates the trace object and auto instrumentation of the fetch function
   *
   * @param {function} funct The function that should be wrapped, typically the request handle function.
   * @param {object}   arg   The argument passed to the function that should be wrapped, must be the event send from the fetch listener.
   */

  wrapper = async function (funct, arg) {
    // create response object
    let responseObject;

    try {
      this.myTrace.resourceAttributes['fastly.hostname']['value'][
        'stringValue'
      ] = fastly.env.get('FASTLY_HOSTNAME');
      this.myTrace.resourceAttributes['fastly.service.id']['value'][
        'stringValue'
      ] = fastly.env.get('FASTLY_SERVICE_ID');
      this.myTrace.resourceAttributes['fastly.service.version']['value'][
        'stringValue'
      ] = fastly.env.get('FASTLY_SERVICE_VERSION');
    } catch (e) {
      // failed to set resource attributes from Fastly environment variables
    }
    try {
      // inititate tracing
      this.initTracer(arg);
      // call the wrapped function
      responseObject = await funct(arg);
      // ending main span
      this.myTrace.spans[this.myTrace.spanId].endTimeUnixNano =
        new Date().getTime() * 1000000;
      this.myTrace.spans[this.myTrace.spanId].status.code = 1;

      // send trace to configured exports
      arg.waitUntil(this.sendTrace());

      // add trace details in response header
      responseObject.headers.append(
        'server-timing',
        'traceparent;desc="00-' +
          this.myTrace.traceId +
          '-' +
          this.myTrace.spanId +
          '-01"'
      );
      responseObject.headers.append('timing-allowed-origin', '*');
      // return the response object from the wrapper
      return responseObject;
    } catch (e) {
      console.log(e);
      // set status code and add error details of current span at failure
      this.myTrace.spans[
        this.myTrace.currentSpanContext.spanId
      ].status.code = 2;
      this.myTrace.spans[
        this.myTrace.currentSpanContext.spanId
      ].status.message = e.name + ':' + e.message + '. Stack: ' + e.stack;
      const endTimestamp = new Date().getTime() * 1000000;
      this.myTrace.spans[
        this.myTrace.currentSpanContext.spanId
      ].endTimeUnixNano = endTimestamp;

      // finalize other ongoing spans with details
      for (const [key] of Object.entries(this.myTrace.spans)) {
        if (this.myTrace.spans[key].endTimeUnixNano === 0) {
          this.myTrace.spans[key].endTimeUnixNano = endTimestamp;
          this.myTrace.spans[key].status.code = 2;
          this.myTrace.spans[key].status.message =
            e.name + ':' + e.message + '. Stack: ' + e.stack;
        }
      }

      // send trace to configured exports
      arg.waitUntil(this.sendTrace());

      // add trace details in response header
      let headers = new Headers({
        'server-timing':
          'traceparent;desc="00-' +
          this.myTrace.traceId +
          '-' +
          this.myTrace.spanId +
          '-01"',
        'timing-allowed-origin': '*',
      });

      responseObject = new Response('', {
        status: 500,
        headers,
      });

      // return the response object from the wrapper
      return responseObject;
    }
  };

  /**
   * Initiates the trace object and auto instrumentation of the fetch function
   *
   * @param {object} event   The argument passed to the function that should be wrapped, must be the event send from the fetch listener.
   */

  initTracer = function (event) {
    let traceId;
    let parentSpanId;
    // get traceparent header if any
    let traceparentHeader = event.request.headers.get('traceparent');
    // add detail from traceparent header if any
    if (
      traceparentHeader !== undefined &&
      traceparentHeader !== null &&
      traceparentHeader !== ''
    ) {
      let arrTraceparentHeader = traceparentHeader.split('-');
      if (arrTraceparentHeader.length === 4) {
        if (arrTraceparentHeader[1].length === 32) {
          traceId = arrTraceparentHeader[1];
        } else {
          traceId = this.generateId(32);
        }
        if (arrTraceparentHeader[2].length === 16) {
          parentSpanId = arrTraceparentHeader[2];
        } else {
          parentSpanId = '';
        }
      } else {
        traceId = this.generateId(32);
        parentSpanId = '';
      }
    } else {
      traceId = this.generateId(32);
      parentSpanId = '';
    }
    // set trace id for the tracing
    this.myTrace.traceId = traceId;
    // start the main span

    let myMainSpan = this.startSpan('C@E-Main', {
      kind: 2,
      parentSpanId: parentSpanId,
      allowAsParent: true,
    });
    // set spand id for the main span
    this.myTrace.spanId = myMainSpan.getSpanId();
    // replace fetch function to auto create span
    this.myTrace.fetch = fetch;
    // version without proxy
    fetch = this.instrumentedFetch.bind(this);
  };

  /**
   * Instrumented fetch function
   *
   * @param {object} request       request object.
   * @param {object} properties    propertied for the request.
   */

  instrumentedFetch = async function (request, properties) {
    // set default span parameters
    let myRequestDetails = {
      backend: '',
      url: 'https://opentelemetry.io/',
      method: 'GET',
    };
    // get span parameters from request
    if (request['url']) {
      myRequestDetails.url = request['url'];
    } else {
      myRequestDetails.url = request;
    }
    if (request['method']) {
      myRequestDetails.method = request['method'];
    }
    myRequestDetails['backend'] = properties['backend'];

    // auto intrument requests, start new span

    let fetchSpan = this.startSpan(
      'C@E-Fetch-' + new URL(myRequestDetails.url).hostname,
      {
        kind: 3,
        parentSpanId: this.myTrace.currentSpanContext.spanId,
        allowAsParent: false,
      }
    );

    // sets trace information in request header
    if (typeof request === 'string') {
      request = new Request(request, {
        headers: new Headers({}),
      });
    }

    // set traceparent header
    request.headers.set(
      'traceparent',
      '00-' + this.myTrace.traceId + '-' + fetchSpan.getSpanId() + '-01'
    );

    // set span attributes for the request
    fetchSpan.setAttribute('http.url', myRequestDetails.url);
    fetchSpan.setAttribute('http.method', myRequestDetails.method);
    let response = await this.myTrace.fetch(request, properties);
    // set span attribute for the response
    fetchSpan.setAttribute('http.status_code', response.status);
    if (response.status < 400) {
      fetchSpan.setStatus(1);
    } else {
      fetchSpan.setStatus(2);
    }
    // end span
    fetchSpan.end();

    // create new response object and add the span id as a property
    let myResponse = response;
    myResponse['spanId'] = fetchSpan.getSpanId();

    return myResponse;
  };

  /**
   * Starts a new span with the name passed to the function.
   *
   * @param {string} strSpanName The name of the span to be created.
   */

  startSpan = function (strSpanName, spanOptions = {}) {
    const constructOptions = {
      spanId: this.generateId(16),
      traceId: this.myTrace.traceId,
      name: strSpanName,
      parentSpanId:
        spanOptions.parentSpanId || this.myTrace.currentSpanContext.spanId,
      kind: spanOptions.kind || 1,
      startTimeUnixNano: new Date().getTime() * 1000000,
      endTimeUnixNano: 0,
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      attributes: [],
      status: { code: 0 },
      events: [],
      allowAsParent: spanOptions.allowAsParent !== false,
    };

    this.myTrace.spans[constructOptions.spanId] = constructOptions;

    let newSpan = new this.Span(constructOptions.spanId, this.myTrace);

    if (spanOptions.allowAsParent) {
      this.myTrace.currentSpanContext = {
        traceId: this.myTrace.traceId,
        spanId: constructOptions.spanId,
        traceFlag: '00',
        traceState: {},
      };
    }

    return newSpan;
  };

  /**
   * Sets a resource attribute for all generated traces
   *
   * @param {string}            key   The key for the value pair
   * @param {string or integer} value The value for the value pair
   */

  logWrapper = function (obj, myTrace = this.myTrace) {
    obj.myTrace = myTrace;
    obj.log = (function (logWrap) {
      return function () {
        try {
          let myMessage = JSON.parse(arguments[0]);
          if (!myMessage.event.properties) {
            myMessage.event.properties = {};
          }
          myMessage.event.properties.trace_id = this.myTrace.traceId;
          myMessage.event.properties.span_id =
            this.myTrace.currentSpanContext.spanId;
          myMessage.event.properties.trace_flags = '00';
          arguments[0] = JSON.stringify(myMessage);
        } catch (e) {
          // log message is not json and trace details will not be added
        }
        return logWrap.apply(this, arguments);
      };
    })(obj.log);
  };

  /**
   * Sets a resource attribute for all generated traces
   *
   * @param {string}            key   The key for the value pair
   * @param {string or integer} value The value for the value pair
   */

  setResourceAttribute = function (key, value) {
    let myResourceAttribute = {
      key: key,
      value: {},
    };
    let valueType;
    if (typeof value === 'number') {
      valueType = 'intValue';
    } else if (typeof value === 'string') {
      valueType = 'stringValue';
    } else {
      value = 'NO_STRING_OR_NUMBER';
      valueType = 'stringValue';
    }
    myResourceAttribute.value[valueType] = value;
    this.myTrace.resourceAttributes[key] = myResourceAttribute;
  };

  /**
   * Gets the current span as an object
   */

  getCurrentSpan = function (myTrace = this.myTrace) {
    return new this.Span(this.myTrace.currentSpanContext.spanId, myTrace);
  };

  /**
   * Gets span as an object
   */

  getSpanById = function (spanId, myTrace = this.myTrace) {
    return new this.Span(spanId, myTrace);
  };

  /**
   * Returns the traceid
   */

  getTraceId = function () {
    return this.myTrace.traceId;
  };

  /**
   * Returns the id of current span.
   */

  getCurrentSpanId = function () {
    return this.myTrace.currentSpanContext.spanId;
  };

  /**
   * Returns the name of the current span.
   */

  getCurrentSpanName = function () {
    return this.myTrace.spans[this.myTrace.currentSpanContext.spanId].name;
  };

  /**
   * Sets if trace json object should be output to stdout
   * @param {boolean} tracetoStdOut true if the trace json object should be output to stdout
   */

  outputTracetoStdOut = function (tracetoStdOut) {
    this.myTrace.traceToStdOut = tracetoStdOut;
  };

  /**
   * Sets the backend to use for trace delivery (OpenTelemetry Collector)
   * @param {string} otelCollectorBackend the fastly backend for the OpenTelemetry collector
   */

  setOtelCollectorBackend = function (otelCollectorBackend) {
    this.myTrace.otelCollectorBackend = otelCollectorBackend;
  };

  /**
   * Sets the backend URL to use for trace delivery (OpenTelemetry Collector)
   * @param {string} otelCollectorUrl the URL to the trace endpoint of the OpenTelemetry collector
   */

  setOtelCollectorUrl = function (otelCollectorUrl) {
    this.myTrace.otelCollectorUrl = otelCollectorUrl;
  };

  /**
   * Sets the user credentials the for trace delivery (OpenTelemetry Collector)
   * @param {string} credentials the credentials for the OpenTelemetry collector base64 encoded (for basic authentication)
   */

  setOtelCollectorUserCredentials = function (otelCollectorUserCredentials) {
    this.myTrace.otelCollectorUserCredentials = otelCollectorUserCredentials;
  };

  /**
   * Returns the otlp object that is genreated when the tracing is finalized.
   */

  getOtlpOutput = function () {
    return this.myTrace.otlpOutput;
  };

  /**
   * Reset the trace object
   */

  reset = function () {
    this.myTrace = {
      otelCollectorUrl: '',
      otelCollectorBackend: '',
      otelCollectorUserCredentials: '',
      traceId: '',
      spanId: '',
      currentSpanContext: {},
      instrumentationLibrary: INSTRUMENTATION_LIBRARY,
      resourceAttributes: {
        'service.name': {
          key: 'service.name',
          value: {
            stringValue: DEFAULT_SERVICE_NAME,
          },
        },
        'fastly.hostname': {
          key: 'fastly.hostname',
          value: {
            stringValue: 'n/a',
          },
        },
        'fastly.service.id': {
          key: 'fastly.service.id',
          value: {
            stringValue: 'n/a',
          },
        },
        'fastly.service.version': {
          key: 'fastly.service.version',
          value: {
            stringValue: 'n/a',
          },
        },
      },
      spans: {},
      traceToStdOut: false,
      fetch: '',
      otlpOutput: {},
    };
  };

  /**
   * Sends the traces to the trace collector backend (OpenTelemetry Collector)
   */

  sendTrace = function () {
    let myOtlpPackage = this.generateOtlpPackage();

    // output trace object to stdout if configured
    if (this.myTrace.traceToStdOut) console.log(JSON.stringify(myOtlpPackage));

    if (
      this.myTrace.otelCollectorUrl !== '' &&
      this.myTrace.otelCollectorBackend !== ''
    ) {
      // send traces to collector
      let cacheOverride = new CacheOverride('pass');
      let requestHeaders = new Headers({
        'Content-Type': 'application/json',
      });
      if (this.myTrace.otelCollectorUserCredentials !== '') {
        requestHeaders.set(
          'Authorization',
          'Basic ' + this.myTrace.otelCollectorUserCredentials
        );
      }
      let backendRequest = new Request(this.myTrace.otelCollectorUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(myOtlpPackage),
      });
      return this.myTrace.fetch(backendRequest, {
        backend: this.myTrace.otelCollectorBackend,
        cacheOverride,
      });
    } else {
      return;
    }
  };

  /**
   * Generates random strings for traces id (32) or span id (16).
   *
   * @param {integer} intLength Length of the string that should be generated.
   */

  generateId = function (intLength) {
    return [...Array(intLength)]
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('');
  };

  /**
   * Span object that contains functions for setting attributes and ending a span.
   *
   * @param {string} spanId The id of the created span.
   */

  Span = class {
    #spanId;
    #myTrace;

    constructor(spanId, myTrace) {
      // set span attributes
      this.#spanId = spanId;
      this.#myTrace = myTrace;
    }
    // function for ending a span
    end = function () {
      // set end time in nanoseconds
      this.#myTrace.spans[this.#spanId].endTimeUnixNano =
        new Date().getTime() * 1000000;
      // set status of span
      if (this.#myTrace.spans[this.#spanId].status.code === 0) {
        this.#myTrace.spans[this.#spanId].status.code = 1;
      }
      // update current span to parent
      if (this.#myTrace.spans[this.#spanId].allowAsParent) {
        this.#myTrace.currentSpanContext = this.getParentSpanContext();
      }
    };
    // function for setting attribute
    setAttribute = function (key, value) {
      let myAttribute = {
        key: key,
        value: {},
      };
      let valueType;
      if (typeof value === 'number') {
        valueType = 'intValue';
      } else if (typeof value === 'string') {
        valueType = 'stringValue';
      } else {
        value = 'NO_STRING_OR_NUMBER';
        valueType = 'stringValue';
      }
      myAttribute.value[valueType] = value;
      this.#myTrace.spans[this.#spanId].attributes.push(myAttribute);
    };
    setKind = function (kind) {
      this.#myTrace.spans[this.#spanId].kind = kind;
    };
    setStatus = function (status) {
      this.#myTrace.spans[this.#spanId].status.code = status;
    };
    getSpanId = function () {
      return this.#spanId;
    };
    getParentSpanContext = function () {
      return {
        traceId: this.#myTrace.traceId,
        spanId: this.#myTrace.spans[this.#spanId].parentSpanId,
        traceFlag: '00',
        traceState: {},
      };
    };
    updateName = function (newName) {
      this.#myTrace.spans[this.#spanId].name = newName;
    };
    getSpanDetails = function () {
      return this.#myTrace.spans[this.#spanId];
    };
  };

  /**
   * Generates a trace object in otlp format (json)
   *
   */

  generateOtlpPackage = function () {
    let myOtlpPackage = {};
    myOtlpPackage.resourceSpans = [];
    let myResourceSpan = {};
    myResourceSpan.resource = {};
    let myResourceAttributes = [];
    for (const [key] of Object.entries(this.myTrace.resourceAttributes)) {
      let myResourceAttribute = this.myTrace.resourceAttributes[key];
      myResourceAttributes.push(myResourceAttribute);
    }
    myResourceSpan.resource.attributes = myResourceAttributes;
    let myInstrumentationLibrarySpans = [];
    let myInstrumentationLibrarySpan = {};
    let mySpans = [];
    for (const [key] of Object.entries(this.myTrace.spans)) {
      delete this.myTrace.spans[key]['allowAsParent'];
      let mySpan = this.myTrace.spans[key];
      mySpans.push(mySpan);
    }
    myInstrumentationLibrarySpan.spans = mySpans;
    myInstrumentationLibrarySpan.instrumentationLibrary = {};
    myInstrumentationLibrarySpan.instrumentationLibrary.name =
      this.myTrace.instrumentationLibrary;
    myInstrumentationLibrarySpans.push(myInstrumentationLibrarySpan);
    myResourceSpan.instrumentationLibrarySpans = myInstrumentationLibrarySpans;
    myOtlpPackage.resourceSpans.push(myResourceSpan);

    this.myTrace.otlpOutput = myOtlpPackage;
    return myOtlpPackage;
  };
}

module.exports = Trace;
