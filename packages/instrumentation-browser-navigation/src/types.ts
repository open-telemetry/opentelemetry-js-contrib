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
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { LogRecord } from '@opentelemetry/api-logs';

/**
 * BrowserNavigationInstrumentationConfig
 */
export interface BrowserNavigationInstrumentationConfig
  extends InstrumentationConfig {
  applyCustomLogRecordData?: ApplyCustomLogRecordDataFunction;
  /** Use the Navigation API navigate event if available (experimental) */
  useNavigationApiIfAvailable?: boolean;
  /** Custom function to sanitize URLs before adding to log records */
  sanitizeUrl?: SanitizeUrlFunction;
}

export interface ApplyCustomLogRecordDataFunction {
  (logRecord: LogRecord): void;
}

export interface SanitizeUrlFunction {
  (url: string): string;
}

export type NavigationType = 'push' | 'replace' | 'reload' | 'traverse';
