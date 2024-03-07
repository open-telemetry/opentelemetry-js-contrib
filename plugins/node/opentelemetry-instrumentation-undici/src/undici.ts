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
import * as diagch from 'diagnostics_channel';
import { URL } from 'url';

import {
  InstrumentationBase,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  Attributes,
  context,
  diag,
  Histogram,
  HrTime,
  INVALID_SPAN_CONTEXT,
  propagation,
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
  ValueType,
} from '@opentelemetry/api';

import { VERSION } from './version';

import {
  ListenerRecord,
  RequestHeadersMessage,
  RequestMessage,
  RequestTrailersMessage,
  ResponseHeadersMessage,
} from './internal-types';
import { UndiciInstrumentationConfig, UndiciRequest } from './types';
import { SemanticAttributes } from './enums/SemanticAttributes';
import {
  hrTime,
  hrTimeDuration,
  hrTimeToMilliseconds,
} from '@opentelemetry/core';

interface InstrumentationRecord {
  span: Span;
  attributes: Attributes;
  startTime: HrTime;
}

// A combination of https://github.com/elastic/apm-agent-nodejs and
// https://github.com/gadget-inc/opentelemetry-instrumentations/blob/main/packages/opentelemetry-instrumentation-undici/src/index.ts
export class UndiciInstrumentation extends InstrumentationBase {
  // Keep ref to avoid https://github.com/nodejs/node/issues/42170 bug and for
  // unsubscribing.
  private _channelSubs!: Array<ListenerRecord>;
  private _recordFromReq = new WeakMap<UndiciRequest, InstrumentationRecord>();

  private _httpClientDurationHistogram!: Histogram;
  constructor(config?: UndiciInstrumentationConfig) {
    super('@opentelemetry/instrumentation-undici', VERSION, config);
    this.setConfig(config);
  }

  // No need to instrument files/modules
  protected override init() {
    return undefined;
  }

  override disable(): void {
    if (!this._config.enabled) {
      return;
    }

    this._channelSubs.forEach(sub => sub.channel.unsubscribe(sub.onMessage));
    this._channelSubs.length = 0;
    this._config.enabled = false;
  }

  override enable(): void {
    if (this._config.enabled) {
      return;
    }
    this._config.enabled = true;

    // This method is called by the `InstrumentationAbstract` constructor before
    // ours is called. So we need to ensure the property is initalized
    this._channelSubs = this._channelSubs || [];
    this.subscribeToChannel(
      'undici:request:create',
      this.onRequestCreated.bind(this)
    );
    this.subscribeToChannel(
      'undici:client:sendHeaders',
      this.onRequestHeaders.bind(this)
    );
    this.subscribeToChannel(
      'undici:request:headers',
      this.onResponseHeaders.bind(this)
    );
    this.subscribeToChannel('undici:request:trailers', this.onDone.bind(this));
    this.subscribeToChannel('undici:request:error', this.onError.bind(this));
  }

