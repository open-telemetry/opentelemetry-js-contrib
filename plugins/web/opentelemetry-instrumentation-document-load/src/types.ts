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

export interface DocumentLoadCustomAttributeFunction {
  (span: Span): void;
}

export interface ResourceFetchCustomAttributeFunction {
  (span: Span, resource: PerformanceResourceTiming): void;
}

/**
 * DocumentLoadInstrumentationPlugin Config
 */
export interface DocumentLoadInstrumentationConfig
  extends InstrumentationConfig {
  /** Function for adding custom attributes on the document load, document fetch and or resource fetch spans */
  applyCustomAttributesOnSpan?: {
    documentLoad?: DocumentLoadCustomAttributeFunction;
    documentFetch?: DocumentLoadCustomAttributeFunction;
    resourceFetch?: ResourceFetchCustomAttributeFunction;
  };
}
