/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { type LogRecord } from '@opentelemetry/api';

/**
 * BrowserNavigationInstrumentationConfig
 */
export interface BrowserNavigationInstrumentationConfig
  extends InstrumentationConfig {
  applyCustomLogRecordData?: ApplyCustomLogRecordDataFunction;
  /** Use the Navigation API navigate event if available (experimental) */
  useNavigationApiIfAvailable?: boolean;
  /**
   * Custom function to sanitize URLs before adding to log records.
   *
   * **Warning:** providing this function fully replaces the default
   * redaction of credentials and of the sensitive query string values from
   * the URL semantic conventions. It is called with the raw, unredacted URL
   * and its return value is recorded as-is. To keep the default redaction,
   * use `defaultSanitizeUrl` or call it from your own function.
   */
  sanitizeUrl?: SanitizeUrlFunction;
}

export interface ApplyCustomLogRecordDataFunction {
  (logRecord: LogRecord): void;
}

export interface SanitizeUrlFunction {
  (url: string): string;
}

export type NavigationType = 'push' | 'replace' | 'reload' | 'traverse';
