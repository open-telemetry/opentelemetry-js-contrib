/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface AnthropicInstrumentationConfig extends InstrumentationConfig {
  /**
   * Capture potentially sensitive message, system instruction, tool call, and
   * thinking content. Disabled by default.
   */
  captureMessageContent?: boolean;
}
