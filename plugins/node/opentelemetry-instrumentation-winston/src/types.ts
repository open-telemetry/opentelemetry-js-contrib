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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LogHookFunction = (span: Span, record: Record<string, any>) => void;

export interface WinstonInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether to enable the automatic sending of log records to the
   * OpenTelemetry Logs SDK.
   * @default false
   */
  enableLogSending?: boolean;

  /**
   * Whether to disable the injection trace-context fields, and possibly other
   * fields from `logHook()`, into log records for log correlation.
   * @default false
   */
  disableLogCorrelation?: boolean;

  /**
   * A function that allows injecting additional fields in log records. It is
   * called, as `logHook(span, record)`, for each log record emitted in a valid
   * span context. It requires `disableLogCorrelation` to be false.
   */
  logHook?: LogHookFunction;
}
