/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface ClaudeAgentSDKInstrumentationConfig
  extends InstrumentationConfig {
  /**
   * Capture prompts, results, system instructions, and tool arguments/results.
   *
   * @default false
   */
  captureMessageContent?: boolean;
}
