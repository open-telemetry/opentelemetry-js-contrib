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

import type * as api from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

// Captures connection related span data
export interface SpanConnectionConfig {
  serviceName?: string;
  connectString?: string;
  hostName?: string;
  port?: number;
  user?: string;
  protocol?: string;
  instanceName?: string;
  serverMode?: string;
  pdbName?: string;
  poolMin?: number;
  poolMax?: number;
  poolIncrement?: number;
}

export interface OracleRequestHookInformation {
  inputArgs: any;
  connection: SpanConnectionConfig;
}

export interface OracleInstrumentationExecutionRequestHook {
  (span: api.Span, queryInfo: OracleRequestHookInformation): void;
}

export interface OracleResponseHookInformation {
  data: any; // the result of sql execution.
}

export interface OracleInstrumentationExecutionResponseHook {
  (span: api.Span, resultInfo: OracleResponseHookInformation): void;
}

export interface OracleInstrumentationConfig extends InstrumentationConfig {
  /**
   * If true, an attribute containing the execute method
   * bind values will be attached the spans generated.
   * It can potentially record PII data and should be used with caution.
   *
   * @default false
   */
  enhancedDatabaseReporting?: boolean;

  /**
   * If true, db.statement will have sql which could potentially contain
   * sensitive unparameterized data in the spans generated.
   *
   * @default false
   */
  dbStatementDump?: boolean;

  /**
   * Hook that allows adding custom span attributes or updating the
   * span's name based on the data about the query to execute.
   *
   * @default undefined
   */
  requestHook?: OracleInstrumentationExecutionRequestHook;

  /**
   * Hook that allows adding custom span attributes based on the data
   * returned from "execute" actions.
   *
   * @default undefined
   */
  responseHook?: OracleInstrumentationExecutionResponseHook;

  /**
   * If true, requires a parent span to create new spans.
   *
   * @default false
   */
  requireParentSpan?: boolean;
}
