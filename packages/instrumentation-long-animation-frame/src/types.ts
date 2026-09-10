/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Span } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

// Currently missing in TypeScript DOM definitions.
// https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming
export interface PerformanceLongAnimationFrameTiming extends PerformanceEntry {
  renderStart: DOMHighResTimeStamp;
  styleAndLayoutStart: DOMHighResTimeStamp;
  blockingDuration: DOMHighResTimeStamp;
  firstUIEventTimestamp: DOMHighResTimeStamp;
  scripts: PerformanceScriptTiming[];
}

// https://developer.mozilla.org/en-US/docs/Web/API/PerformanceScriptTiming
export interface PerformanceScriptTiming extends PerformanceEntry {
  invokerType: string;
  invoker: string;
  executionStart: DOMHighResTimeStamp;
  sourceURL: string;
  sourceFunctionName: string;
  sourceCharPosition: number;
  pauseDuration: DOMHighResTimeStamp;
  forcedStyleAndLayoutDuration: DOMHighResTimeStamp;
  windowAttribution: string;
  window: Window | null;
}

export interface ObserverCallbackInformation {
  longAnimationFrameEntry: PerformanceLongAnimationFrameTiming;
}

export type ObserverCallback = (
  span: Span,
  information: ObserverCallbackInformation
) => void;

export interface LongAnimationFrameInstrumentationConfig
  extends InstrumentationConfig {
  /** Callback for adding custom attributes to span */
  observerCallback?: ObserverCallback;
}