  override setConfig(config?: UndiciInstrumentationConfig): void {
    super.setConfig(config);

    if (config?.enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }

  protected override _updateMetricInstruments() {
    this._httpClientDurationHistogram = this.meter.createHistogram(
      'http.client.request.duration',
      {
        description: 'Measures the duration of outbound HTTP requests.',
        unit: 's',
        valueType: ValueType.DOUBLE,
      }
    );
  }

  private _getConfig(): UndiciInstrumentationConfig {
    return this._config as UndiciInstrumentationConfig;
  }

  private subscribeToChannel(
    diagnosticChannel: string,
    onMessage: ListenerRecord['onMessage']
  ) {
    const channel = diagch.channel(diagnosticChannel);
    channel.subscribe(onMessage);
    this._channelSubs.push({
      name: diagnosticChannel,
      channel,
      onMessage,
    });
  }

  // This is the 1st message we receive for each request (fired after request creation). Here we will
  // create the span and populate some atttributes, then link the span to the request for further
  // span processing
  private onRequestCreated({ request }: RequestMessage): void {
    // Ignore if:
    // - instrumentation is disabled
    // - ignored by config
    // - method is 'CONNECT'
    const config = this._getConfig();
    const shouldIgnoreReq = safeExecuteInTheMiddle(
      () =>
        !config.enabled ||
        request.method === 'CONNECT' ||
        config.ignoreRequestHook?.(request),
      e => e && this._diag.error('caught ignoreRequestHook error: ', e),
      true
    );

    if (shouldIgnoreReq) {
      return;
    }

    const startTime = hrTime();
    const requestUrl = new URL(request.origin + request.path);
    const urlScheme = requestUrl.protocol.replace(':', '');
    const requestMethod = this.getRequestMethod(request.method);
    const attributes: Attributes = {
      [SemanticAttributes.HTTP_REQUEST_METHOD]: requestMethod,
      [SemanticAttributes.HTTP_REQUEST_METHOD_ORIGINAL]: request.method,
      [SemanticAttributes.URL_FULL]: requestUrl.toString(),
      [SemanticAttributes.URL_PATH]: requestUrl.pathname,
      [SemanticAttributes.URL_QUERY]: requestUrl.search,
      [SemanticAttributes.URL_SCHEME]: urlScheme,
    };

    const schemePorts: Record<string, string> = { https: '443', http: '80' };
    const serverAddress = requestUrl.hostname;
    const serverPort = requestUrl.port || schemePorts[urlScheme];

    attributes[SemanticAttributes.SERVER_ADDRESS] = serverAddress;
    if (serverPort && !isNaN(Number(serverPort))) {
      attributes[SemanticAttributes.SERVER_PORT] = Number(serverPort);
    }

    // Get user agent from headers
    let userAgent;
    if (Array.isArray(request.headers)) {
      const idx = request.headers.findIndex(h => h.toLowerCase() === 'user-agent');
      userAgent = request.headers[idx + 1];
    } else if (typeof request.headers === 'string') {
      const headers = request.headers.split('\r\n');
      const uaHeader = headers.find(h => h.toLowerCase().startsWith('user-agent'));
      userAgent = uaHeader && uaHeader.substring(uaHeader.indexOf(':') + 1).trim();
    }
    
    if (userAgent) {
      attributes[SemanticAttributes.USER_AGENT_ORIGINAL] = userAgent;
    }

    // Get attributes from the hook if present
    const hookAttributes = safeExecuteInTheMiddle(
      () => config.startSpanHook?.(request),
      e => e && this._diag.error('caught startSpanHook error: ', e),
      true
    );
    if (hookAttributes) {
      Object.entries(hookAttributes).forEach(([key, val]) => {
        attributes[key] = val;
      });
    }

    // Check if parent span is required via config and:
    // - if a parent is required but not present, we use a `NoopSpan` to still
    //   propagate context without recording it.
    // - create a span otherwise
    const activeCtx = context.active();
    const currentSpan = trace.getSpan(activeCtx);
    let span: Span;

    if (config.requireParentforSpans && !currentSpan) {
      span = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
    } else {
      span = this.tracer.startSpan(
        requestMethod === '_OTHER' ? 'HTTP' : requestMethod,
        {
          kind: SpanKind.CLIENT,
          attributes: attributes,
        },
        activeCtx
      );
    }

    // Execute the request hook if defined
    safeExecuteInTheMiddle(
      () => config.requestHook?.(span, request),
      e => e && this._diag.error('caught requestHook error: ', e),
      true
    );

    // Context propagation goes last so no hook can tamper
    // the propagation headers
    const requestContext = trace.setSpan(context.active(), span);
    const addedHeaders: Record<string, string> = {};
    propagation.inject(requestContext, addedHeaders);

    const headerEntries = Object.entries(addedHeaders);

    for (let i = 0; i < headerEntries.length; i++) {
      const [k, v] = headerEntries[i];

      if (typeof request.headers === 'string') {
        request.headers += `${k}: ${v}\r\n`;
      } else {
        request.addHeader(k, v);
      }
    }
    this._recordFromReq.set(request, { span, attributes, startTime });
  }

  // This is the 2nd message we receive for each request. It is fired when connection with
  // the remote is established and about to send the first byte. Here we do have info about the
  // remote address and port so we can populate some `network.*` attributes into the span
  private onRequestHeaders({ request, socket }: RequestHeadersMessage): void {
    const record = this._recordFromReq.get(request as UndiciRequest);

    if (!record) {
      return;
    }

    const config = this._getConfig();
    const { span } = record;
    const { remoteAddress, remotePort } = socket;
    const spanAttributes: Attributes = {
      [SemanticAttributes.NETWORK_PEER_ADDRESS]: remoteAddress,
      [SemanticAttributes.NETWORK_PEER_PORT]: remotePort,
    };

    // After hooks have been processed (which may modify request headers)
    // we can collect the headers based on the configuration
    if (config.headersToSpanAttributes?.requestHeaders) {
      const headersToAttribs = new Set(
        config.headersToSpanAttributes.requestHeaders.map(n => n.toLowerCase())
      );

      // headers could be in form 
      // ['name: value', ...] for v5
      // ['name', 'value', ...] for v6
      const rawHeaders = Array.isArray(request.headers) ? request.headers : request.headers.split('\r\n');
      rawHeaders.forEach((h, idx) => {
        const sepIndex = h.indexOf(':');
        const hasSeparator = sepIndex !== -1;
        const name = ((hasSeparator) ? h.substring(0, sepIndex) : h).toLowerCase();
        const value = hasSeparator ? h.substring(sepIndex + 1) : rawHeaders[idx + 1];

        if (headersToAttribs.has(name)) {
          spanAttributes[`http.request.header.${name}`] = value.trim();
        }
      });
    }

    span.setAttributes(spanAttributes);
  }

  // This is the 3rd message we get for each request and it's fired when the server
  // headers are received, body may not be accessible yet.
  // From the response headers we can set the status and content length
  private onResponseHeaders({
    request,
    response,
  }: ResponseHeadersMessage): void {
    const record = this._recordFromReq.get(request);

    if (!record) {
      return;
    }

    const { span, attributes } = record;
    // We are currently *not* capturing response headers, even though the
    // intake API does allow it, because none of the other `setHttpContext`
    // uses currently do
    const spanAttributes: Attributes = {
      [SemanticAttributes.HTTP_RESPONSE_STATUS_CODE]: response.statusCode,
    };

    const config = this._getConfig();
    const headersToAttribs = new Set();

    if (config.headersToSpanAttributes?.responseHeaders) {
      config.headersToSpanAttributes?.responseHeaders.forEach(name =>
        headersToAttribs.add(name.toLowerCase())
      );
    }

    for (let idx = 0; idx < response.headers.length; idx = idx + 2) {
      const name = response.headers[idx].toString().toLowerCase();
      const value = response.headers[idx + 1];

      if (headersToAttribs.has(name)) {
        spanAttributes[`http.response.header.${name}`] = value.toString();
      }

      if (name === 'content-length') {
        const contentLength = Number(value.toString());
        if (!isNaN(contentLength)) {
          spanAttributes['http.response.header.content-length'] = contentLength;
        }
      }
    }

    span.setAttributes(spanAttributes);
    span.setStatus({
      code:
        response.statusCode >= 400
          ? SpanStatusCode.ERROR
          : SpanStatusCode.UNSET,
    });
    record.attributes = Object.assign(attributes, spanAttributes);
  }

  // This is the last event we receive if the request went without any errors
  private onDone({ request, response }: RequestTrailersMessage): void {
    const record = this._recordFromReq.get(request);

    if (!record) {
      return;
    }

    const config = this._getConfig();
    const { span, attributes, startTime } = record;

    // Let the user apply custom attribs before ending the span
    safeExecuteInTheMiddle(
      () => config.applyCustomAttributesOnSpan?.(span, request, response),
      e =>
        e && this._diag.error('caught applyCustomAttributesOnSpan error: ', e),
      true
    );

    // End the span
    span.end();
    this._recordFromReq.delete(request);

    // Record metrics
    this.recordRequestDuration(attributes, startTime);
  }

  // This is the event we get when something is wrong in the request like
  // - invalid options when calling `fetch` global API or any undici method for request
  // - connectivity errors such as unreachable host
  // - requests aborted through an `AbortController.signal`
  // NOTE: server errors are considered valid responses and it's the lib consumer
  // who should deal with that.
  private onError({ request, error }: any): void {
    const record = this._recordFromReq.get(request);

    if (!record) {
      return;
    }

    const { span, attributes, startTime } = record;

    // NOTE: in `undici@6.3.0` when request aborted the error type changes from
    // a custom error (`RequestAbortedError`) to a built-in `DOMException` carrying
    // some differences:
    // - `code` is from DOMEXception (ABORT_ERR: 20)
    // - `message` changes
    // - stacktrace is smaller and contains node internal frames
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.end();
    this._recordFromReq.delete(request);

    // Record metrics (with the error)
    attributes[SemanticAttributes.ERROR_TYPE] = error.message;
    this.recordRequestDuration(attributes, startTime);
  }

  private recordRequestDuration(attributes: Attributes, startTime: HrTime) {
    // Time to record metrics
    const metricsAttributes: Attributes = {};
    // Get the attribs already in span attributes
    const keysToCopy = [
      SemanticAttributes.HTTP_RESPONSE_STATUS_CODE,
      SemanticAttributes.HTTP_REQUEST_METHOD,
      SemanticAttributes.SERVER_ADDRESS,
      SemanticAttributes.SERVER_PORT,
      SemanticAttributes.URL_SCHEME,
      SemanticAttributes.ERROR_TYPE,
    ];
    keysToCopy.forEach(key => {
      if (key in attributes) {
        metricsAttributes[key] = attributes[key];
      }
    });

    // Take the duration and record it
    const durationSeconds = hrTimeToMilliseconds(hrTimeDuration(startTime, hrTime())) / 1000;
    this._httpClientDurationHistogram.record(durationSeconds, metricsAttributes);
  }

  private getRequestMethod(original: string): string {
    const knownMethods = {
      CONNECT: true,
      OPTIONS: true,
      HEAD: true,
      GET: true,
      POST: true,
      PUT: true,
      PATCH: true,
      DELETE: true,
      TRACE: true,
    };

    if (original.toUpperCase() in knownMethods) {
      return original.toUpperCase();
    }

    return '_OTHER';
  }
}
