/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Span } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

// Currently missing in typescript DOM definitions
export interface PerformanceLongTaskTiming extends PerformanceEntry {
  attribution: TaskAttributionTiming[];
}

export interface TaskAttributionTiming extends PerformanceEntry {
  containerType: string;
  containerSrc: string;
  containerId: string;
  containerName: string;
}

export interface ObserverCallbackInformation {
  longtaskEntry: PerformanceLongTaskTiming;
}

export type ObserverCallback = (
  span: Span,
  information: ObserverCallbackInformation
) => void;

export interface LongtaskInstrumentationConfig extends InstrumentationConfig {
  /** Callback for adding custom attributes to span */
  observerCallback?: ObserverCallback;
}
