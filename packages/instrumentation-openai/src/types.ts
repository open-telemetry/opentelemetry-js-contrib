/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContentCaptureMode } from '@opentelemetry/genai-util';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface OpenAIInstrumentationConfig extends InstrumentationConfig {
  /**
   * Controls capture of prompt, completion, and tool-call content. Defaults to
   * `'none'`. Use `'span_only'` to record content on span attributes.
   *
   * For backward compatibility, `true` is treated as `'span_only'` and `false`
   * as `'none'`.
   *
   * The environment variable `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`
   * is also honored (see `@opentelemetry/genai-util`); boolean `true`/`false`
   * there maps to `'span_only'` / `'none'` when read by this instrumentation.
   */
  captureMessageContent?: ContentCaptureMode | boolean;
}
