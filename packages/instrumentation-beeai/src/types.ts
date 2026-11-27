/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { GenAIInstrumentationConfig } from '@opentelemetry/genai-util';

/**
 * Configuration options for {@link BeeAIInstrumentation}.
 *
 * Combines standard OpenTelemetry {@link InstrumentationConfig} (`enabled`)
 * with {@link GenAIInstrumentationConfig} (`captureMessageContent`).
 */
export interface BeeAIInstrumentationConfig
  extends InstrumentationConfig,
    GenAIInstrumentationConfig {}
