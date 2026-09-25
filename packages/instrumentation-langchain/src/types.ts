/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface LangChainInstrumentationConfig extends InstrumentationConfig {
  /**
   * Set to 'span_only' to capture prompt and completion content on spans.
   * Defaults to 'none' to avoid possible exposure of sensitive data.
   */
  captureMessageContent?: 'span_only' | 'none';
}
