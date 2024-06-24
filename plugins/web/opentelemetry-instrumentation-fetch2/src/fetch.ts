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

import * as api from '@opentelemetry/api';
import {
  isWrapped,
  InstrumentationBase,
  InstrumentationConfig,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import * as core from '@opentelemetry/core';
import * as web from '@opentelemetry/sdk-trace-web';
import { AttributeNames } from './enums/AttributeNames';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { FetchError, FetchResponse, SpanData } from './types';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { _globalThis } from '@opentelemetry/core';

const isNode = typeof process === 'object' && process.release?.name === 'node';

export interface FetchCustomAttributeFunction {
  (
    span: api.Span,
    request: Request | RequestInit,
    result: Response | FetchError
  ): void;
}

/**
 * FetchPlugin Config
 */
export interface FetchInstrumentationConfig extends InstrumentationConfig {
  // urls which should include trace headers when origin doesn't match
  propagateTraceHeaderCorsUrls?: web.PropagateTraceHeaderCorsUrls;
  /**
   * URLs that partially match any regex in ignoreUrls will not be traced.
   * In addition, URLs that are _exact matches_ of strings in ignoreUrls will
   * also not be traced.
   */
  ignoreUrls?: Array<string | RegExp>;
  /** Function for adding custom attributes on the span */
  applyCustomAttributesOnSpan?: FetchCustomAttributeFunction;
}

/**
 * This class represents a fetch plugin for auto instrumentation
 */
export class FetchInstrumentation extends InstrumentationBase {
  readonly component: string = 'fetch';
  readonly version: string = PACKAGE_VERSION;
  moduleName = this.component;
  override _config!: FetchInstrumentationConfig;


  constructor(config: FetchInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  init(): void {}

  /**
   * Creates a new span
   * @param url
   * @param options
   */
  private _createSpan(
    url: string,
    options: Partial<Request | RequestInit> = {}
  ): api.Span | undefined {
    if (core.isUrlIgnored(url, this._config.ignoreUrls)) {
      this._diag.debug('ignoring span as url matches ignored url');
      return;
    }
    const method = (options.method || 'GET').toUpperCase();
    const spanName = `HTTP ${method}`;
    return this.tracer.startSpan(spanName, {
      kind: api.SpanKind.CLIENT,
      attributes: {
        [AttributeNames.COMPONENT]: this.moduleName,
        [SemanticAttributes.HTTP_METHOD]: method,
        [SemanticAttributes.HTTP_URL]: url,
      },
    });
  }

    /**
   * Finish span, add attributes.
   * @param span
   * @param spanData
   * @param response
   */
    private _endSpan(
      span: api.Span,
      spanData: SpanData,
      response: FetchResponse,
      endTime?: api.HrTime
    ) {
      this._addFinalSpanAttributes(span, response);
  
      setTimeout(() => {
        span.end(endTime);
      }, 0);
    }
  
  /**
   * Adds more attributes to span just before ending it
   * @param span
   * @param response
   */
  private _addFinalSpanAttributes(
    span: api.Span,
    response: FetchResponse
  ): void {
    const parsedUrl = web.parseUrl(response.url);
    span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, response.status);
    if (response.statusText != null) {
      span.setAttribute(AttributeNames.HTTP_STATUS_TEXT, response.statusText);
    }
    span.setAttribute(SemanticAttributes.HTTP_HOST, parsedUrl.host);
    span.setAttribute(
      SemanticAttributes.HTTP_SCHEME,
      parsedUrl.protocol.replace(':', '')
    );
    if (typeof navigator !== 'undefined') {
      span.setAttribute(
        SemanticAttributes.HTTP_USER_AGENT,
        navigator.userAgent
      );
    }
  }


    /**
   * Propagates trace context through request headers
   * @param options
   * @param spanUrl
   */
    private propagateTraceContext(options: Request | RequestInit, spanUrl: string): void {
      if (
        !web.shouldPropagateTraceHeaders(
          spanUrl,
          this._config.propagateTraceHeaderCorsUrls
        )
      ) {
        const headers: Partial<Record<string, unknown>> = {};
        api.propagation.inject(api.context.active(), headers);
        if (Object.keys(headers).length > 0) {
          this._diag.debug('headers inject skipped due to CORS policy');
        }
        return;
      }
  
      if (options instanceof Request) {
        api.propagation.inject(api.context.active(), options.headers, {
          set: (h, k, v) => h.set(k, typeof v === 'string' ? v : String(v)),
        });
      } else if (options.headers instanceof Headers) {
        api.propagation.inject(api.context.active(), options.headers, {
          set: (h, k, v) => h.set(k, typeof v === 'string' ? v : String(v)),
        });
      } else if (options.headers instanceof Map) {
        api.propagation.inject(api.context.active(), options.headers, {
          set: (h, k, v) => h.set(k, typeof v === 'string' ? v : String(v)),
        });
      } else {
        const headers: Partial<Record<string, unknown>> = {};
        api.propagation.inject(api.context.active(), headers);
        options.headers = Object.assign({}, headers, options.headers || {});
      }
    }

  /**
   * Patches the constructor of fetch
   */
  private _patchConstructor(): (original: typeof fetch) => typeof fetch {
    return original => {
      const plugin = this;
      return function patchConstructor(
        this: typeof globalThis,
        ...args: Parameters<typeof fetch>
      ): Promise<Response> {
        const self = this;
        const url = web.parseUrl(
          args[0] instanceof Request ? args[0].url : String(args[0])
        ).href;

        const options = args[0] instanceof Request ? args[0] : args[1] || {};
        const createdSpan = plugin._createSpan(url, options);
        if (!createdSpan) {
          return original.apply(this, args);
        }
        const spanData = plugin._prepareSpanData(url);

        function endSpanOnError(span: api.Span, endTime: api.HrTime, error: FetchError) {
          plugin._applyAttributesAfterFetch(span, options, error);
          plugin._endSpan(span, spanData, {
            status: error.status || 0,
            statusText: error.message,
            url,
          }, endTime);
        }

        function endSpanOnSuccess(span: api.Span, endTime: api.HrTime, response: Response) {
          plugin._applyAttributesAfterFetch(span, options, response);
          if (response.status >= 200 && response.status < 400) {
            plugin._endSpan(span, spanData, response);
          } else {
            plugin._endSpan(span, spanData, {
              status: response.status,
              statusText: response.statusText,
              url,
            }, endTime);
          }
        }

        function onSuccess(
          span: api.Span,
          resolve: (value: Response | PromiseLike<Response>) => void,
          response: Response
        ): void {
          // For client spans, the span should end at the earliest when the response is received
          // and not wait for the body to be read. However, since we need attributes that are based on the
          // response, we will proceed to read the body and end the span using a endTime that is now.
          const endTime = core.millisToHrTime(Date.now());

          try {
            const resClone = response.clone();
            const resClone4Hook = response.clone();
            const body = resClone.body;
            if (body) {
              const reader = body.getReader();
              const read = (): void => {
                reader.read().then(
                  ({ done }) => {
                    if (done) {
                      endSpanOnSuccess(span, endTime, resClone4Hook);
                    } else {
                      read();
                    }
                  },
                  error => {
                    endSpanOnError(span, endTime, error);
                  }
                );
              };
              read();
            } else {
              // some older browsers don't have .body implemented
              endSpanOnSuccess(span, endTime, response);
            }
          } finally {
            resolve(response);
          }
        }

        function onError(
          span: api.Span,
          reject: (reason?: unknown) => void,
          error: FetchError
        ) {
          const endTime = core.millisToHrTime(Date.now());
          try {
            endSpanOnError(span, endTime, error);
          } finally {
            reject(error);
          }
        }

        return new Promise((resolve, reject) => {
          return api.context.with(
            api.trace.setSpan(api.context.active(), createdSpan),
            () => {
              plugin.propagateTraceContext(options, url);
              // TypeScript complains about arrow function captured a this typed as globalThis
              // ts(7041)
              return original
                .apply(
                  self,
                  options instanceof Request ? [options] : [url, options]
                )
                .then(
                  onSuccess.bind(self, createdSpan, resolve),
                  onError.bind(self, createdSpan, reject)
                );
            }
          );
        });
      };
    };
  }

  private _applyAttributesAfterFetch(
    span: api.Span,
    request: Request | RequestInit,
    result: Response | FetchError
  ) {
    const applyCustomAttributesOnSpan =
      this._config.applyCustomAttributesOnSpan;
    if (applyCustomAttributesOnSpan) {
      safeExecuteInTheMiddle(
        () => applyCustomAttributesOnSpan(span, request, result),
        error => {
          if (!error) {
            return;
          }

          this._diag.error('applyCustomAttributesOnSpan', error);
        },
        true
      );
    }
  }

  /**
   * Prepares a span data - needed later for matching appropriate network
   *     resources
   * @param spanUrl
   */
  private _prepareSpanData(spanUrl: string): SpanData {
    const startTime = core.hrTime();
    return { startTime, spanUrl };
  }

  /**
   * implements enable function
   */
  override enable(): void {
    if (isNode) {
      // Node.js v18+ *does* have a global `fetch()`, but this package does not
      // support instrumenting it.
      this._diag.warn(
        "this instrumentation is intended for web usage only, it does not instrument Node.js's fetch()"
      );
      return;
    }
    if (isWrapped(fetch)) {
      this._unwrap(_globalThis, 'fetch');
      this._diag.debug('removing previous patch for constructor');
    }
    this._wrap(_globalThis, 'fetch', this._patchConstructor());
  }

  /**
   * implements unpatch function
   */
  override disable(): void {
    if (isNode) {
      return;
    }
    this._unwrap(_globalThis, 'fetch');
  }
}
