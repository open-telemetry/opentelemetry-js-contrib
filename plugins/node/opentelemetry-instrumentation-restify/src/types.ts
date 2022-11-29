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

import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface RestifyRequestInfo {
  request: any; // RestifyRequest object from restify package
}

/**
 * Function that can be used to add custom attributes to the current span
 * @param span - The restify handler span.
 * @param info - The restify request info object.
 */
export interface RestifyCustomAttributeFunction {
  (span: Span, info: RestifyRequestInfo): void;
}

/**
 * Options available for the restify Instrumentation
 */
export interface RestifyInstrumentationConfig extends InstrumentationConfig {
  /** Function for adding custom attributes to each handler span */
  requestHook?: RestifyCustomAttributeFunction;
}
