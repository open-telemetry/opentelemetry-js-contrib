/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface LangChainInstrumentationConfig extends InstrumentationConfig {
  /**
   * Set to true to enable capture of content data, such as prompt and
   * completion content, tool call function arguments, etc. By default, this is
   * `false` to avoid possible exposure of sensitive data.
   */
  captureMessageContent?: boolean;
}
