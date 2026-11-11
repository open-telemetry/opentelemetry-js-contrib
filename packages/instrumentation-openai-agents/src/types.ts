/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface OpenAIAgentsInstrumentationConfig
  extends InstrumentationConfig {
  /**
   * Capture function tool arguments and results. This is disabled by default
   * because the values may contain sensitive information. It can also be set
   * with OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT.
   */
  captureMessageContent?: boolean;

  /**
   * Replace the OpenAI Agents SDK trace processors with the OpenTelemetry
   * processor. By default the SDK's native OpenAI trace exporter is preserved.
   */
  disableOpenAITraceExport?: boolean;
}
