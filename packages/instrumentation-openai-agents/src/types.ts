/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { GenAIInstrumentationConfig } from './semconv';

export interface OpenAIAgentsInstrumentationConfig
  extends InstrumentationConfig,
    GenAIInstrumentationConfig {
  /**
   * Controls capturing of prompts, completions, system instructions, tool
   * definitions, and function tool arguments and results.
   * - `'none'`: no content captured (default).
   * - `'span_only'`: content captured on span attributes.
   *
   * Can also be set with the `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`
   * environment variable (`span_only` or `none`).
   */
  captureMessageContent?: GenAIInstrumentationConfig['captureMessageContent'];

  /**
   * Replace the OpenAI Agents SDK trace processors with the OpenTelemetry
   * processor. By default the SDK's native OpenAI trace exporter is preserved.
   */
  disableOpenAITraceExport?: boolean;
}
