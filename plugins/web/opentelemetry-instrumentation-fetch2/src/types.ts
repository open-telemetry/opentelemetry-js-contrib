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
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import * as web from '@opentelemetry/sdk-trace-web';

/**
 * Hook function to be called after fetch is executed and before ending the span.
 * FIXME: The hook function doesn't have access to the fetch url if the request
 * is a RequestInit object
 */
export interface FetchInstrumentationExecutionResponseHook {
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

  /** Hook function to be called after fetch is executed and before ending the span.
    * This is useful for adding custom attributes to the span based on the fetch's
    * request and response
    */
  responseHook?: FetchInstrumentationExecutionResponseHook;
}
/**
 * Interface used to provide information to finish span on fetch response
 */
export interface FetchResponse {
  status: number;
  statusText?: string;
  url: string;
}

/**
 * Interface used to provide information to finish span on fetch error
 */
export interface FetchError {
  status?: number;
  message: string;
}

// TODO: This type is duplicated in resource-timing instrumenatation, how can it moved to a common place?
export interface SpanContextData {
  url: string;
  initiatorType: string;
  startTime: api.HrTime;
  endTime: api.HrTime;
  traceId: string;
  spanId: string;
}
