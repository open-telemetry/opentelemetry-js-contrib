/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface LlamaIndexInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether to capture prompt inputs, output messages, and retrieved document contents.
   * Opt-in for privacy; defaults to false.
   * Can also be enabled via the OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT environment variable.
   */
  captureContent?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GenericFunction = (...args: any[]) => any;

export type SafeFunction<T extends GenericFunction> = (
  ...args: Parameters<T>
) => ReturnType<T> | null;

export type ObjectWithModel = { model?: string };
