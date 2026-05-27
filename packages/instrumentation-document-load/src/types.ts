/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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

  /** Ignore adding network events as span events for document fetch and resource fetch spans.
   * This instrumentation will send the following span events by default:
   * connectEnd
   * connectStart
   * decodedBodySize
   * domComplete
   * domContentLoadedEventEnd
   * domContentLoadedEventStart
   * domInteractive
   * domainLookupEnd
   * domainLookupStart
   * encodedBodySize
   * fetchStart
   * loadEventEnd
   * loadEventStart
   * navigationStart
   * redirectEnd
   * redirectStart
   * requestStart
   * responseEnd
   * responseStart
   * secureConnectionStart
   * unloadEventEnd
   * unloadEventStart
   */
  ignoreNetworkEvents?: boolean;

  /** Ignore adding performance paint span events on document load spans
   * This instrumentation will send the following span events by default:
   * firstContentfulPaint
   * firstPaint
   */
  ignorePerformancePaintEvents?: boolean;

  /** Select the HTTP semantic conventions version(s) used. */
  semconvStabilityOptIn?: string;
}
