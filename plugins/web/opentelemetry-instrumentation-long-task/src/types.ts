import type { SpanAttributes } from "@opentelemetry/api";
import type { InstrumentationConfig } from "@opentelemetry/instrumentation";

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

export type ObserverCallback = (entry: PerformanceLongTaskTiming) => SpanAttributes;

export interface LongtaskInstrumentationConfig extends InstrumentationConfig {
  observerCallback?: ObserverCallback;
}
