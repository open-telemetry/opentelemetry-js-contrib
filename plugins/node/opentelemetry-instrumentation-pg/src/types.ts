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

import type * as pgTypes from 'pg';
import type * as api from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface PgResponseHookInformation {
  data: pgTypes.QueryResult | pgTypes.QueryArrayResult;
}

export interface PgInstrumentationExecutionResponseHook {
  (span: api.Span, responseInfo: PgResponseHookInformation): void;
}

export interface PgInstrumentationConfig extends InstrumentationConfig {
  /**
   * If true, additional information about query parameters will be attached (as `attributes`) to spans representing
   */
  enhancedDatabaseReporting?: boolean;

  /**
   * Hook that allows adding custom span attributes based on the data
   * returned from "query" Pg actions.
   *
   * @default undefined
   */
  responseHook?: PgInstrumentationExecutionResponseHook;

  /**
   * If true, requires a parent span to create new spans.
   *
   * @default false
   */
  requireParentSpan?: boolean;
}
