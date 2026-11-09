/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContentCaptureMode } from '@opentelemetry/genai-util';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface OpenAIInstrumentationConfig extends InstrumentationConfig {
  /**
   * Controls capturing of prompt, completion, and tool call contents.
   *
   * - `'none'`: no message content is captured (default).
   * - `'span_only'`: message content is recorded as JSON on span attributes
   *   (`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`).
   *
   * Can also be set via `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`
   * (`none`, `span_only`, or legacy `true` / `false` strings).
   */
  captureMessageContent?: ContentCaptureMode;
}
