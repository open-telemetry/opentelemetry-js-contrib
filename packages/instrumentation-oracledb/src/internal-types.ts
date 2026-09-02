/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2025, 2026, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as api from '@opentelemetry/api';
import type * as oracledbTypes from 'oracledb';
import type { SpanConnectionConfig } from './types';

// onEnterFn returns this context with the span and timing data needed by
// onExitFn to end the span and record operation duration metrics.
export interface InstrumentationContext {
  span: api.Span;
  startTime?: api.HrTime;
}

// Captures the entire span data.
// This corresponds to js object filled by the 'oracledb' module
// See: https://github.com/oracle/node-oracledb/blob/main/lib/traceHandler.js
export interface TraceSpanData {
  operation: string; // RPC or exported function name.
  error?: oracledbTypes.DBError;
  connectLevelConfig: SpanConnectionConfig;
  callLevelConfig?: SpanCallLevelConfig;
  additionalConfig?: any; // custom key/values associated with a function.
  fn: Function; // Replaced with bind function associating the active context.
  args?: any[]; // input arguments passed to the exported function.

  /**
   * This value is filled by instrumented module inside 'onEnterFn',
   * 'onBeginRoundTrip' hook functions, which is passed back by oracledb module
   * in 'onExitFn' and 'onEndRoundTrip' hook functions respectively.
   */
  userContext: InstrumentationContext;
}

// Captures call level related span data
export interface SpanCallLevelConfig {
  statement?: string; // SQL stmt.
  operation?: string; // SQL op ('SELECT | INSERT ..').
  values?: any[]; // bind values.
}
