/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface OpenAIInstrumentationConfig extends InstrumentationConfig {
  /**
   * Set to true to enable capture of content data, such as prompt and
   * completion content, tool call function arguments, etc. By default, this is
   * `false` to avoid possible exposure of sensitive data. This can also be set
   * via the `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`
   * environment variable.
   */
  captureMessageContent?: boolean;
}
