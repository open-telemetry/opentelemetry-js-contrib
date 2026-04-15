/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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
