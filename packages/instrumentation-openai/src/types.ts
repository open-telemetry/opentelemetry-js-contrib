/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { GenAIInstrumentationConfig } from '@opentelemetry/genai-util';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface OpenAIInstrumentationConfig
  extends InstrumentationConfig,
    GenAIInstrumentationConfig {}
