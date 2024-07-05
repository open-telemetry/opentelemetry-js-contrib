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
  safeExecuteInTheMiddle
} from '@opentelemetry/instrumentation';
import * as core from '@opentelemetry/core';
import * as web from '@opentelemetry/sdk-trace-web';
import { AttributeNames } from './enums/AttributeNames';
import { SEMATTRS_HTTP_URL, SEMATTRS_HTTP_HOST, SEMATTRS_HTTP_METHOD, SEMATTRS_HTTP_SCHEME, SEMATTRS_HTTP_STATUS_CODE, SEMATTRS_HTTP_USER_AGENT } from '@opentelemetry/semantic-conventions';
import { FetchError, FetchInstrumentationConfig, FetchResponse, SpanContextData } from './types';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { _globalThis } from '@opentelemetry/core';

const isNode = typeof process === 'object' && process.release?.name === 'node';
const RESOURCE_FETCH_INITIATED = '@opentelemetry/ResourceFetchInitiated'; // TODO: duplicated in resource-timing instrumentation




/**
 * This class represents a fetch plugin for auto instrumentation;
 *
 * // TODO: This instrumentation doesn't emit any info on the cors preflight request.
 * // The info about preflight request is only available through `PerformanceResourceTiming`
 * // which is in a separate `resource-timing` instrumentation. The `resource-timing`
 * // instrumentation does emit an Event for the preflight request, just there is no span
 * // for it. Should we leave it at this or a span is required?
 */
export class FetchInstrumentation extends InstrumentationBase {

  readonly version: string = PACKAGE_VERSION;
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
    startTime: api.HrTime,
    options: Partial<Request | RequestInit> = {}
  ): api.Span | undefined {
    if (core.isUrlIgnored(url, this._config.ignoreUrls)) {
      this._diag.debug('ignoring span as url matches ignored url');
      return;
    }
    const method = (options.method || 'GET').toUpperCase();
    const spanName = `HTTP ${method}`;
    return this.tracer.startSpan(spanName, {
      startTime: startTime,
      kind: api.SpanKind.CLIENT,
      attributes: {
        [SEMATTRS_HTTP_METHOD]: method,
        [SEMATTRS_HTTP_URL]: url,
      },
    });
  }
    /**
 * Finish span, add attributes.
 * @param span
 * @param endTime
 * @param response
 */
  private _endSpan(
    span: api.Span,
    response: FetchResponse,
    spanContextData: SpanContextData,
    endTime: api.HrTime
  ): Promise<void> {

    return new Promise((resolve, reject) => {
      try {
        spanContextData.endTime = endTime;
        document.dispatchEvent(new CustomEvent(RESOURCE_FETCH_INITIATED, {
          detail: spanContextData
        }));
        this._addFinalSpanAttributes(span, response);
        span.end(endTime);
      } finally {
        resolve();
      }
    });
  }

  private _executeResponseHook(
    span: api.Span,
    request: Request | RequestInit,
    result: Response | FetchError
  ) : Promise<void> {
    if (!this._config.responseHook) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      safeExecuteInTheMiddle(
        () => {
            this._config.responseHook?.(span, request, result);
        },
        err => {
          if (err) {
            this._diag.error('Error running response hook', err);
          }
        },
        true
      );
      resolve();

    });
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
    span.setAttribute(SEMATTRS_HTTP_STATUS_CODE, response.status);
    if (response.statusText != null) {
      span.setAttribute(AttributeNames.HTTP_STATUS_TEXT, response.statusText);
    }
    span.setAttribute(SEMATTRS_HTTP_HOST, parsedUrl.host);
    span.setAttribute(
      SEMATTRS_HTTP_SCHEME,
      parsedUrl.protocol.replace(':', '')
    );
    if (typeof navigator !== 'undefined') {
      span.setAttribute(
        SEMATTRS_HTTP_USER_AGENT,
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
        const startTime = core.hrTime();
        const createdSpan = plugin._createSpan(url, startTime, options);
        if (!createdSpan) {
          // url was ignored and no span was created, hence no need to wrap fetch
          return original.apply(this, args);
        }

        const spanContextData: SpanContextData = {
          initiatorType: "fetch",
          url: url,
          startTime: startTime,
          endTime: undefined as any,
          traceId: createdSpan.spanContext().traceId,
          spanId: createdSpan.spanContext().spanId
        }

        function endSpanOnError(span: api.Span, endTime: api.HrTime, error: FetchError): Promise<void> {
          return plugin._executeResponseHook(span, options, error)
            .then(() => {
              plugin._endSpan(span, {
                status: error.status || 0,
                statusText: error.message,
                url,
              }, spanContextData, endTime);
            });
        }

        function endSpanOnSuccess(span: api.Span, endTime: api.HrTime, response: Response): Promise<void> {
          return plugin._executeResponseHook(span, options, response)
            .then(() => {
              if (response.status >= 200 && response.status < 400) {
                plugin._endSpan(span, response, spanContextData, endTime);
              } else {
                plugin._endSpan(span, {
                  status: response.status,
                  statusText: response.statusText,
                  url,
                }, spanContextData, endTime);
              }
            })
        }

        function onSuccess(
          span: api.Span,
          resolve: (value: Response | PromiseLike<Response>) => void,
          response: Response
        ): Promise<void> {
          return new Promise(() => {
            // For client spans, the span should end at the earliest when the response is received
            // and not wait for the body to be read. However, since we need attributes that are based on the
            // response, we will proceed to read the body and end the span using a endTime that is now.
            const endTime = core.millisToHrTime(Date.now());

            const resClone = response.clone();
            const resClone4Hook = response.clone();
            const body = resClone.body;
            if (body) {
              const reader = body.getReader();
              const read = (): void => {
                // FIXME: Find out the entire body is ready is read; it will buffer the entire body in memory,
                // which might not be desirable for large responses.
                reader.read().then(
                  ({ done }) => {
                    if (done) {
                      endSpanOnSuccess(span, endTime, resClone4Hook)
                      .finally(() => {
                        resolve(response);
                      });
                    } else {
                      read();
                    }
                  },
                  error => {
                    endSpanOnError(span, endTime, error)
                    .finally(() => {
                      resolve(response);
                    });
                  }
                );
              };
              read();
            } else {
              // some older browsers don't have .body implemented
              endSpanOnSuccess(span, endTime, response)
              .finally(() => {
                resolve(response);
              });
            }
          })
        }


        function onError(
          span: api.Span,
          reject: (reason?: unknown) => void,
          error: FetchError
        ): Promise<void> {
          const endTime = core.millisToHrTime(Date.now());
          return endSpanOnError(span, endTime, error)
            .finally(() => {
              reject(error);
            });
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
