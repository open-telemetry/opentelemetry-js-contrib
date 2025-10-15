/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2025, Oracle and/or its affiliates.
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

import type * as oracledbTypes from 'oracledb';
import type * as api from '@opentelemetry/api';
import { SpanConnectionConfig } from './types';

// onEnterFn returns this Context(contains only span for now) and it is
// received in onExitFn to end the span.
export interface InstrumentationContext {
  span: api.Span;
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
