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
import { SeverityNumber } from '@opentelemetry/api-logs';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type LogHookFunction = (
  span: Span,
  record: Record<string, string>
) => void;

export interface ConsoleInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether to disable the automatic sending of log records to the
   * OpenTelemetry Logs SDK.
   * @default false
   */
  disableLogSending?: boolean;

  /**
   * Control minimum severity level for log sending. Logs will be sent for the
   * specified severity and higher.
   * @default SeverityNumber.UNSPECIFIED (send all)
   */
  logSeverity?: SeverityNumber;

  /**
   * Whether to disable the injection of trace-context fields, and possibly
   * other fields from `logHook()`, into log record attributes for log
   * correlation.
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

/** Console methods to instrument and their severity mappings. */
export const CONSOLE_METHODS: Record<string, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  log: SeverityNumber.INFO,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  dir: SeverityNumber.INFO,
};

/** Severity text labels for console methods. */
export const CONSOLE_SEVERITY_TEXT: Record<string, string> = {
  trace: 'TRACE',
  debug: 'DEBUG',
  log: 'INFO',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  dir: 'INFO',
};
