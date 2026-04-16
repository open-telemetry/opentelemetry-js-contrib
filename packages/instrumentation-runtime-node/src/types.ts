/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Attributes } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface RuntimeNodeInstrumentationConfig
  extends InstrumentationConfig {
  monitoringPrecision?: number;
  /**
   * Capture uncaught exceptions via process 'uncaughtExceptionMonitor' event.
   * Disabled by default.
   * @experimental
   */
  captureUncaughtException?: boolean;
  /**
   * Add custom attributes to the emitted exception log records.
   * @experimental
   */
  applyCustomAttributes?: (
    error: unknown,
    eventType: 'uncaughtException'
  ) => Attributes;
}
